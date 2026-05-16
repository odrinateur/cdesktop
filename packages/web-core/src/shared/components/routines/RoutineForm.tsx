import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BaseCodingAgent, PermissionPolicy } from 'shared/types';
import type { ExecutorConfig, Repo, Routine, ScheduleKind } from 'shared/types';
import { repoApi } from '@/shared/lib/api';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useModelSelectorConfig } from '@/shared/hooks/useExecutorDiscovery';
import { getVariantOptions } from '@/shared/lib/executor';
import { filterAndSortAgents } from '@/shared/lib/agentOrder';
import { Button } from '@vibe/ui/components/Button';
import { Switch } from '@vibe/ui/components/Switch';

const SCHEDULE_KINDS: ScheduleKind[] = [
  'manual',
  'hourly',
  'daily',
  'weekdays',
  'weekly',
];

// Permission lists per agent. Claude has a stable hardcoded set; for other
// agents we read from discovered options. Mirrors ModelSelectorContainer.
const CLAUDE_PERMISSIONS: PermissionPolicy[] = [
  PermissionPolicy.SUPERVISED,
  PermissionPolicy.ACCEPT_EDITS,
  PermissionPolicy.PLAN,
  PermissionPolicy.AUTO_MODE,
  PermissionPolicy.BYPASS_PERMISSIONS,
];

const PERMISSION_LABELS: Record<PermissionPolicy, string> = {
  [PermissionPolicy.SUPERVISED]: 'Ask',
  [PermissionPolicy.ACCEPT_EDITS]: 'Accept edits',
  [PermissionPolicy.PLAN]: 'Plan',
  [PermissionPolicy.AUTO_MODE]: 'Auto',
  [PermissionPolicy.BYPASS_PERMISSIONS]: 'Bypass permissions',
};

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
    permission_policy: PermissionPolicy.SUPERVISED,
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

  // Repo list for the folder picker.
  const { data: repos = [] } = useQuery<Repo[]>({
    queryKey: ['repos'],
    queryFn: () => repoApi.list(),
    staleTime: 30_000,
  });

  // ---- Form state ----
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [repoId, setRepoId] = useState<string>(initial?.repo_id ?? '');
  const [useWorktree, setUseWorktree] = useState<boolean>(
    initial?.use_worktree ?? true
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

  // Default repo: when creating, pre-select the first repo so the form lands
  // with a sensible value.
  useEffect(() => {
    if (!repoId && repos.length > 0) {
      setRepoId(repos[0]!.id);
    }
  }, [repos, repoId]);

  // ---- Executor / model discovery ----
  const agent = executorConfig.executor;
  const agentOptions = useMemo(
    () => filterAndSortAgents(Object.keys(profiles ?? {}) as BaseCodingAgent[]),
    [profiles]
  );
  const variantOptions = useMemo(
    () => getVariantOptions(agent, profiles ?? null),
    [agent, profiles]
  );
  const { config: discovery, loadingModels } = useModelSelectorConfig(agent);

  const availablePermissions: PermissionPolicy[] =
    agent === BaseCodingAgent.CLAUDE_CODE
      ? CLAUDE_PERMISSIONS
      : (discovery?.permissions ?? []);

  // Build the flat list of model options as "provider/model" strings.
  const modelOptions = useMemo(() => {
    if (!discovery) return [];
    return discovery.models.map((m) => {
      const id = m.provider_id ? `${m.provider_id}/${m.id}` : m.id;
      return { id, label: m.name };
    });
  }, [discovery]);

  // Seed the variant when switching agents and the current variant isn't valid.
  useEffect(() => {
    if (variantOptions.length === 0) return;
    const current = executorConfig.variant ?? null;
    if (current && variantOptions.includes(current)) return;
    const next = variantOptions.includes('DEFAULT')
      ? 'DEFAULT'
      : (variantOptions[0] ?? null);
    setExecutorConfig((prev) => ({ ...prev, variant: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantOptions.join('|')]);

  // Seed permission when switching agents and the current isn't valid.
  useEffect(() => {
    if (availablePermissions.length === 0) return;
    const current = executorConfig.permission_policy;
    if (current && availablePermissions.includes(current)) return;
    setExecutorConfig((prev) => ({
      ...prev,
      permission_policy: availablePermissions[0] ?? null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePermissions.join('|')]);

  // Seed the model when discovery loads and we have no model yet, or the
  // current model doesn't exist for the new agent.
  useEffect(() => {
    if (!discovery) return;
    if (modelOptions.length === 0) return;
    const current = executorConfig.model_id;
    if (current && modelOptions.some((m) => m.id === current)) return;
    const defaultId = discovery.default_model
      ? discovery.providers[0]
        ? `${discovery.providers[0].id}/${discovery.default_model}`
        : discovery.default_model
      : (modelOptions[0]?.id ?? null);
    setExecutorConfig((prev) => ({ ...prev, model_id: defaultId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, modelOptions.length]);

  // ---- Validation ----
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!name.trim()) out.name = t('routines.form.validation.nameRequired');
    if (!description.trim())
      out.description = t('routines.form.validation.descriptionRequired');
    if (!instructions.trim())
      out.instructions = t('routines.form.validation.instructionsRequired');
    if (!repoId) out.repo_id = t('routines.form.validation.folderRequired');
    if (!executorConfig.model_id) {
      out.model_id = t('routines.form.validation.modelRequired');
    }
    if (availablePermissions.length > 0 && !executorConfig.permission_policy) {
      out.permission_policy = t('routines.form.validation.permissionRequired');
    }
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
    executorConfig.model_id,
    executorConfig.permission_policy,
    availablePermissions.length,
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

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      instructions,
      repo_id: repoId,
      use_worktree: useWorktree,
      executor_config: executorConfig,
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

      {/* Folder + worktree */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-base">
        <div>
          <label className={fieldLabelClass()} htmlFor="routine-folder">
            {t('routines.fields.folder')}
          </label>
          <select
            id="routine-folder"
            className={`${selectClass()} w-full`}
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
          >
            <option value="" disabled>
              {t('routines.fields.folderPlaceholder')}
            </option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name || r.name}
              </option>
            ))}
          </select>
          {showError('repo_id')}
        </div>
        <div>
          <label className={fieldLabelClass()}>
            {t('routines.fields.worktree')}
          </label>
          <div className="flex items-center gap-base py-half">
            <Switch
              checked={useWorktree}
              onCheckedChange={setUseWorktree}
              id="routine-worktree"
            />
            <span className="text-sm text-low">
              {useWorktree ? t('routines.enabled') : t('routines.disabled')}
            </span>
          </div>
        </div>
      </div>

      {/* Executor picker: agent, variant, permission, model */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-base">
        <div>
          <label className={fieldLabelClass()} htmlFor="routine-agent">
            {t('routines.fields.executor')}
          </label>
          <select
            id="routine-agent"
            className={`${selectClass()} w-full`}
            value={agent}
            onChange={(e) =>
              setExecutorConfig((prev) => ({
                ...prev,
                executor: e.target.value as BaseCodingAgent,
                variant: null,
                model_id: null,
                permission_policy: null,
              }))
            }
          >
            {agentOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabelClass()} htmlFor="routine-variant">
            {t('routines.fields.variant')}
          </label>
          <select
            id="routine-variant"
            className={`${selectClass()} w-full`}
            value={executorConfig.variant ?? ''}
            onChange={(e) =>
              setExecutorConfig((prev) => ({
                ...prev,
                variant: e.target.value || null,
              }))
            }
            disabled={variantOptions.length === 0}
          >
            {variantOptions.length === 0 && <option value="">DEFAULT</option>}
            {variantOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabelClass()} htmlFor="routine-permission">
            {t('routines.fields.permission')}
          </label>
          <select
            id="routine-permission"
            className={`${selectClass()} w-full`}
            value={executorConfig.permission_policy ?? ''}
            onChange={(e) =>
              setExecutorConfig((prev) => ({
                ...prev,
                permission_policy: (e.target.value as PermissionPolicy) || null,
              }))
            }
            disabled={availablePermissions.length === 0}
          >
            <option value="" disabled>
              —
            </option>
            {availablePermissions.map((p) => (
              <option key={p} value={p}>
                {PERMISSION_LABELS[p] ?? p}
              </option>
            ))}
          </select>
          {showError('permission_policy')}
        </div>
        <div>
          <label className={fieldLabelClass()} htmlFor="routine-model">
            {t('routines.fields.model')}
          </label>
          <select
            id="routine-model"
            className={`${selectClass()} w-full`}
            value={executorConfig.model_id ?? ''}
            onChange={(e) =>
              setExecutorConfig((prev) => ({
                ...prev,
                model_id: e.target.value || null,
              }))
            }
            disabled={loadingModels || modelOptions.length === 0}
          >
            <option value="" disabled>
              {loadingModels ? '…' : '—'}
            </option>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {showError('model_id')}
        </div>
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
                  ? 'bg-foreground text-primary-foreground border-foreground'
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
