// LiveSessionFollowerProvider.tsx — owns the LiveSessionFollower lifecycle.
//
// Mounted once near the app root, ABOVE any session-scoped tree, so it
// survives all in-app navigation. It observes useWorkspaces() (already
// streamed for the sidebar) and forwards the running set to the follower.
//
// The provider does not provide context — it's a pure side-effect host.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ExecutionProcess, Session } from 'shared/types';
import { useWorkspaces } from '@/shared/hooks/useWorkspaces';
import { useHostId } from '@/shared/providers/HostIdProvider';
import { workspaceSessionKeys } from '@/shared/hooks/workspaceSessionKeys';
import { sessionsApi } from '@/shared/lib/api';
import { LiveSessionFollower } from '@/features/workspace-chat/model/liveSessionFollower';

const SESSIONS_QUERY_KEY_PREFIX = 'workspaceSessions';

export function LiveSessionFollowerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const hostId = useHostId();
  const { workspaces } = useWorkspaces();
  const followerRef = useRef<LiveSessionFollower | null>(null);

  useEffect(() => {
    const apiBasePath = hostId ? `/api/host/${hostId}` : '/api';
    const follower = new LiveSessionFollower({
      resolveSessionByWorkspace: async (workspaceId) => {
        const sessions = await queryClient.fetchQuery<Session[]>({
          queryKey: workspaceSessionKeys.byWorkspace(workspaceId, hostId),
          queryFn: () => sessionsApi.getByWorkspace(workspaceId),
          staleTime: 30_000,
        });
        return sessions[0]?.id;
      },
      buildSessionWsUrl: (sessionId) => {
        const params = new URLSearchParams({
          session_id: sessionId,
          show_soft_deleted: 'true',
        });
        return `${apiBasePath}/execution-processes/stream/session/ws?${params.toString()}`;
      },
      buildProcessWsUrl: (ep: ExecutionProcess) => {
        if (ep.executor_action.typ.type === 'ScriptRequest') {
          return `${apiBasePath}/execution-processes/${ep.id}/raw-logs/ws`;
        }
        return `${apiBasePath}/execution-processes/${ep.id}/normalized-logs/ws`;
      },
    });
    followerRef.current = follower;
    return () => {
      follower.stopAll();
      followerRef.current = null;
    };
  }, [queryClient, hostId]);

  // Subscribe to the React Query cache for `workspaceSessions` updates so
  // we can swap the followed session if a workspace's most-recently-used
  // session changes (typical trigger: useCreateSession invalidates the
  // workspace's session list after creating a new one). Whichever
  // useWorkspaceSessions observer is active for that workspace will trigger
  // a refetch on invalidate; the cache 'updated' event then routes the
  // fresh list to the follower.
  useEffect(() => {
    const queryCache = queryClient.getQueryCache();
    const unsub = queryCache.subscribe((event) => {
      if (event.type !== 'updated') return;
      const key = event.query.queryKey;
      if (!Array.isArray(key) || key[0] !== SESSIONS_QUERY_KEY_PREFIX) return;
      // workspaceSessionKeys.byWorkspace shape: ['workspaceSessions', hostScope, workspaceId]
      const workspaceId = key[2];
      if (typeof workspaceId !== 'string') return;
      const data = event.query.state.data as Session[] | undefined;
      followerRef.current?.notifyWorkspaceSessionsChanged(
        workspaceId,
        data?.[0]?.id
      );
    });
    return () => {
      unsub();
    };
  }, [queryClient]);

  // Reconcile only when the running set actually changes (id × isRunning).
  // useWorkspaces returns a fresh array on every workspace-stream patch
  // (sort + map), so a naive `[workspaces]` dep would fire reconcile per
  // patch even when the running set is unchanged.
  const runningKey = useMemo(
    () =>
      workspaces
        .filter((w) => w.isRunning)
        .map((w) => w.id)
        .sort()
        .join(','),
    [workspaces]
  );

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  useEffect(() => {
    const reconcileInput = workspacesRef.current.map((w) => ({
      id: w.id,
      isRunning: w.isRunning ?? false,
    }));
    followerRef.current?.reconcile(reconcileInput);
  }, [runningKey]);

  return <>{children}</>;
}
