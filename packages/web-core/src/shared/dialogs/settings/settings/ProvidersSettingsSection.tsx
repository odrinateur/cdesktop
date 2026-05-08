import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@phosphor-icons/react';
import type { Provider, CreateProvider, UpdateProvider } from 'shared/types';
import { cn } from '@/shared/lib/utils';
import { Switch } from '@vibe/ui/components/Switch';
import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
} from '@/shared/hooks/useProviders';
import { ProviderForm } from './ProviderForm';

export function ProvidersSettingsSection() {
  const { t } = useTranslation('settings');
  const { data: providers = [], isLoading } = useProviders();
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);

  const selected =
    selectedId === 'new'
      ? undefined
      : providers.find((p) => p.id === selectedId);

  const handleSaveNew = async (data: CreateProvider | UpdateProvider) => {
    await createProvider.mutateAsync(data as CreateProvider);
    setSelectedId(null);
  };

  const handleSaveExisting = async (data: CreateProvider | UpdateProvider) => {
    if (!selectedId || selectedId === 'new') return;
    await updateProvider.mutateAsync({
      id: selectedId,
      data: data as UpdateProvider,
    });
  };

  const handleToggleEnabled = async (p: Provider) => {
    const env = p.env ?? {};
    await updateProvider.mutateAsync({
      id: p.id,
      data: {
        name: p.name,
        presetId: p.presetId ?? null,
        enabled: !p.enabled,
        env,
        extraArgs: p.extraArgs ?? [],
        haikuModel: p.haikuModel ?? null,
        enabledModels: p.enabledModels ?? [],
      },
    });
  };

  const handleDelete = async (provider: Provider) => {
    if (provider.kind === 'Default') return;
    if (
      !confirm(t('settings.providers.section.deleteConfirm', { name: provider.name }))
    )
      return;
    await deleteProvider.mutateAsync(provider.id);
    if (selectedId === provider.id) setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* Left rail */}
      <div className="w-52 flex-shrink-0 border-r border-border flex flex-col">
        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">
              {t('settings.providers.section.loading')}
            </div>
          ) : (
            <ul>
              {providers.map((provider) => (
                <li key={provider.id}>
                  <div
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted',
                      selectedId === provider.id && 'bg-muted font-medium'
                    )}
                  >
                    <button
                      onClick={() => setSelectedId(provider.id)}
                      className={cn(
                        'flex-1 truncate text-left',
                        !provider.enabled && 'text-muted-foreground'
                      )}
                    >
                      {provider.kind === 'Default'
                        ? t('settings.providers.defaultProviderName')
                        : provider.name}
                    </button>
                    <Switch
                      checked={provider.enabled}
                      onCheckedChange={() => handleToggleEnabled(provider)}
                      title={
                        provider.enabled
                          ? t('settings.providers.section.disable')
                          : t('settings.providers.section.enable')
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="px-2 pt-1">
            <button
              onClick={() => setSelectedId('new')}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-sm rounded',
                'border border-border hover:bg-muted text-foreground',
                selectedId === 'new' && 'bg-muted'
              )}
            >
              <PlusIcon className="w-4 h-4" />
              {t('settings.providers.section.addProvider')}
            </button>
          </div>
        </div>
      </div>

      {/* Right pane */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedId === null && (
          <div className="text-sm text-muted-foreground">
            {t('settings.providers.section.emptyHint')}
          </div>
        )}

        {selectedId === 'new' && (
          <>
            <h3 className="font-medium mb-4">
              {t('settings.providers.section.addProviderTitle')}
            </h3>
            <ProviderForm
              key="new"
              onSave={handleSaveNew}
              onCancel={() => setSelectedId(null)}
              saveLabel={t('settings.providers.section.addProvider')}
            />
          </>
        )}

        {selectedId && selectedId !== 'new' && selected && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">
                {selected.kind === 'Default'
                  ? t('settings.providers.defaultProviderName')
                  : selected.name}
              </h3>
              {selected.kind !== 'Default' && (
                <button
                  onClick={() => handleDelete(selected)}
                  className="text-xs text-destructive hover:underline"
                >
                  {t('settings.providers.section.delete')}
                </button>
              )}
            </div>
            <ProviderForm
              key={selected.id}
              provider={selected}
              onSave={handleSaveExisting}
              saveLabel={t('settings.providers.section.saveLabel')}
            />
          </>
        )}
      </div>
    </div>
  );
}
