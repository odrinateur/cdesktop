/**
 * Connects `TeamPillRow` to the workspace's session list and the spawn
 * modal. Owns the local "modal open" state; defers data to
 * `useWorkspaceSessions` and persistence to `SpawnTeammateModal`.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  TeamPillRow,
  type TeamPillSession,
} from '@vibe/ui/components/TeamPillRow';
import { RenameSessionDialog } from '@vibe/ui/components/RenameSessionDialog';
import { useHostId } from '@/shared/providers/HostIdProvider';
import { useWorkspaceSessions } from '@/shared/hooks/useWorkspaceSessions';
import { workspaceSessionKeys } from '@/shared/hooks/workspaceSessionKeys';
import { sessionsApi } from '@/shared/lib/api';
import { SpawnTeammateModal } from './SpawnTeammateModal';
import type { ExecutorConfig, ExecutorProfileId } from 'shared/types';

export interface TeamPillRowContainerProps {
  workspaceId: string;
  currentSessionId: string | undefined;
  onSelectSession: (sessionId: string) => void;
  /** Caller's most recently used executor config; seeds the spawn modal's picker. */
  lastUsedConfig: ExecutorConfig | null;
  configExecutorProfile?: ExecutorProfileId | null;
  /** Hidden in new-session draft state — caller passes false during draft. */
  visible: boolean;
}

export function TeamPillRowContainer({
  workspaceId,
  currentSessionId,
  onSelectSession,
  lastUsedConfig,
  configExecutorProfile,
  visible,
}: TeamPillRowContainerProps) {
  const { t } = useTranslation(['tasks']);
  const queryClient = useQueryClient();
  const hostId = useHostId();
  const { sessions } = useWorkspaceSessions(workspaceId);
  const [spawnOpen, setSpawnOpen] = useState(false);

  // Sort by created_at ASC so the lead (oldest) is first. The hook
  // returns sessions ordered by last-used; we re-sort here because the
  // pill row's mental model is "1 row = 1 team, lead first".
  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [sessions]
  );

  const pillSessions: TeamPillSession[] = useMemo(
    () =>
      sorted.map((s, idx) => ({
        id: s.id,
        name: s.name,
        isLead: idx === 0,
        // Backend doesn't expose per-session status on the list endpoint
        // yet — defaults to idle. v1.5 will pipe in running/errored.
        status: 'idle' as const,
      })),
    [sorted]
  );

  if (!visible) return null;

  return (
    <>
      <TeamPillRow
        sessions={pillSessions}
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession}
        onSpawnTeammate={() => setSpawnOpen(true)}
        onRequestRename={(sessionId) => {
          const target = sorted.find((s) => s.id === sessionId);
          if (!target) return;
          // RenameSessionDialog is the existing dialog used by the
          // (hidden) inner-session switcher. Re-enabled inside the team
          // context per plan.
          // `RenameSessionDialog` is a `defineModal`-wrapped component with
          // a `.show(props)` static. It captures the new name via its
          // `onRename` callback; we make the API call + cache invalidation
          // here so the dialog stays generic.
          void RenameSessionDialog.show({
            currentName: target.name ?? '',
            onRename: async (newName: string) => {
              await sessionsApi.update(sessionId, { name: newName });
              await queryClient.invalidateQueries({
                queryKey: workspaceSessionKeys.byWorkspace(workspaceId, hostId),
              });
            },
          });
        }}
        leadLabel={t('conversation.team.main')}
        addTeammateLabel={t('conversation.team.addTeammate')}
        addTeammateAriaLabel={t('conversation.team.addTeammateAriaLabel')}
      />
      <SpawnTeammateModal
        open={spawnOpen}
        onOpenChange={setSpawnOpen}
        workspaceId={workspaceId}
        lastUsedConfig={lastUsedConfig}
        configExecutorProfile={configExecutorProfile}
      />
    </>
  );
}
