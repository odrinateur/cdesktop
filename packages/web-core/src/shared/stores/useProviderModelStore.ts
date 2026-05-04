import { create } from 'zustand';

interface ProviderModelState {
  selectedProviderId: string | null;
  selectedModelId: string | null;
  setSelection: (providerId: string | null, modelId: string | null) => void;
  clear: () => void;
}

export const useProviderModelStore = create<ProviderModelState>((set) => ({
  selectedProviderId: null,
  selectedModelId: null,
  setSelection: (selectedProviderId, selectedModelId) =>
    set({ selectedProviderId, selectedModelId }),
  clear: () => set({ selectedProviderId: null, selectedModelId: null }),
}));
