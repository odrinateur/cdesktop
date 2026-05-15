/**
 * Renders the team-pill row inline with the composer header. Owns:
 *  - Session-list fetch (`useWorkspaceSessions`)
 *  - Lead detection (oldest by `created_at`)
 *  - Spawn-modal open state
 *  - Rename dispatch
 *
 * Each multi-session pill self-subscribes to live status via
 * `TeamPillItem`. Single-session workspaces show only the `+ teammate`
 * button (from `@vibe/ui/components/TeamPillRow`).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react';
import { TeamPillRow } from '@vibe/ui/components/TeamPillRow';
import { RenameSessionDialog } from '@vibe/ui/components/RenameSessionDialog';
import { cn } from '@vibe/ui/lib/cn';
import { useHostId } from '@/shared/providers/HostIdProvider';
import { useWorkspaceSessions } from '@/shared/hooks/useWorkspaceSessions';
import { workspaceSessionKeys } from '@/shared/hooks/workspaceSessionKeys';
import { sessionsApi } from '@/shared/lib/api';
import { SpawnTeammateModal } from './SpawnTeammateModal';
import { TeamPillItem } from './TeamPillItem';
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

  if (!visible) return null;

  const requestRename = (sessionId: string) => {
    const target = sorted.find((s) => s.id === sessionId);
    if (!target) return;
    void RenameSessionDialog.show({
      currentName: target.name ?? '',
      onRename: async (newName: string) => {
        await sessionsApi.update(sessionId, { name: newName });
        await queryClient.invalidateQueries({
          queryKey: workspaceSessionKeys.byWorkspace(workspaceId, hostId),
        });
      },
    });
  };

  // Single-session workspace: defer to the @vibe/ui presentational
  // component so the "+ teammate" button stays one source of truth.
  if (sorted.length <= 1) {
    return (
      <>
        <TeamPillRow
          sessions={sorted.map((s, idx) => ({
            id: s.id,
            name: s.name,
            isLead: idx === 0,
            status: 'idle' as const,
          }))}
          currentSessionId={currentSessionId}
          onSelectSession={onSelectSession}
          onSpawnTeammate={() => setSpawnOpen(true)}
          onRequestRename={requestRename}
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

  // Multi-session: each pill subscribes to its own session status stream.
  return (
    <>
      {sorted.map((s, idx) => (
        <TeamPillItem
          key={s.id}
          sessionId={s.id}
          name={s.name}
          isLead={idx === 0}
          isActive={s.id === currentSessionId}
          leadLabel={t('conversation.team.main')}
          onSelect={() => onSelectSession(s.id)}
          onContextMenu={() => requestRename(s.id)}
        />
      ))}
      <button
        type="button"
        onClick={() => setSpawnOpen(true)}
        aria-label={t('conversation.team.addTeammateAriaLabel')}
        title={t('conversation.team.addTeammateAriaLabel')}
        className={cn(
          'inline-flex items-center justify-center rounded-full',
          'border border-border bg-secondary/40 size-6',
          'text-low hover:bg-panel hover:text-high transition-colors'
        )}
      >
        <PlusIcon className="size-icon-xs" weight="bold" />
      </button>
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
