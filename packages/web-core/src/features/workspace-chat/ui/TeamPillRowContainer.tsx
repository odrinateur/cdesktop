/**
 * Renders the team-pill row inline with the composer header. Owns:
 *  - Lead detection (oldest by `created_at`)
 *  - Spawn-modal open state
 *  - Rename dispatch
 *
 * Sessions come from `useWorkspaceContext` so the row reads from the
 * WorkspaceProvider's single session-list subscription instead of opening
 * its own. This matters because TeamPillRowContainer is mounted inside the
 * `<EntriesProvider key={…}>` boundary, which remounts on session switch —
 * a hook-local WS would tear down and re-snapshot on every switch, causing
 * the pill row to flash empty.
 *
 * Each multi-session pill self-subscribes to live status via
 * `TeamPillItem`. Single-session workspaces show only the `+ teammate`
 * button (from `@vibe/ui/components/TeamPillRow`).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@phosphor-icons/react';
import { TeamPillRow } from '@vibe/ui/components/TeamPillRow';
import { RenameSessionDialog } from '@vibe/ui/components/RenameSessionDialog';
import { cn } from '@vibe/ui/lib/cn';
import { sessionsApi } from '@/shared/lib/api';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
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
  const { sessions } = useWorkspaceContext();
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
        // The workspace sessions WS streams the rename back live, so no
        // manual cache invalidation needed.
        await sessionsApi.update(sessionId, { name: newName });
      },
    });
  };

  const requestDelete = (sessionId: string) => {
    const target = sorted.find((s) => s.id === sessionId);
    if (!target) return;
    const label = target.name ?? sessionId.slice(0, 8);
    if (
      !window.confirm(
        t('conversation.team.deleteConfirm', {
          name: label,
          defaultValue: `Delete teammate "${label}"? This cannot be undone.`,
        })
      )
    ) {
      return;
    }
    void sessionsApi.delete(sessionId);
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
          renameLabel={t('conversation.team.renameAction', {
            defaultValue: 'Rename',
          })}
          deleteLabel={t('conversation.team.deleteAction', {
            defaultValue: 'Delete',
          })}
          onSelect={() => onSelectSession(s.id)}
          onRequestRename={() => requestRename(s.id)}
          onRequestDelete={idx === 0 ? undefined : () => requestDelete(s.id)}
        />
      ))}
      <button
        type="button"
        onClick={() => setSpawnOpen(true)}
        aria-label={t('conversation.team.addTeammateAriaLabel')}
        title={t('conversation.team.addTeammateAriaLabel')}
        className={cn(
          'inline-flex items-center justify-center rounded-sm px-base py-half',
          'bg-secondary text-low hover:bg-panel hover:text-high transition-colors'
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
