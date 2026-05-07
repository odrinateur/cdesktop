import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PlusIcon,
  TrashIcon,
  ArrowClockwiseIcon,
  CheckIcon,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import type {
  Provider,
  CreateProvider,
  UpdateProvider,
  EnabledModel,
} from 'shared/types';
import { cn } from '@/shared/lib/utils';
import {
  SettingsCard,
  SettingsField,
  SettingsTextarea,
} from './SettingsComponents';

interface CatalogPreset {
  id: string;
  name: string;
  api_key_field: string;
  icon: string | null;
  icon_color: string | null;
  env: Record<string, string>;
  models_url: string | null;
}

interface FetchedModel {
  id: string;
  owned_by: string | null;
}

const STRIP_FROM_ENV = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
];
const HAIKU_KEY = 'ANTHROPIC_DEFAULT_HAIKU_MODEL';

function normalizeCatalogPreset(preset: CatalogPreset) {
  const env = { ...preset.env };
  const baseUrl = env['ANTHROPIC_BASE_URL'] ?? '';
  const haikuModel = env[HAIKU_KEY] ?? null;
  for (const key of STRIP_FROM_ENV) delete env[key];
  delete env[HAIKU_KEY];
  delete env['ANTHROPIC_BASE_URL'];
  delete env[preset.api_key_field];
  return {
    baseUrl,
    apiKeyField: preset.api_key_field,
    extraEnv: env,
    haikuModel,
  };
}

function InputBase({
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full bg-secondary border border-border rounded-sm px-2 py-1.5 text-sm text-high',
        'placeholder:text-low focus:outline-none focus:ring-1 focus:ring-brand',
        className
      )}
    />
  );
}

interface ProviderFormProps {
  provider?: Provider;
  onSave: (data: CreateProvider | UpdateProvider) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
}

export function ProviderForm({
  provider,
  onSave,
  onCancel,
  saveLabel,
}: ProviderFormProps) {
  const { t } = useTranslation('settings');
  const resolvedSaveLabel = saveLabel ?? t('settings.providers.section.saveLabel');
  const { data: catalog } = useQuery({
    queryKey: ['providers', 'catalog'],
    queryFn: async () => {
      const res = await makeLocalApiRequest('/api/providers/catalog');
      const body = await res.json();
      return body.data as CatalogPreset[];
    },
    staleTime: Infinity,
  });

  const isCreate = !provider;
  const isDefault = provider?.kind === 'Default';

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    provider?.presetId ?? null
  );
  const [name, setName] = useState(provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKeyField, setApiKeyField] = useState('ANTHROPIC_AUTH_TOKEN');
  const [apiKey, setApiKey] = useState('');
  const [haikuFollowMain, setHaikuFollowMain] = useState(
    provider?.haikuModel == null
  );
  const [haikuModel, setHaikuModel] = useState(provider?.haikuModel ?? '');
  const [extraEnvText, setExtraEnvText] = useState('');
  const [enabledModels, setEnabledModels] = useState<EnabledModel[]>(
    provider?.enabledModels ?? []
  );
  const [manualModelId, setManualModelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [fetchSearch, setFetchSearch] = useState('');

  useEffect(() => {
    if (!provider) return;
    const env = provider.env ?? {};
    setBaseUrl(env['ANTHROPIC_BASE_URL'] ?? '');
    const hasAuth = 'ANTHROPIC_AUTH_TOKEN' in env;
    setApiKeyField(hasAuth ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY');
    setApiKey(env['ANTHROPIC_AUTH_TOKEN'] ?? env['ANTHROPIC_API_KEY'] ?? '');
    const stripped = { ...env };
    delete stripped['ANTHROPIC_BASE_URL'];
    delete stripped['ANTHROPIC_AUTH_TOKEN'];
    delete stripped['ANTHROPIC_API_KEY'];
    setExtraEnvText(
      Object.entries(stripped)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')
    );
  }, [provider]);

  const handlePresetSelect = useCallback(
    (presetId: string | null) => {
      setSelectedPresetId(presetId);
      if (!presetId || !catalog) return;
      const preset = catalog.find((p) => p.id === presetId);
      if (!preset) return;
      const {
        baseUrl: pUrl,
        apiKeyField: pField,
        extraEnv,
        haikuModel: pHaiku,
      } = normalizeCatalogPreset(preset);
      setName(preset.name);
      setBaseUrl(pUrl);
      setApiKeyField(pField);
      setHaikuFollowMain(pHaiku == null);
      setHaikuModel(pHaiku ?? '');
      setExtraEnvText(
        Object.entries(extraEnv)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      );
    },
    [catalog]
  );

  const buildEnv = useCallback((): Record<string, string> => {
    const env: Record<string, string> = {};
    if (baseUrl) env['ANTHROPIC_BASE_URL'] = baseUrl;
    if (apiKey) env[apiKeyField] = apiKey;
    for (const line of extraEnvText.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return env;
  }, [baseUrl, apiKey, apiKeyField, extraEnvText]);

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchError(null);
    try {
      const preset = selectedPresetId
        ? catalog?.find((p) => p.id === selectedPresetId)
        : null;
      const res = await makeLocalApiRequest(
        '/api/providers/fetch-models',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_url: baseUrl,
            api_key: apiKey,
            models_url: preset?.models_url ?? null,
          }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      const fetched: FetchedModel[] = body.data?.models ?? [];
      setFetchedModels(fetched);
      setFetchSearch('');
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetchingModels(false);
    }
  };

  const addManualModel = () => {
    const id = manualModelId.trim();
    if (!id || enabledModels.some((m) => m.id === id)) return;
    setEnabledModels((prev) => [
      ...prev,
      { id, displayName: id, ownedBy: null },
    ]);
    setManualModelId('');
  };

  const removeModel = (id: string) =>
    setEnabledModels((prev) => prev.filter((m) => m.id !== id));

  const handleSave = async () => {
    setSaving(true);
    try {
      const env = buildEnv();
      const resolvedHaiku = haikuFollowMain ? null : haikuModel || null;
      const data: CreateProvider | UpdateProvider = isCreate
        ? {
            name,
            kind: selectedPresetId ? 'Preset' : 'Custom',
            agentKind: 'CLAUDE_CODE',
            presetId: selectedPresetId,
            env,
            extraArgs: [],
            haikuModel: resolvedHaiku,
            enabledModels,
          }
        : {
            name,
            presetId: provider?.presetId ?? null,
            enabled: provider?.enabled ?? true,
            env,
            extraArgs: [],
            haikuModel: resolvedHaiku,
            enabledModels,
          };
      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  if (isDefault) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('settings.providers.form.defaultDescription')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {isCreate && catalog && (
        <SettingsCard title={t('settings.providers.form.selectPreset')}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {catalog.map((preset) => (
              <button
                key={preset.id}
                onClick={() =>
                  handlePresetSelect(
                    selectedPresetId === preset.id ? null : preset.id
                  )
                }
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded border text-xs text-center transition-colors',
                  selectedPresetId === preset.id
                    ? 'border-brand bg-brand/10'
                    : 'border-border hover:bg-muted'
                )}
              >
                <span className="font-medium leading-tight">{preset.name}</span>
              </button>
            ))}
            <button
              onClick={() => handlePresetSelect(null)}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded border text-xs text-center transition-colors',
                selectedPresetId === null
                  ? 'border-brand bg-brand/10'
                  : 'border-border hover:bg-muted'
              )}
            >
              <PlusIcon className="w-4 h-4" />
              <span>{t('settings.providers.form.custom')}</span>
            </button>
          </div>
        </SettingsCard>
      )}

      <SettingsCard title={t('settings.providers.form.providerDetails')}>
        <SettingsField label={t('settings.providers.form.name')}>
          <InputBase
            value={name}
            onChange={setName}
            placeholder={t('settings.providers.form.namePlaceholder')}
          />
        </SettingsField>
        <SettingsField label={t('settings.providers.form.baseUrl')}>
          <InputBase
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder={t('settings.providers.form.baseUrlPlaceholder')}
          />
        </SettingsField>
        <SettingsField label={t('settings.providers.form.apiKey')}>
          <InputBase
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder={t('settings.providers.form.apiKeyPlaceholder')}
          />
          <div className="flex gap-2 mt-1">
            {(['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const).map(
              (field) => (
                <button
                  key={field}
                  onClick={() => setApiKeyField(field)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded border',
                    apiKeyField === field
                      ? 'border-brand bg-brand/10'
                      : 'border-border'
                  )}
                >
                  {field}
                </button>
              )
            )}
          </div>
        </SettingsField>
        <SettingsField label={t('settings.providers.form.backgroundTaskModel')}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={haikuFollowMain}
              onChange={(e) => setHaikuFollowMain(e.target.checked)}
            />
            {t('settings.providers.form.followMainModel')}
          </label>
          {!haikuFollowMain && (
            <InputBase
              value={haikuModel}
              onChange={setHaikuModel}
              placeholder={t('settings.providers.form.haikuModelPlaceholder')}
              className="mt-1"
            />
          )}
        </SettingsField>
        <SettingsField label={t('settings.providers.form.extraEnv')}>
          <SettingsTextarea
            value={extraEnvText}
            onChange={setExtraEnvText}
            placeholder={t('settings.providers.form.envPlaceholder')}
            monospace
            rows={3}
          />
        </SettingsField>
      </SettingsCard>

      <SettingsCard title={t('settings.providers.form.models')}>
        <div className="flex gap-2 mb-2">
          <button
            onClick={handleFetchModels}
            disabled={!apiKey || fetchingModels}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
          >
            <ArrowClockwiseIcon
              className={cn('w-3 h-3', fetchingModels && 'animate-spin')}
            />
            {t('settings.providers.form.fetchFromEndpoint')}
          </button>
        </div>
        {fetchError && <p className="text-xs text-error mb-2">{fetchError}</p>}
        {enabledModels.length > 0 && (
          <ul className="flex flex-col gap-1 mb-2 max-h-40 overflow-y-auto">
            {enabledModels.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between text-xs px-2 py-1 rounded bg-secondary"
              >
                <span>{m.id}</span>
                <button
                  onClick={() => removeModel(m.id)}
                  className="text-low hover:text-error"
                >
                  <TrashIcon className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 mb-2">
          <InputBase
            value={manualModelId}
            onChange={setManualModelId}
            placeholder={t('settings.providers.form.manualPlaceholder')}
            className="flex-1"
          />
          <button
            onClick={addManualModel}
            disabled={!manualModelId.trim()}
            className="px-2 py-1 rounded border border-border text-xs hover:bg-muted disabled:opacity-50"
          >
            {t('settings.providers.form.add')}
          </button>
        </div>
        {fetchedModels.length > 0 && (
          <div className="border border-border rounded p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-low">
                {t('settings.providers.form.fetchedCount', {
                  count: fetchedModels.length,
                })}
              </span>
              <button
                onClick={() => setFetchedModels([])}
                className="text-low hover:text-high text-xs"
              >
                {t('settings.providers.form.clear')}
              </button>
            </div>
            <InputBase
              value={fetchSearch}
              onChange={setFetchSearch}
              placeholder={t('settings.providers.form.search')}
            />
            <ul className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
              {fetchedModels
                .filter((m) =>
                  fetchSearch
                    ? m.id.toLowerCase().includes(fetchSearch.toLowerCase())
                    : true
                )
                .slice(0, 200)
                .map((m) => {
                  const enabled = enabledModels.some((e) => e.id === m.id);
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEnabledModels((prev) => [
                              ...prev,
                              {
                                id: m.id,
                                displayName: m.id,
                                ownedBy: m.owned_by,
                              },
                            ]);
                          } else {
                            setEnabledModels((prev) =>
                              prev.filter((x) => x.id !== m.id)
                            );
                          }
                        }}
                      />
                      <span>{m.id}</span>
                      {m.owned_by && (
                        <span className="text-low ml-auto">{m.owned_by}</span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </SettingsCard>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted"
          >
            {t('settings.providers.form.cancel')}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !name}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {saving ? (
            <ArrowClockwiseIcon className="w-3 h-3 animate-spin" />
          ) : (
            <CheckIcon className="w-3 h-3" />
          )}
          {resolvedSaveLabel}
        </button>
      </div>
    </div>
  );
}
