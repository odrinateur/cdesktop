// liveSessionFollower.ts — Layer 3 of the instant-session-switch design.
//
// Background controller that observes the workspace stream and, for every
// workspace currently running, keeps the session-list and per-process WSs
// open in the background, mirroring data into the Layer 2 snapshot cache
// and Layer 1 entries cache. By the time the user switches back to a
// running session, the caches already hold the latest entries and the
// active view paints synchronously.
//
// Vanilla, non-React. Lifecycle (start/stop) is owned by a single
// useEffect in LiveSessionFollowerProvider.tsx.
import type { ExecutionProcess, PatchType } from 'shared/types';
import { ExecutionProcessStatus } from 'shared/types';
import { streamJsonPatchObject } from '@/shared/lib/streamJsonPatchObject';
import { streamJsonPatchEntries } from '@/shared/lib/streamJsonPatchEntries';
import { setSessionSnapshot } from './sessionSnapshotCache';
import { setCachedEntries } from './executionProcessEntriesCache';

const DEFAULT_MAX_FOLLOWED = 8;
const DEFAULT_MAX_ENTRIES_PER_PROCESS = 1000;

interface RunningWorkspaceLike {
  id: string;
  isRunning?: boolean;
}

interface SessionWsState {
  execution_processes: Record<string, ExecutionProcess>;
}

interface ProcessCtrl {
  close(): void;
}

interface FollowedSession {
  sessionCtrl: ProcessCtrl;
  processCtrls: Map<string, ProcessCtrl>;
  /**
   * Processes that have already emitted `finished:true`. We do not
   * re-open watchers for these, even if a later patch shows them in
   * any other state — finished is terminal in our model.
   */
  finalized: Set<string>;
  /**
   * Processes whose entry buffer exceeded the cap. We dropped the
   * watcher and stopped mirroring; on switch the active view falls
   * back to a full re-fetch via the existing per-process path.
   */
  truncated: Set<string>;
}

export interface LiveSessionFollowerOptions {
  /** Resolves a workspace's most-recently-used session id (or undefined). */
  resolveSessionByWorkspace(workspaceId: string): Promise<string | undefined>;
  /** Builds the URL for a session-list WS for the given session id. */
  buildSessionWsUrl(sessionId: string): string;
  /** Builds the URL for a per-process entry stream WS. */
  buildProcessWsUrl(executionProcess: ExecutionProcess): string;
  /** Cap on concurrently-followed sessions; LRU eviction beyond this. */
  maxFollowed?: number;
  /** Cap on buffered entries per followed process before truncation. */
  maxEntriesPerProcess?: number;
}

export class LiveSessionFollower {
  private active = new Map<string, FollowedSession>();
  /**
   * Workspace → session mapping for currently-followed sessions. Relies on
   * the schema invariant that `sessions.workspace_id` is a single FK
   * (one session belongs to exactly one workspace), so the inverse
   * sessionId → workspaceId is also 1:1 and `stopSession(sid)` won't
   * orphan a still-active workspace.
   */
  private workspaceToSession = new Map<string, string>();
  private currentRunningWorkspaceIds = new Set<string>();
  /** Sessions in MRU order; tail is most-recent. */
  private lru: string[] = [];

  constructor(private opts: LiveSessionFollowerOptions) {}

  reconcile(workspaces: RunningWorkspaceLike[]): void {
    const running = workspaces.filter((w) => w.isRunning);
    const runningIds = new Set(running.map((w) => w.id));
    this.currentRunningWorkspaceIds = runningIds;

    // Stop following sessions whose workspace is no longer running.
    for (const [workspaceId, sessionId] of [
      ...this.workspaceToSession.entries(),
    ]) {
      if (!runningIds.has(workspaceId)) {
        this.workspaceToSession.delete(workspaceId);
        if (this.active.has(sessionId)) this.stopSession(sessionId);
      }
    }

    // Resolve sessionIds for every running workspace, even those we're
    // already following. The resolver dedupes via React Query's `staleTime`,
    // so this is a free cache read most of the time. We re-resolve on every
    // reconcile so we can detect when a workspace's most-recently-used
    // session has changed (e.g. user created a new session in the same
    // workspace) and swap which session we follow.
    for (const w of running) {
      void this.opts.resolveSessionByWorkspace(w.id).then(
        (sessionId) => {
          if (!sessionId) return;
          if (!this.currentRunningWorkspaceIds.has(w.id)) return;
          const existing = this.workspaceToSession.get(w.id);
          if (existing === sessionId) return;
          if (existing && this.active.has(existing)) {
            this.stopSession(existing);
          }
          this.workspaceToSession.set(w.id, sessionId);
          if (!this.active.has(sessionId)) this.openSession(sessionId);
          this.applyCap();
        },
        () => {
          // Resolution failed — silently skip; next reconcile will retry.
        }
      );
    }
  }

  /**
   * Push-driven re-resolution. Call when an out-of-band signal (e.g. a
   * React Query `workspaceSessions` cache update from useCreateSession's
   * invalidation) suggests a workspace's most-recently-used session may
   * have changed. Idempotent — if `latestSessionId` matches what we're
   * already following, this is a no-op.
   */
  notifyWorkspaceSessionsChanged(
    workspaceId: string,
    latestSessionId: string | undefined
  ): void {
    if (!this.currentRunningWorkspaceIds.has(workspaceId)) return;
    if (!latestSessionId) return;
    const existing = this.workspaceToSession.get(workspaceId);
    if (existing === latestSessionId) return;
    if (existing && this.active.has(existing)) {
      this.stopSession(existing);
    }
    this.workspaceToSession.set(workspaceId, latestSessionId);
    if (!this.active.has(latestSessionId)) this.openSession(latestSessionId);
    this.applyCap();
  }

  stopAll(): void {
    for (const sessionId of [...this.active.keys()]) {
      this.stopSession(sessionId);
    }
    this.workspaceToSession.clear();
    this.currentRunningWorkspaceIds.clear();
    this.lru = [];
  }

  private openSession(sessionId: string): void {
    if (this.active.has(sessionId)) return;

    const followed: FollowedSession = {
      // Filled in synchronously below.
      sessionCtrl: { close() {} },
      processCtrls: new Map(),
      finalized: new Set(),
      truncated: new Set(),
    };

    const url = this.opts.buildSessionWsUrl(sessionId);
    const ctrl = streamJsonPatchObject<SessionWsState>(url, {
      initial: () => ({ execution_processes: {} }),
      onPatch: (data) => {
        // Guard against stale buffered patches for other sessions.
        const processes = Object.values(data.execution_processes).filter(
          (p) => p.session_id === sessionId
        );
        setSessionSnapshot(sessionId, processes);
        this.reconcileProcessWatchers(sessionId, followed, processes);
        this.touchLru(sessionId);
      },
      onError: () => {
        // Per the plan's retry policy: drop on transient error and
        // wait for the next reconcile to re-add.
        this.stopSession(sessionId);
      },
    });
    followed.sessionCtrl = ctrl;
    this.active.set(sessionId, followed);
    this.touchLru(sessionId);
  }

  private reconcileProcessWatchers(
    sessionId: string,
    followed: FollowedSession,
    processes: ExecutionProcess[]
  ): void {
    const runningProcesses = processes.filter(
      (p) =>
        p.status === ExecutionProcessStatus.running &&
        !p.dropped &&
        // Devserver entries aren't rendered in the chat (filtered out
        // upstream by useConversationHistory's run_reason allowlist), so
        // we'd be burning watcher slots and Layer 1 cache writes for
        // nothing.
        p.run_reason !== 'devserver'
    );
    const runningIds = new Set(runningProcesses.map((p) => p.id));

    // Open watchers for newly-running processes.
    for (const p of runningProcesses) {
      if (followed.processCtrls.has(p.id)) continue;
      if (followed.finalized.has(p.id)) continue;
      if (followed.truncated.has(p.id)) continue;
      this.openProcessWatcher(sessionId, followed, p);
    }

    // Close watchers for processes that are no longer running. If the
    // process emitted `finished:true` we already closed and finalized
    // it inside the watcher; this branch handles dropped-or-disappeared.
    for (const [id, c] of [...followed.processCtrls.entries()]) {
      if (!runningIds.has(id)) {
        c.close();
        followed.processCtrls.delete(id);
      }
    }
  }

  private openProcessWatcher(
    sessionId: string,
    followed: FollowedSession,
    ep: ExecutionProcess
  ): void {
    const cap =
      this.opts.maxEntriesPerProcess ?? DEFAULT_MAX_ENTRIES_PER_PROCESS;
    const url = this.opts.buildProcessWsUrl(ep);
    const ctrl = streamJsonPatchEntries<PatchType>(url, {
      onEntries: (entries) => {
        if (entries.length > cap) {
          // Truncate: discard buffered tail and stop mirroring this
          // process. Active view will full-fetch on next switch.
          const c = followed.processCtrls.get(ep.id);
          if (c) {
            c.close();
            followed.processCtrls.delete(ep.id);
          }
          followed.truncated.add(ep.id);
          return;
        }
        setCachedEntries(ep.id, entries);
      },
      onFinished: (entries) => {
        // Final canonical write before we stop mirroring this process.
        // The "follower stops on finished" rule lives here.
        setCachedEntries(ep.id, entries);
        followed.finalized.add(ep.id);
        const c = followed.processCtrls.get(ep.id);
        if (c) {
          c.close();
          followed.processCtrls.delete(ep.id);
        }
      },
      onError: () => {
        const c = followed.processCtrls.get(ep.id);
        if (c) {
          c.close();
          followed.processCtrls.delete(ep.id);
        }
      },
    });
    followed.processCtrls.set(ep.id, ctrl);
    // Touch LRU so a session actively producing entries stays warm.
    this.touchLru(sessionId);
  }

  private stopSession(sessionId: string): void {
    const f = this.active.get(sessionId);
    if (!f) return;
    for (const c of f.processCtrls.values()) c.close();
    f.processCtrls.clear();
    f.sessionCtrl.close();
    this.active.delete(sessionId);
    const idx = this.lru.indexOf(sessionId);
    if (idx >= 0) this.lru.splice(idx, 1);
  }

  private touchLru(sessionId: string): void {
    const idx = this.lru.indexOf(sessionId);
    if (idx >= 0) this.lru.splice(idx, 1);
    this.lru.push(sessionId);
  }

  private applyCap(): void {
    const cap = this.opts.maxFollowed ?? DEFAULT_MAX_FOLLOWED;
    while (this.active.size > cap) {
      // LRU head is least-recently-used.
      const evict = this.lru.shift();
      if (!evict) break;
      if (!this.active.has(evict)) continue;
      this.stopSession(evict);
      // Also forget the workspace mapping so a future reconcile re-resolves.
      for (const [wid, sid] of [...this.workspaceToSession.entries()]) {
        if (sid === evict) this.workspaceToSession.delete(wid);
      }
    }
  }
}
