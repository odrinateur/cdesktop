// sessionSnapshotCache.ts — Layer 2 cache for instant session-switch.
//
// Holds the lightweight ExecutionProcess records (id, status, run_reason,
// created_at, dropped, etc.) most recently observed for each session,
// so that on a subsequent switch, useConversationHistory can synthesize
// `executionProcesses.current` synchronously and start cache-hitting
// per-process entries before the session-list WS has a chance to handshake.
//
// Two writers populate this cache:
//   1. ExecutionProcessesProvider — for the currently-viewed session,
//      on every WS payload.
//   2. liveSessionFollower — for every other running session, in the
//      background.
//
// The reader (useConversationHistory) consumes the cache synchronously
// during the scope-reset effect; reconciliation against fresh WS data
// happens when the active view's WS arrives.
import type { ExecutionProcess } from 'shared/types';

const cache = new Map<string, ExecutionProcess[]>();

export function getSessionSnapshot(
  sessionId: string
): ExecutionProcess[] | undefined {
  return cache.get(sessionId);
}

export function setSessionSnapshot(
  sessionId: string,
  processes: ExecutionProcess[]
): void {
  cache.set(sessionId, processes);
}

export function clearSessionSnapshot(sessionId: string): void {
  cache.delete(sessionId);
}
