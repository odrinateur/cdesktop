import { useState, useEffect, useCallback } from 'react';
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
  saveLabel = 'Save',
}: ProviderFormProps) {
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
        Default provider uses your ambient Claude auth (
        <code>claude login</code>
        ). No configuration needed.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {isCreate && catalog && (
        <SettingsCard title="Select a preset">
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
              <span>Custom</span>
            </button>
          </div>
        </SettingsCard>
      )}

      <SettingsCard title="Provider details">
        <SettingsField label="Name">
          <InputBase
            value={name}
            onChange={setName}
            placeholder="My Provider"
          />
        </SettingsField>
        <SettingsField label="Base URL">
          <InputBase
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://api.example.com"
          />
        </SettingsField>
        <SettingsField label="API key">
          <InputBase
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder="sk-…"
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
        <SettingsField label="Background task model">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={haikuFollowMain}
              onChange={(e) => setHaikuFollowMain(e.target.checked)}
            />
            Follow main model
          </label>
          {!haikuFollowMain && (
            <InputBase
              value={haikuModel}
              onChange={setHaikuModel}
              placeholder="e.g. claude-haiku-4-5-20251001"
              className="mt-1"
            />
          )}
        </SettingsField>
        <SettingsField label="Extra env (Advanced)">
          <SettingsTextarea
            value={extraEnvText}
            onChange={setExtraEnvText}
            placeholder={'KEY=value\nANOTHER_KEY=value'}
            monospace
            rows={3}
          />
        </SettingsField>
      </SettingsCard>

      <SettingsCard title="Models">
        <div className="flex gap-2 mb-2">
          <button
            onClick={handleFetchModels}
            disabled={!apiKey || fetchingModels}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
          >
            <ArrowClockwiseIcon
              className={cn('w-3 h-3', fetchingModels && 'animate-spin')}
            />
            Fetch from endpoint
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
                <span className="font-mono">{m.id}</span>
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
            placeholder="Type a model id manually…"
            className="flex-1"
          />
          <button
            onClick={addManualModel}
            disabled={!manualModelId.trim()}
            className="px-2 py-1 rounded border border-border text-xs hover:bg-muted disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {fetchedModels.length > 0 && (
          <div className="border border-border rounded p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-low">
                Fetched {fetchedModels.length} models. Check ones to enable:
              </span>
              <button
                onClick={() => setFetchedModels([])}
                className="text-low hover:text-high text-xs"
              >
                Clear
              </button>
            </div>
            <InputBase
              value={fetchSearch}
              onChange={setFetchSearch}
              placeholder="Search…"
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
                      <span className="font-mono">{m.id}</span>
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
            Cancel
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
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
