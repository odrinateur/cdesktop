/**
 * Spawn-teammate modal.
 *
 * Visually mirrors the composer card: stacked Name + Prompt fields above
 * a control rail that mounts `ModelSelectorContainer` (preset / permission /
 * model / reasoning / provider). Initial state inherits from the caller
 * session's last executor config.
 *
 * POSTs to `/api/workspaces/{id}/teammates` and surfaces structured
 * `TeammateError.code`s inline. See `plans/agent-teams-mvp.md` UI section.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/Dialog';
import { Input } from '@vibe/ui/components/Input';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import { ModelSelectorContainer } from '@/shared/components/ModelSelectorContainer';
import { sessionsApi } from '@/shared/lib/api';
import { ApiError } from '@/shared/lib/api';
import { useExecutorConfig } from '@/shared/hooks/useExecutorConfig';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useHostId } from '@/shared/providers/HostIdProvider';
import { workspaceSessionKeys } from '@/shared/hooks/workspaceSessionKeys';
import type {
  ExecutorConfig,
  ExecutorProfileId,
  SpawnTeammateRequest,
} from 'shared/types';

const MAX_NAME_LEN = 24;

export interface SpawnTeammateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Caller's most recently used executor config; seeds the picker. */
  lastUsedConfig: ExecutorConfig | null;
  /** Stable executor identity to compute presets against (falls back to lastUsedConfig.executor). */
  configExecutorProfile?: ExecutorProfileId | null;
  /** Called after successful spawn with the new session id. */
  onSpawned?: (sessionId: string) => void;
}

/** Map server-side `TeammateError.code` to a localized inline message. */
function translateTeammateError(
  t: (key: string) => string,
  err: ApiError<unknown>
): string {
  const code = parseCode(err.message);
  switch (code) {
    case 'PROVIDER_NOT_CONFIGURED':
      return t('conversation.team.errorProviderNotConfigured');
    case 'EXECUTOR_REQUIRES_PROVIDER':
      return t('conversation.team.errorExecutorRequiresProvider');
    case 'NAME_INVALID':
      return t('conversation.team.errorNameInvalid');
    case 'WORKSPACE_ARCHIVED':
      return t('conversation.team.errorWorkspaceArchived');
    case 'NOT_LEAD':
      return t('conversation.team.errorNotLead');
    default:
      return err.message || t('conversation.team.errorGeneric');
  }
}

/**
 * Server returns errors shaped like `"TeammateError: EXECUTOR_REQUIRES_PROVIDER: …"`
 * — see `ErrorInfo::with_status` in `crates/server/src/error.rs`. Parse the
 * code so we can render a localized CTA instead of the raw message.
 */
function parseCode(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/(?:TeammateError:\s*)?([A-Z_]+):/);
  return match ? match[1] : null;
}

export function SpawnTeammateModal({
  open,
  onOpenChange,
  workspaceId,
  lastUsedConfig,
  configExecutorProfile,
  onSpawned,
}: SpawnTeammateModalProps) {
  const { t } = useTranslation(['tasks']);
  const queryClient = useQueryClient();
  const hostId = useHostId();
  const { profiles } = useUserSystem();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mirror the composer's executor-config state so the modal's picker
  // behaves identically to the bottom-rail picker in SessionChatBox.
  const {
    executorConfig,
    effectiveExecutor,
    selectedVariant,
    variantOptions,
    presetOptions,
    setVariant,
    setOverrides,
  } = useExecutorConfig({
    profiles,
    lastUsedConfig,
    configExecutorProfile,
  });

  const nameTooLong = name.length > MAX_NAME_LEN;
  const canSubmit = name.trim().length > 0 && !nameTooLong;

  const mutation = useMutation({
    mutationFn: async (body: SpawnTeammateRequest) =>
      sessionsApi.spawnTeammate(workspaceId, body),
    onSuccess: (data) => {
      // Invalidate the workspace-sessions cache so the new pill appears.
      queryClient.invalidateQueries({
        queryKey: workspaceSessionKeys.byWorkspace(workspaceId, hostId),
      });
      setName('');
      setPrompt('');
      setErrorMessage(null);
      onOpenChange(false);
      onSpawned?.(data.session_id);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setErrorMessage(translateTeammateError(t, err));
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(t('conversation.team.errorGeneric'));
      }
    },
  });

  const handleSubmit = useCallback(() => {
    if (!canSubmit || mutation.isPending) return;
    setErrorMessage(null);
    const body: SpawnTeammateRequest = {
      name: name.trim(),
    };
    if (prompt.trim().length > 0) body.prompt = prompt;
    if (executorConfig) body.executor_config = executorConfig;
    mutation.mutate(body);
  }, [canSubmit, executorConfig, mutation, name, prompt]);

  const titleNode = useMemo(() => t('conversation.team.spawnTitle'), [t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleNode}</DialogTitle>
          <DialogDescription>
            {t('conversation.team.spawnDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Composer-styled body: stacked text fields above a control rail. */}
        <div className="flex flex-col gap-base px-double pb-base">
          <label className="flex flex-col gap-half">
            <span className="text-sm font-medium">
              {t('conversation.team.nameLabel')}
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[\r\n]+/g, ' '))}
              placeholder={t('conversation.team.namePlaceholder')}
              maxLength={MAX_NAME_LEN}
              aria-invalid={nameTooLong || undefined}
            />
            <span className="text-xs text-low">
              {t('conversation.team.namePlaceholderHelp')}
            </span>
          </label>

          <label className="flex flex-col gap-half">
            <span className="text-sm font-medium">
              {t('conversation.team.promptLabel')}
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('conversation.team.promptPlaceholder')}
              rows={5}
              className="rounded-sm border border-border bg-white px-base py-half text-sm dark:bg-secondary"
            />
          </label>

          {/* Control rail — mirrors the composer's bottom toolbar. */}
          {effectiveExecutor && (
            <div className="flex flex-wrap items-center gap-base border-t border-border pt-base">
              <ModelSelectorContainer
                slot="all"
                agent={effectiveExecutor}
                workspaceId={workspaceId}
                onAdvancedSettings={() => {
                  /* spawn modal: no advanced-settings link */
                }}
                presets={variantOptions}
                selectedPreset={selectedVariant}
                onPresetSelect={setVariant}
                onOverrideChange={setOverrides}
                executorConfig={executorConfig}
                presetOptions={presetOptions}
              />
            </div>
          )}

          {errorMessage && (
            <p className="rounded-sm bg-error/10 px-base py-half text-sm text-error">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <PrimaryButton
            variant="tertiary"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            value={t('conversation.team.cancel')}
          />
          <PrimaryButton
            onClick={handleSubmit}
            disabled={!canSubmit || mutation.isPending}
            actionIcon={mutation.isPending ? 'spinner' : undefined}
            value={
              mutation.isPending
                ? t('conversation.team.submitting')
                : t('conversation.team.submit')
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
