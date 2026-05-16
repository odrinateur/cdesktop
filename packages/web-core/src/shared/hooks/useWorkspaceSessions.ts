import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useJsonPatchWsStream } from '@/shared/hooks/useJsonPatchWsStream';
import { useHostId } from '@/shared/providers/HostIdProvider';
import { workspaceSessionKeys } from '@/shared/hooks/workspaceSessionKeys';
import type { Session } from 'shared/types';

interface UseWorkspaceSessionsOptions {
  enabled?: boolean;
}

/** Discriminated union for session selection state */
export type SessionSelection =
  | { mode: 'existing'; sessionId: string }
  | { mode: 'new' };

interface UseWorkspaceSessionsResult {
  sessions: Session[];
  selectedSession: Session | undefined;
  selectedSessionId: string | undefined;
  selectSession: (sessionId: string) => void;
  selectLatestSession: () => void;
  isLoading: boolean;
  /** Whether user is creating a new session */
  isNewSessionMode: boolean;
  /** Enter new session mode */
  startNewSession: () => void;
}

type SessionsState = {
  sessions: Record<string, Session>;
};

/**
 * Hook for managing sessions within a workspace.
 *
 * Live-streams the session list via WebSocket
 * (`/api/workspaces/:id/sessions/ws`), so spawn / rename / delete from any
 * source (UI, CLI, peer agent) reflects without a manual refresh.
 *
 * Server snapshot orders sessions by most-recently-used; ordering is
 * preserved in the snapshot. Subsequent live patches do not re-sort —
 * consumers that need a different order (e.g. team pill row sorts by
 * created_at) re-sort client-side.
 */
export function useWorkspaceSessions(
  workspaceId: string | undefined,
  options: UseWorkspaceSessionsOptions = {}
): UseWorkspaceSessionsResult {
  const hostId = useHostId();
  const queryClient = useQueryClient();
  const { enabled = true } = options;
  const [selection, setSelection] = useState<SessionSelection | undefined>(
    undefined
  );
  const prevWorkspaceIdRef = useRef(workspaceId);

  const apiBasePath = hostId ? `/api/host/${hostId}` : '/api';
  const endpoint = workspaceId
    ? `${apiBasePath}/workspaces/${workspaceId}/sessions/ws`
    : undefined;

  const initialData = useCallback((): SessionsState => ({ sessions: {} }), []);

  const { data, isInitialized } = useJsonPatchWsStream<SessionsState>(
    endpoint,
    enabled && !!workspaceId,
    initialData
  );

  // The server snapshot arrives ordered by most-recently-used. Object key
  // order in JS preserves insertion order for string keys, so we can rely
  // on `Object.values(data.sessions)` to honour the snapshot order. Live
  // patches append new sessions at the end of the iteration.
  const sessions = useMemo<Session[]>(
    () => (data?.sessions ? Object.values(data.sessions) : []),
    [data]
  );

  // Mirror the live list into the React Query cache under the same key the
  // legacy useQuery used. LiveSessionFollowerProvider subscribes to that
  // cache to re-target the active session, so the bridge keeps it working
  // without any change to the follower provider.
  useEffect(() => {
    if (!workspaceId) return;
    if (!isInitialized) return;
    queryClient.setQueryData(
      workspaceSessionKeys.byWorkspace(workspaceId, hostId),
      sessions
    );
  }, [queryClient, workspaceId, hostId, sessions, isInitialized]);

  const isLoading = !!workspaceId && enabled && !isInitialized;

  // Handle workspace changes and auto-select sessions.
  //
  // Live-streaming the session list yields a new `sessions` array reference
  // on every patch. Preserve the user's current selection if it still maps
  // to a live session; only auto-pick when (a) workspace changes, (b) no
  // selection yet, or (c) the previously-selected session vanished.
  useEffect(() => {
    const workspaceChanged = prevWorkspaceIdRef.current !== workspaceId;
    prevWorkspaceIdRef.current = workspaceId;

    setSelection((prev) => {
      // Empty list: drop selection once initialised so we don't strand a
      // stale id from a different workspace.
      if (sessions.length === 0) {
        return isInitialized ? undefined : prev;
      }

      // New-session draft stays sticky inside the same workspace.
      if (prev?.mode === 'new' && !workspaceChanged) return prev;

      // Existing selection survives if (a) the user is still inside the
      // same workspace and (b) that session is still alive.
      if (
        prev?.mode === 'existing' &&
        !workspaceChanged &&
        sessions.some((s) => s.id === prev.sessionId)
      ) {
        return prev;
      }

      return { mode: 'existing', sessionId: sessions[0].id };
    });
  }, [workspaceId, sessions, isInitialized]);

  const isNewSessionMode = selection?.mode === 'new' || sessions.length === 0;
  const selectedSessionId =
    selection?.mode === 'existing' ? selection.sessionId : undefined;

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId),
    [sessions, selectedSessionId]
  );

  const selectSession = useCallback((sessionId: string) => {
    setSelection({ mode: 'existing', sessionId });
  }, []);

  const selectLatestSession = useCallback(() => {
    if (sessions.length > 0) {
      setSelection({ mode: 'existing', sessionId: sessions[0].id });
    }
  }, [sessions]);

  const startNewSession = useCallback(() => {
    setSelection({ mode: 'new' });
  }, []);

  return {
    sessions,
    selectedSession,
    selectedSessionId,
    selectSession,
    selectLatestSession,
    isLoading,
    isNewSessionMode,
    startNewSession,
  };
}
