import { useEffect, useMemo, useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useCreateMode } from '@/features/create-mode/model/useCreateMode';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import WYSIWYGEditor from '@/shared/components/WYSIWYGEditor';
import { useCreateWorkspace } from '@/shared/hooks/useCreateWorkspace';
import { useCreateAttachments } from '@/shared/hooks/useCreateAttachments';
import { useExecutorConfig } from '@/shared/hooks/useExecutorConfig';
import { saveProjectRepoDefaults } from '@/shared/hooks/useProjectRepoDefaults';
import { getSortedExecutorVariantKeys } from '@/shared/lib/executor';
import {
  toPrettyCase,
  splitMessageToTitleDescription,
} from '@/shared/lib/string';
import type { BaseCodingAgent } from 'shared/types';
import { CreateChatBox } from '@vibe/ui/components/CreateChatBox';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { ComposerChipRow, useAutoAttachMostRecent } from './ComposerChipRow';
import { LandingContextSection } from './LandingContextSection';
import { ModelSelectorContainer } from '@/shared/components/ModelSelectorContainer';
import { ProviderModelPicker } from '@/shared/components/ProviderModelPicker';
import {
  useWorkspacePickerSelection,
  seedWorkspacePicker,
  writeLastUsed,
  resolveDefaultSelection,
} from '@/shared/hooks/useWorkspacePickerSelection';
import { useProviders } from '@/shared/hooks/useProviders';

interface CreateChatBoxContainerProps {
  onWorkspaceCreated: (workspaceId: string) => void;
}

export function CreateChatBoxContainer({
  onWorkspaceCreated,
}: CreateChatBoxContainerProps) {
  const { t } = useTranslation('common');
  const { profiles, config } = useUserSystem();
  const {
    repos,
    targetBranches,
    message,
    setMessage,
    clearDraft,
    hasInitialValue,
    linkedIssue,
    clearLinkedIssue,
    preferredExecutorConfig,
    executorConfig: draftConfig,
    setExecutorConfig: setDraftConfig,
    attachments: draftAttachments,
    setAttachments: setDraftAttachments,
    useWorktree,
  } = useCreateMode();

  // Auto-attach the most recently used repo as primary when composer mounts
  // with no attached repos.
  useAutoAttachMostRecent();

  const { createWorkspace } = useCreateWorkspace();
  const { data: providers = [] } = useProviders();
  const {
    selectedProviderId,
    selectedModelId,
    selectedReasoningId,
    preferredEffortId,
    setSelection,
    setPreferredEffort,
  } = useWorkspacePickerSelection(undefined);
  const hasSelectedRepos = repos.length > 0;
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Attachment handling - insert markdown and track attachment IDs
  const handleInsertMarkdown = useCallback(
    (markdown: string) => {
      const newMessage = message.trim()
        ? `${message}\n\n${markdown}`
        : markdown;
      setMessage(newMessage);
    },
    [message, setMessage]
  );

  const { uploadFiles, getAttachmentIds, clearAttachments, localAttachments } =
    useCreateAttachments(
      handleInsertMarkdown,
      draftAttachments,
      setDraftAttachments
    );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        uploadFiles(acceptedFiles);
      }
    },
    [uploadFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: createWorkspace.isPending || !hasSelectedRepos,
    noClick: true,
    noKeyboard: true,
  });

  const scratchConfig = useMemo(() => {
    if (!hasInitialValue) return undefined; // still loading
    return draftConfig ?? null;
  }, [hasInitialValue, draftConfig]);

  const {
    executorConfig,
    effectiveExecutor,
    selectedVariant,
    executorOptions,
    variantOptions,
    presetOptions,
    setOverrides: setExecutorOverrides,
  } = useExecutorConfig({
    profiles,
    lastUsedConfig: preferredExecutorConfig,
    scratchConfig,
    configExecutorProfile: config?.executor_profile,
    onPersist: (cfg) => setDraftConfig(cfg),
  });

  // Auto-seed the new-session picker from last-used (or hardcoded fallback)
  // so the pill reflects what will actually be sent on first message.
  useEffect(() => {
    if (selectedProviderId || selectedModelId) return;
    const resolved = resolveDefaultSelection(providers);
    if (!resolved) return;
    setSelection(resolved.providerId, resolved.modelId, resolved.reasoningId);
    setPreferredEffort(resolved.preferredEffortId);
    setExecutorOverrides({
      model_id: resolved.modelId,
      reasoning_id: resolved.reasoningId ?? null,
    });
  }, [
    providers,
    selectedProviderId,
    selectedModelId,
    setSelection,
    setPreferredEffort,
    setExecutorOverrides,
  ]);

  const repoId = repos.length === 1 ? repos[0]?.id : undefined;

  const hasSelectedBranchesForAllRepos = repos.every(
    (repo) => !repo.is_git || !!targetBranches[repo.id]
  );

  // Determine if we can submit
  const canSubmit =
    hasSelectedRepos &&
    hasSelectedBranchesForAllRepos &&
    message.trim().length > 0 &&
    effectiveExecutor !== null;

  const handlePresetSelect = (presetId: string | null) => {
    if (!effectiveExecutor) return;
    setDraftConfig({
      ...draftConfig,
      executor: effectiveExecutor,
      variant: presetId,
    });
  };

  const handleCustomise = () => {
    SettingsDialog.show({ initialSection: 'agents' });
  };

  // Handle executor change - use saved variant if switching to default executor
  const handleExecutorChange = useCallback(
    (executor: BaseCodingAgent) => {
      const executorProfile = profiles?.[executor];
      if (!executorProfile) {
        setDraftConfig({ executor, variant: null });
        return;
      }

      const variants = getSortedExecutorVariantKeys(executorProfile);
      let targetVariant: string | null = null;

      // If switching to user's default executor, use their saved variant
      if (
        config?.executor_profile?.executor === executor &&
        config?.executor_profile?.variant
      ) {
        const savedVariant = config.executor_profile.variant;
        if (variants.includes(savedVariant)) {
          targetVariant = savedVariant;
        }
      }

      // Fallback to DEFAULT or first available
      if (!targetVariant) {
        targetVariant = variants.includes('DEFAULT')
          ? 'DEFAULT'
          : (variants[0] ?? null);
      }

      setDraftConfig({ executor, variant: targetVariant });
    },
    [profiles, setDraftConfig, config?.executor_profile]
  );

  // Handle submit
  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmit || !executorConfig) return;

    const { title } = splitMessageToTitleDescription(message);
    const data = {
      executor_config: executorConfig,
      name: title,
      prompt: message,
      repos: repos.map((r) => ({
        repo_id: r.id,
        target_branch: targetBranches[r.id] ?? '',
      })),
      linked_issue: linkedIssue
        ? {
            remote_project_id: linkedIssue.remoteProjectId,
            issue_id: linkedIssue.issueId,
          }
        : null,
      attachment_ids: getAttachmentIds(),
      use_worktree: useWorktree,
      selected_provider_id: selectedProviderId ?? undefined,
    };
    const linkToIssue = linkedIssue
      ? {
          remoteProjectId: linkedIssue.remoteProjectId,
          issueId: linkedIssue.issueId,
        }
      : undefined;

    const result = await createWorkspace.mutateAsync({
      data,
      linkToIssue,
    });

    if (result.workspace) {
      if (selectedProviderId && selectedModelId) {
        writeLastUsed({
          providerId: selectedProviderId,
          modelId: selectedModelId,
          preferredEffortId,
        });
      }
      seedWorkspacePicker(result.workspace.id);
      onWorkspaceCreated(result.workspace.id);
    }

    if (linkedIssue?.remoteProjectId) {
      saveProjectRepoDefaults(linkedIssue.remoteProjectId, data.repos).catch(
        (err) => console.warn('Failed to save project repo defaults:', err)
      );
    }

    clearAttachments();
    await clearDraft();
  }, [
    canSubmit,
    executorConfig,
    message,
    repos,
    targetBranches,
    createWorkspace,
    onWorkspaceCreated,
    getAttachmentIds,
    clearAttachments,
    clearDraft,
    linkedIssue,
    useWorktree,
    selectedProviderId,
    selectedModelId,
    preferredEffortId,
  ]);

  // Determine error to display
  const displayError =
    hasAttemptedSubmit && repos.length === 0
      ? 'Add at least one repository to create a workspace'
      : hasAttemptedSubmit && !hasSelectedBranchesForAllRepos
        ? 'Select a branch for every repository before creating a workspace'
        : createWorkspace.error
          ? createWorkspace.error instanceof Error
            ? createWorkspace.error.message
            : 'Failed to create workspace'
          : null;

  // Wait for initial value to be applied before rendering
  // This ensures the editor mounts with content ready, so autoFocus works correctly
  if (!hasInitialValue) {
    return null;
  }

  return (
    <div className="relative flex flex-1 flex-col bg-primary h-full min-w-0">
      <div className="flex flex-1 flex-col pb-[12px] min-w-0">
        <div className="flex justify-center pt-[18vh]">
          <div className="w-chat max-w-full px-[35px]">
            <div className="flex flex-col gap-base">
              <LandingContextSection />
            </div>
          </div>
        </div>
        <div className="mt-auto flex justify-center @container">
          <div className="w-chat max-w-full px-[35px]">
            <CreateChatBox
              editor={{
                value: message,
                onChange: setMessage,
              }}
              renderEditor={({
                value,
                onChange,
                onCmdEnter,
                repoIds,
                repoId,
                executor,
                onPasteFiles,
                localAttachments,
              }) => (
                // Editor stays enabled even without repos selected so the
                // user can start typing immediately. canSubmit / displayError
                // gate the actual submit on hasSelectedRepos.
                <WYSIWYGEditor
                  placeholder={t('createMode.placeholder.typeForCommands')}
                  value={value}
                  onChange={onChange}
                  onCmdEnter={onCmdEnter}
                  disabled={false}
                  // !cursor-text overrides any inherited copy/drag cursor
                  // from the surrounding dropzone wrapper on macOS.
                  className="min-h-double max-h-[10rem] overflow-y-auto !cursor-text"
                  repoIds={repoIds}
                  repoId={repoId}
                  executor={executor}
                  autoFocus
                  onPasteFiles={onPasteFiles}
                  localAttachments={localAttachments}
                  sendShortcut={config?.send_message_shortcut}
                />
              )}
              onSend={handleSubmit}
              isSending={createWorkspace.isPending}
              disabled={!hasSelectedRepos}
              executor={{
                selected: effectiveExecutor,
                options: executorOptions,
                onChange: handleExecutorChange,
              }}
              formatExecutorLabel={toPrettyCase}
              error={displayError}
              repoIds={repos.map((r) => r.id)}
              repoId={repoId}
              modelSelector={
                effectiveExecutor ? (
                  <ProviderModelPicker
                    selectedProviderId={selectedProviderId}
                    selectedModelId={selectedModelId}
                    selectedReasoningId={selectedReasoningId}
                    preferredEffortId={preferredEffortId}
                    onManageProviders={() =>
                      SettingsDialog.show({ initialSection: 'providers' })
                    }
                    onSelectionChange={(providerId, modelId, reasoningId) => {
                      setSelection(providerId, modelId, reasoningId);
                      setExecutorOverrides({
                        model_id: modelId,
                        reasoning_id: reasoningId ?? null,
                      });
                    }}
                    onPreferredEffortChange={setPreferredEffort}
                  />
                ) : undefined
              }
              modelSelectorLeft={
                effectiveExecutor ? (
                  <ModelSelectorContainer
                    slot="left"
                    agent={effectiveExecutor}
                    workspaceId={undefined}
                    onAdvancedSettings={handleCustomise}
                    presets={variantOptions}
                    selectedPreset={selectedVariant}
                    onPresetSelect={handlePresetSelect}
                    onOverrideChange={setExecutorOverrides}
                    executorConfig={executorConfig}
                    presetOptions={presetOptions}
                  />
                ) : undefined
              }
              onPasteFiles={uploadFiles}
              localAttachments={localAttachments}
              dropzone={{ getRootProps, getInputProps, isDragActive }}
              chipRow={
                <ComposerChipRow disabled={createWorkspace.isPending} />
              }
              linkedIssue={
                linkedIssue?.simpleId
                  ? {
                      simpleId: linkedIssue.simpleId,
                      title: linkedIssue.title ?? '',
                      onRemove: clearLinkedIssue,
                    }
                  : null
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
