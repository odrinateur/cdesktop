import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useCreateMode } from '@/features/create-mode/model/useCreateMode';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import WYSIWYGEditor, {
  type WYSIWYGEditorRef,
} from '@/shared/components/WYSIWYGEditor';
import { useFolderSeedStore } from '@/shared/stores/useFolderSeedStore';
import { useCreateWorkspace } from '@/shared/hooks/useCreateWorkspace';
import { useCreateAttachments } from '@/shared/hooks/useCreateAttachments';
import { useExecutorConfig } from '@/shared/hooks/useExecutorConfig';
import { saveProjectRepoDefaults } from '@/shared/hooks/useProjectRepoDefaults';
import { getSortedExecutorVariantKeys } from '@/shared/lib/executor';
import {
  toPrettyCase,
  splitMessageToTitleDescription,
} from '@/shared/lib/string';
import { isAgentDefaultModelId } from '@/shared/lib/agentDefaultModel';
import type { BaseCodingAgent } from 'shared/types';
import { CreateChatBox } from '@vibe/ui/components/CreateChatBox';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { ComposerChipRow, useAutoAttachMostRecent } from './ComposerChipRow';
import { AgentIcon, getAgentName } from './AgentIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vibe/ui/components/Dropdown';
import { CheckIcon } from '@phosphor-icons/react';

const agentChipClassName =
  'inline-flex items-center gap-half rounded-md bg-secondary px-base py-half ' +
  'min-h-7 text-sm text-normal hover:bg-panel ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand';

function AgentChip({
  selected,
  options,
  onChange,
  disabled,
}: {
  selected: BaseCodingAgent | null;
  options: BaseCodingAgent[];
  onChange: (agent: BaseCodingAgent) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={agentChipClassName}
        >
          <AgentIcon agent={selected} className="h-[0.9rem] w-[0.9rem]" />
          <span className="max-w-[140px] truncate">
            {selected ? getAgentName(selected) : 'Agent'}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((agent) => (
          <DropdownMenuItem
            key={agent}
            badge={selected === agent ? <CheckIcon weight="bold" /> : undefined}
            onSelect={() => onChange(agent)}
          >
            <span className="flex items-center gap-2">
              <AgentIcon agent={agent} className="h-[0.9rem] w-[0.9rem]" />
              <span>{getAgentName(agent)}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
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
import { useModelSelectorConfig } from '@/shared/hooks/useExecutorDiscovery';
import { writeLastUsedAgent } from '@/shared/lib/lastUsedAgent';

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

  // Focus the editor when a folder seed comes in (covers the case where the
  // create page is already mounted and route navigation is a no-op).
  const editorRef = useRef<WYSIWYGEditorRef>(null);
  const pendingFolderSeedRepoId = useFolderSeedStore((s) => s.pendingRepoId);
  useEffect(() => {
    if (!pendingFolderSeedRepoId) return;
    editorRef.current?.focus();
  }, [pendingFolderSeedRepoId]);

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

  // Per-agent canonical model list (executor discovery is the source of
  // truth — Default's DB-synthesized enabledModels is Claude-only and
  // misleads downstream picker code without this substitution).
  const { config: agentModelConfig } =
    useModelSelectorConfig(effectiveExecutor);
  const agentDefaultModels = useMemo(
    () =>
      (agentModelConfig?.models ?? []).map((m) => ({
        id: m.id,
        displayName: m.name,
        ownedBy: null,
      })),
    [agentModelConfig]
  );

  // Auto-seed the new-session picker from last-used (or hardcoded fallback)
  // so the pill reflects what will actually be sent on first message. Wait
  // for agent discovery to load when an agent is active so the seeded model
  // matches that agent's canonical list (avoids a Claude→Codex flicker).
  useEffect(() => {
    if (selectedProviderId || selectedModelId) return;
    if (effectiveExecutor && agentDefaultModels.length === 0) return;
    const resolved = resolveDefaultSelection(providers, agentDefaultModels);
    if (!resolved) return;
    setSelection(resolved.providerId, resolved.modelId, resolved.reasoningId);
    setPreferredEffort(resolved.preferredEffortId);
  }, [
    providers,
    selectedProviderId,
    selectedModelId,
    effectiveExecutor,
    agentDefaultModels,
    setSelection,
    setPreferredEffort,
  ]);

  // Reset the picker when the active agent changes if the current selection
  // isn't valid for that agent. Two checks:
  //   - Provider must be Default (always passes through) or
  //     perAgentEnabled[agent] === true.
  //   - For Default, the model id must exist in the agent's canonical list,
  //     since each agent (Claude, Codex, Gemini, ...) has its own models.
  // We pass an agent-filtered providers list and the agent's canonical model
  // list to resolveDefaultSelection so its last-used branch can't re-pick the
  // now-invalid choice.
  useEffect(() => {
    if (!effectiveExecutor || !selectedProviderId) return;
    const provider = providers.find((p) => p.id === selectedProviderId);
    if (!provider) return;

    const allowedProvider =
      provider.kind === 'Default' ||
      provider.perAgentEnabled?.[effectiveExecutor] === true;

    // When discovery hasn't loaded the agent's models yet, skip — we can't
    // tell whether the current selection is valid. The agent-default
    // sentinel is always valid on the Default provider.
    const allowedModel =
      provider.kind !== 'Default' ||
      agentDefaultModels.length === 0 ||
      isAgentDefaultModelId(selectedModelId) ||
      agentDefaultModels.some((m) => m.id === selectedModelId);

    if (allowedProvider && allowedModel) return;

    const eligible = providers.filter(
      (p) =>
        p.kind === 'Default' || p.perAgentEnabled?.[effectiveExecutor] === true
    );
    const resolved = resolveDefaultSelection(eligible, agentDefaultModels);
    if (!resolved) {
      setSelection(null, null, null);
      setPreferredEffort(null);
      return;
    }
    setSelection(resolved.providerId, resolved.modelId, resolved.reasoningId);
    setPreferredEffort(resolved.preferredEffortId);
  }, [
    effectiveExecutor,
    providers,
    selectedProviderId,
    selectedModelId,
    agentDefaultModels,
    setSelection,
    setPreferredEffort,
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
      executor_config: {
        ...executorConfig,
        // The "agent default" sentinel from ProviderModelPicker maps to null
        // so the spawn applier skips the `--model` flag and each agent reads
        // its own ambient config.
        model_id: isAgentDefaultModelId(selectedModelId)
          ? null
          : (selectedModelId ?? executorConfig.model_id ?? null),
        reasoning_id:
          selectedReasoningId ?? executorConfig.reasoning_id ?? null,
      },
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
      writeLastUsedAgent(executorConfig.executor);
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
    selectedReasoningId,
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
    <div className="relative flex flex-1 flex-col bg-primary h-full min-h-0 min-w-0">
      <div className="flex-1 min-h-0 overflow-y-auto flex justify-center">
        <div className="w-chat max-w-full px-[35px] pt-[9vh] pb-base">
          <div className="flex flex-col gap-base">
            <LandingContextSection />
          </div>
        </div>
      </div>
      <div className="shrink-0 flex justify-center pb-[12px] @container">
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
                ref={editorRef}
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
              // Header dropdown suppressed (length<=1) — agent picker lives
              // in the chip row below alongside folder/branch.
              options: [],
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
                  activeAgent={effectiveExecutor}
                  onManageProviders={() =>
                    SettingsDialog.show({ initialSection: 'providers' })
                  }
                  onSelectionChange={(providerId, modelId, reasoningId) =>
                    setSelection(providerId, modelId, reasoningId)
                  }
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
              <>
                <AgentChip
                  selected={effectiveExecutor}
                  options={executorOptions}
                  onChange={handleExecutorChange}
                  disabled={createWorkspace.isPending}
                />
                <ComposerChipRow disabled={createWorkspace.isPending} />
              </>
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
  );
}
