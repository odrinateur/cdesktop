import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BaseCodingAgent, PermissionPolicy } from 'shared/types';
import type { ExecutorConfig, Routine, ScheduleKind } from 'shared/types';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { repoApi } from '@/shared/lib/api';
import type { Repo } from 'shared/types';
import { getVariantOptions } from '@/shared/lib/executor';
import { filterAndSortAgents } from '@/shared/lib/agentOrder';
import { usePresetOptions } from '@/shared/hooks/usePresetOptions';
import { AgentChip } from '@/shared/components/AgentChip';
import { FolderChip } from '@/shared/components/FolderChip';
import { ModelSelectorContainer } from '@/shared/components/ModelSelectorContainer';
import { ProviderModelPicker } from '@/shared/components/ProviderModelPicker';
import { useProviders } from '@/shared/hooks/useProviders';
import { useModelSelectorConfig } from '@/shared/hooks/useExecutorDiscovery';
import {
  isAgentDefaultModelId,
  AGENT_DEFAULT_MODEL_ID,
} from '@/shared/lib/agentDefaultModel';
import { resolveDefaultSelection } from '@/shared/hooks/useWorkspacePickerSelection';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { Button } from '@vibe/ui/components/Button';
import { Switch } from '@vibe/ui/components/Switch';
import { Checkbox } from '@vibe/ui/components/Checkbox';

const SCHEDULE_KINDS: ScheduleKind[] = [
  'manual',
  'hourly',
  'daily',
  'weekdays',
  'weekly',
];

export interface RoutineFormValues {
  name: string;
  description: string;
  instructions: string;
  repo_id: string;
  use_worktree: boolean;
  executor_config: ExecutorConfig;
  schedule_kind: ScheduleKind;
  schedule_time: string | null;
  schedule_dow: number | null;
  enabled: boolean;
}

export interface RoutineFormProps {
  initial?: Routine;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: RoutineFormValues) => void;
  onCancel: () => void;
}

function defaultMinute(): string {
  return '00';
}

function defaultTime(): string {
  return '09:00';
}

function defaultExecutorConfig(): ExecutorConfig {
  return {
    executor: BaseCodingAgent.CLAUDE_CODE,
    variant: 'DEFAULT',
    model_id: null,
    agent_id: null,
    reasoning_id: null,
    permission_policy: PermissionPolicy.BYPASS_PERMISSIONS,
  };
}

function fieldLabelClass(): string {
  return 'block text-sm font-medium text-normal mb-half';
}

function inputClass(): string {
  return (
    'w-full bg-secondary border border-border rounded-sm px-base py-half ' +
    'text-sm text-normal placeholder:text-low focus:outline-none ' +
    'focus:border-brand'
  );
}

function selectClass(): string {
  return (
    'bg-secondary border border-border rounded-sm px-base py-half ' +
    'text-sm text-normal focus:outline-none focus:border-brand'
  );
}

export function RoutineForm({
  initial,
  submitLabel,
  submitting = false,
  onSubmit,
  onCancel,
}: RoutineFormProps) {
  const { t } = useTranslation('common');
  const { profiles } = useUserSystem();

  // ---- Form state ----
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [repoId, setRepoId] = useState<string>(initial?.repo_id ?? '');
  const [useWorktree, setUseWorktree] = useState<boolean>(
    initial?.use_worktree ?? false
  );
  const [executorConfig, setExecutorConfig] = useState<ExecutorConfig>(() => {
    if (initial?.executor_config) {
      try {
        return JSON.parse(initial.executor_config) as ExecutorConfig;
      } catch {
        return defaultExecutorConfig();
      }
    }
    return defaultExecutorConfig();
  });
  const initialPickerState = useMemo(() => {
    if (!initial?.executor_config) return null;
    try {
      const parsed = JSON.parse(initial.executor_config) as ExecutorConfig;
      const raw = parsed.model_id ?? null;
      if (!raw) {
        return {
          providerId: null,
          modelId: AGENT_DEFAULT_MODEL_ID,
          reasoningId: parsed.reasoning_id ?? null,
        };
      }
      const slash = raw.indexOf('/');
      if (slash === -1) {
        return {
          providerId: null,
          modelId: raw,
          reasoningId: parsed.reasoning_id ?? null,
        };
      }
      return {
        providerId: raw.substring(0, slash),
        modelId: raw.substring(slash + 1),
        reasoningId: parsed.reasoning_id ?? null,
      };
    } catch {
      return null;
    }
  }, [initial?.executor_config]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    initialPickerState?.providerId ?? null
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    initialPickerState?.modelId ?? null
  );
  const [selectedReasoningId, setSelectedReasoningId] = useState<string | null>(
    initialPickerState?.reasoningId ?? null
  );
  const [preferredEffortId, setPreferredEffortId] = useState<string | null>(
    null
  );
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(
    initial?.schedule_kind ?? 'daily'
  );
  const [scheduleTime, setScheduleTime] = useState<string>(() => {
    if (!initial) return defaultTime();
    if (initial.schedule_time) return initial.schedule_time;
    return defaultTime();
  });
  const [scheduleMinute, setScheduleMinute] = useState<string>(() => {
    if (initial?.schedule_kind === 'hourly' && initial.schedule_time) {
      return initial.schedule_time;
    }
    return defaultMinute();
  });
  const [scheduleDow, setScheduleDow] = useState<number>(() => {
    const init = initial?.schedule_dow;
    if (init === null || init === undefined) return 1;
    return typeof init === 'bigint' ? Number(init) : init;
  });
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);

  const [touched, setTouched] = useState(false);

  // ---- Executor wiring ----
  const agent = executorConfig.executor;
  const variant = executorConfig.variant ?? null;
  const agentOptions = useMemo(
    () => filterAndSortAgents(Object.keys(profiles ?? {}) as BaseCodingAgent[]),
    [profiles]
  );
  const variantOptions = useMemo(
    () => getVariantOptions(agent, profiles ?? null),
    [agent, profiles]
  );
  const { data: presetOptions } = usePresetOptions(agent, variant);

  // Provider+model picker state, mirroring composer's wiring.
  const { data: providers = [] } = useProviders();
  const { config: agentModelConfig } = useModelSelectorConfig(agent);
  const agentDefaultModels = useMemo(
    () =>
      (agentModelConfig?.models ?? []).map((m) => ({
        id: m.id,
        displayName: m.name,
        ownedBy: null,
      })),
    [agentModelConfig]
  );

  // Seed default selection when none exists. Mirrors composer's effect.
  useEffect(() => {
    if (selectedProviderId || selectedModelId) return;
    if (agent && agentDefaultModels.length === 0) return;
    const resolved = resolveDefaultSelection(providers, agentDefaultModels);
    if (!resolved) return;
    setSelectedProviderId(resolved.providerId);
    setSelectedModelId(resolved.modelId);
    setSelectedReasoningId(resolved.reasoningId);
    setPreferredEffortId(resolved.preferredEffortId);
  }, [
    providers,
    agent,
    agentDefaultModels,
    selectedProviderId,
    selectedModelId,
  ]);

  const handlePickerSelectionChange = (
    providerId: string,
    modelId: string,
    reasoningId: string | null
  ) => {
    setSelectedProviderId(providerId);
    setSelectedModelId(modelId);
    setSelectedReasoningId(reasoningId);
  };

  const handleExecutorChange = (next: BaseCodingAgent) => {
    const variants = getVariantOptions(next, profiles ?? null);
    const nextVariant = variants.includes('DEFAULT')
      ? 'DEFAULT'
      : (variants[0] ?? null);
    setExecutorConfig({
      executor: next,
      variant: nextVariant,
      model_id: null,
      agent_id: null,
      reasoning_id: null,
      permission_policy: null,
    });
  };

  const handlePresetSelect = (presetId: string | null) => {
    setExecutorConfig((prev) => ({ ...prev, variant: presetId }));
  };

  const handleOverrideChange = (partial: Partial<ExecutorConfig>) => {
    setExecutorConfig((prev) => ({ ...prev, ...partial }));
  };

  const handleAdvancedSettings = () => {
    SettingsDialog.show({ initialSection: 'agents' });
  };

  // ---- Default repo (first-load) ----
  // Repos are fetched inside FolderChip; we just need any repo id so the
  // first-load form lands with a selection. Pull from the same cache key.
  const { data: repos = [] } = useQuery<Repo[]>({
    queryKey: ['repos'],
    queryFn: () => repoApi.list(),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!repoId && repos.length > 0) {
      setRepoId(repos[0]!.id);
    }
  }, [repos, repoId]);

  // ---- Validation ----
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!name.trim()) out.name = t('routines.form.validation.nameRequired');
    if (!description.trim())
      out.description = t('routines.form.validation.descriptionRequired');
    if (!instructions.trim())
      out.instructions = t('routines.form.validation.instructionsRequired');
    if (!repoId) out.repo_id = t('routines.form.validation.folderRequired');
    if (scheduleKind === 'hourly') {
      if (!/^\d{2}$/.test(scheduleMinute)) {
        out.schedule_time = t('routines.form.validation.minuteRequired');
      }
    } else if (
      scheduleKind === 'daily' ||
      scheduleKind === 'weekdays' ||
      scheduleKind === 'weekly'
    ) {
      if (!/^\d{2}:\d{2}$/.test(scheduleTime)) {
        out.schedule_time = t('routines.form.validation.timeRequired');
      }
    }
    return out;
  }, [
    name,
    description,
    instructions,
    repoId,
    scheduleKind,
    scheduleMinute,
    scheduleTime,
    t,
  ]);

  const canSubmit = Object.keys(errors).length === 0 && !submitting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    let timeValue: string | null = null;
    let dowValue: number | null = null;
    if (scheduleKind === 'hourly') timeValue = scheduleMinute;
    else if (
      scheduleKind === 'daily' ||
      scheduleKind === 'weekdays' ||
      scheduleKind === 'weekly'
    ) {
      timeValue = scheduleTime;
    }
    if (scheduleKind === 'weekly') dowValue = scheduleDow;

    // Combine provider+model into "provider/model" so the routine is
    // replayable. Sentinel → null model_id (agent's ambient default).
    const combinedModelId =
      selectedModelId && !isAgentDefaultModelId(selectedModelId)
        ? selectedProviderId
          ? `${selectedProviderId}/${selectedModelId}`
          : selectedModelId
        : null;

    const submitConfig: ExecutorConfig = {
      ...executorConfig,
      model_id: combinedModelId,
      reasoning_id: selectedReasoningId ?? executorConfig.reasoning_id ?? null,
    };

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      instructions,
      repo_id: repoId,
      use_worktree: useWorktree,
      executor_config: submitConfig,
      schedule_kind: scheduleKind,
      schedule_time: timeValue,
      schedule_dow: dowValue,
      enabled,
    });
  };

  const showError = (key: string) =>
    touched && errors[key] ? (
      <p className="mt-half text-xs text-error">{errors[key]}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-double">
      {/* Name */}
      <div>
        <label className={fieldLabelClass()} htmlFor="routine-name">
          {t('routines.fields.name')}
        </label>
        <input
          id="routine-name"
          className={inputClass()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('routines.fields.namePlaceholder')}
          maxLength={100}
        />
        {showError('name')}
      </div>

      {/* Description */}
      <div>
        <label className={fieldLabelClass()} htmlFor="routine-description">
          {t('routines.fields.description')}
        </label>
        <input
          id="routine-description"
          className={inputClass()}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('routines.fields.descriptionPlaceholder')}
          maxLength={200}
        />
        {showError('description')}
      </div>

      {/* Instructions */}
      <div>
        <label className={fieldLabelClass()} htmlFor="routine-instructions">
          {t('routines.fields.instructions')}
        </label>
        <textarea
          id="routine-instructions"
          className={`${inputClass()} min-h-[160px] resize-y`}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t('routines.fields.instructionsPlaceholder')}
          maxLength={8000}
        />
        {showError('instructions')}
      </div>

      {/* Composer-style picker row: folder · agent · worktree
          and model/permission/preset/sub-agent via ModelSelectorContainer */}
      <div>
        <label className={fieldLabelClass()}>
          {t('routines.fields.executor')}
        </label>
        <div className="flex flex-wrap items-center gap-half">
          <FolderChip
            selectedRepoId={repoId || null}
            onSelect={setRepoId}
            disabled={submitting}
          />
          <AgentChip
            selected={agent}
            options={agentOptions}
            onChange={handleExecutorChange}
            disabled={submitting}
          />
          <ModelSelectorContainer
            slot="left"
            agent={agent}
            workspaceId={undefined}
            onAdvancedSettings={handleAdvancedSettings}
            presets={variantOptions}
            selectedPreset={variant}
            onPresetSelect={handlePresetSelect}
            onOverrideChange={handleOverrideChange}
            executorConfig={executorConfig}
            presetOptions={presetOptions}
          />
          <ProviderModelPicker
            selectedProviderId={selectedProviderId}
            selectedModelId={selectedModelId}
            selectedReasoningId={selectedReasoningId}
            preferredEffortId={preferredEffortId}
            activeAgent={agent}
            onManageProviders={() =>
              SettingsDialog.show({ initialSection: 'providers' })
            }
            onSelectionChange={handlePickerSelectionChange}
            onPreferredEffortChange={setPreferredEffortId}
          />
          <label
            className="inline-flex items-center gap-half rounded-md bg-secondary px-base py-half min-h-7 text-sm text-normal hover:bg-panel cursor-pointer"
            title={t('routines.fields.worktree')}
          >
            <Checkbox
              checked={useWorktree}
              onCheckedChange={(v) => setUseWorktree(v === true)}
              className="h-3.5 w-3.5"
              disabled={submitting}
            />
            <span>{t('routines.fields.worktree')}</span>
          </label>
        </div>
        {showError('repo_id')}
      </div>

      {/* Schedule */}
      <div>
        <label className={fieldLabelClass()}>
          {t('routines.fields.schedule')}
        </label>
        <div className="flex flex-wrap gap-half">
          {SCHEDULE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setScheduleKind(kind)}
              className={`px-base py-half rounded-md border text-sm transition-colors ${
                scheduleKind === kind
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-secondary border-border text-normal hover:bg-panel'
              }`}
            >
              {t(`routines.schedule.${kind}`)}
            </button>
          ))}
        </div>

        {/* Conditional schedule fields */}
        {scheduleKind !== 'manual' && (
          <div className="mt-base flex flex-wrap gap-base items-end">
            {scheduleKind === 'hourly' && (
              <div>
                <label className={fieldLabelClass()} htmlFor="routine-minute">
                  {t('routines.fields.minute')}
                </label>
                <input
                  id="routine-minute"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-5][0-9]"
                  maxLength={2}
                  className={`${inputClass()} w-24`}
                  value={scheduleMinute}
                  onChange={(e) =>
                    setScheduleMinute(e.target.value.replace(/\D/g, ''))
                  }
                />
              </div>
            )}
            {(scheduleKind === 'daily' ||
              scheduleKind === 'weekdays' ||
              scheduleKind === 'weekly') && (
              <div>
                <label className={fieldLabelClass()} htmlFor="routine-time">
                  {t('routines.fields.time')}
                </label>
                <input
                  id="routine-time"
                  type="time"
                  className={`${inputClass()} w-32`}
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            )}
            {scheduleKind === 'weekly' && (
              <div>
                <label className={fieldLabelClass()} htmlFor="routine-dow">
                  {t('routines.fields.dow')}
                </label>
                <select
                  id="routine-dow"
                  className={selectClass()}
                  value={scheduleDow}
                  onChange={(e) => setScheduleDow(Number(e.target.value))}
                >
                  <option value={0}>{t('routines.days.sun')}</option>
                  <option value={1}>{t('routines.days.mon')}</option>
                  <option value={2}>{t('routines.days.tue')}</option>
                  <option value={3}>{t('routines.days.wed')}</option>
                  <option value={4}>{t('routines.days.thu')}</option>
                  <option value={5}>{t('routines.days.fri')}</option>
                  <option value={6}>{t('routines.days.sat')}</option>
                </select>
              </div>
            )}
          </div>
        )}
        {showError('schedule_time')}

        <p className="mt-base text-xs text-low">{t('routines.banner')}</p>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-base">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          id="routine-enabled"
        />
        <label htmlFor="routine-enabled" className="text-sm text-normal">
          {enabled ? t('routines.enabled') : t('routines.disabled')}
        </label>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-base pt-base border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('routines.form.cancel')}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
