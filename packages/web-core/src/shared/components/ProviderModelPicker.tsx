import { useState, useMemo } from 'react';
import { MagnifyingGlassIcon, GearIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import { useProviders } from '@/shared/hooks/useProviders';
import { useProviderModelStore } from '@/shared/stores/useProviderModelStore';
import type { Provider } from 'shared/types';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@vibe/ui/components/Dropdown';

interface RecentPair {
  model_id: string;
  provider_id: string;
}

interface ProviderModelPickerProps {
  onManageProviders: () => void;
  // Called when a (model, provider) pair is selected
  onSelect: (providerId: string, modelId: string) => void;
}

export function ProviderModelPicker({
  onManageProviders,
  onSelect,
}: ProviderModelPickerProps) {
  const { selectedProviderId, selectedModelId } = useProviderModelStore();
  const { data: providers = [] } = useProviders();

  const { data: recents = [] } = useQuery({
    queryKey: ['providers', 'recents'],
    queryFn: async () => {
      const res = await makeLocalApiRequest('/providers/recents');
      const body = await res.json();
      return body.data as RecentPair[];
    },
  });

  const [search, setSearch] = useState('');

  // Build flat list of (provider, model) leaf items for search
  const allItems = useMemo(() => {
    const items: {
      provider: Provider;
      modelId: string;
      displayName: string;
    }[] = [];
    for (const p of providers) {
      if (!p.enabled) continue;
      for (const m of p.enabledModels ?? []) {
        if (
          !search ||
          m.id.toLowerCase().includes(search.toLowerCase()) ||
          p.name.toLowerCase().includes(search.toLowerCase())
        ) {
          items.push({
            provider: p,
            modelId: m.id,
            displayName: m.displayName,
          });
        }
      }
    }
    return items;
  }, [providers, search]);

  // Group by provider
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { provider: Provider; models: typeof allItems }
    >();
    for (const item of allItems) {
      const existing = map.get(item.provider.id);
      if (existing) {
        existing.models.push(item);
      } else {
        map.set(item.provider.id, { provider: item.provider, models: [item] });
      }
    }
    return [...map.values()];
  }, [allItems]);

  // Resolve recents display info
  const recentItems = useMemo(() => {
    return recents
      .map((r) => {
        const provider = providers.find((p) => p.id === r.provider_id);
        const model = provider?.enabledModels?.find((m) => m.id === r.model_id);
        if (!provider || !model) return null;
        return {
          provider,
          modelId: r.model_id,
          displayName: model.displayName,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [recents, providers]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const label =
    selectedModelId && selectedProvider
      ? `${selectedModelId} · ${selectedProvider.name}`
      : 'Model ▾';

  const handleSelect = (providerId: string, modelId: string) => {
    useProviderModelStore.getState().setSelection(providerId, modelId);
    onSelect(providerId, modelId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted max-w-48 truncate">
          <span className="truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 p-0 overflow-hidden flex flex-col"
      >
        {/* Search */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-low flex-shrink-0" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            className="flex-1 text-xs bg-transparent outline-none"
          />
        </div>

        <div className="overflow-y-auto max-h-64">
          {/* Recently used */}
          {!search && recentItems.length > 0 && (
            <div>
              <div className="px-2 py-1 text-xs font-medium text-low">
                Recently used
              </div>
              {recentItems.map((item) => (
                <ModelRow
                  key={`${item.provider.id}::${item.modelId}`}
                  modelId={item.modelId}
                  displayName={item.displayName}
                  providerName={item.provider.name}
                  isSelected={
                    item.provider.id === selectedProviderId &&
                    item.modelId === selectedModelId
                  }
                  onClick={() => handleSelect(item.provider.id, item.modelId)}
                />
              ))}
              <div className="border-t border-border my-1" />
            </div>
          )}

          {/* Default provider (if enabled and has models) */}
          {!search &&
            grouped
              .filter((g) => g.provider.kind === 'default')
              .map((g) => (
                <ProviderGroup
                  key={g.provider.id}
                  group={g}
                  selectedProviderId={selectedProviderId}
                  selectedModelId={selectedModelId}
                  onSelect={handleSelect}
                />
              ))}

          {/* Other providers */}
          {grouped
            .filter((g) => search || g.provider.kind !== 'default')
            .map((g) => (
              <ProviderGroup
                key={g.provider.id}
                group={g}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                onSelect={handleSelect}
              />
            ))}

          {allItems.length === 0 && (
            <div className="px-2 py-3 text-xs text-low text-center">
              {providers.filter((p) => p.enabled).length === 0
                ? 'No providers enabled'
                : 'No models match'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border">
          <button
            onClick={onManageProviders}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-low hover:text-high hover:bg-muted"
          >
            <GearIcon className="w-3.5 h-3.5" />
            Manage providers →
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProviderGroup({
  group,
  selectedProviderId,
  selectedModelId,
  onSelect,
}: {
  group: {
    provider: Provider;
    models: { modelId: string; displayName: string }[];
  };
  selectedProviderId: string | null;
  selectedModelId: string | null;
  onSelect: (providerId: string, modelId: string) => void;
}) {
  return (
    <div>
      <div className="px-2 py-1 text-xs font-medium text-low">
        {group.provider.name}
      </div>
      {group.models.map((m) => (
        <ModelRow
          key={m.modelId}
          modelId={m.modelId}
          displayName={m.displayName}
          isSelected={
            group.provider.id === selectedProviderId &&
            m.modelId === selectedModelId
          }
          onClick={() => onSelect(group.provider.id, m.modelId)}
        />
      ))}
    </div>
  );
}

function ModelRow({
  modelId,
  displayName,
  providerName,
  isSelected,
  onClick,
}: {
  modelId: string;
  displayName: string;
  providerName?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start justify-between gap-2 px-4 py-1.5 text-xs hover:bg-muted text-left',
        isSelected && 'bg-muted font-medium'
      )}
    >
      <span className="font-mono truncate">{displayName || modelId}</span>
      {providerName && (
        <span className="text-low flex-shrink-0">{providerName}</span>
      )}
    </button>
  );
}
