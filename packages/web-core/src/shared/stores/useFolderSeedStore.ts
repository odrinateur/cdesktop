import { create } from 'zustand';

interface FolderSeedStore {
  pendingRepoId: string | null;
  setPending: (repoId: string) => void;
  consume: () => string | null;
}

// One-shot bridge from the sidebar "+ in folder" affordance to the create-mode
// state. The create page reads scratch only on first mount, so this store
// covers the case where the user is already on the create page when they click.
export const useFolderSeedStore = create<FolderSeedStore>((set, get) => ({
  pendingRepoId: null,
  setPending: (repoId) => set({ pendingRepoId: repoId }),
  consume: () => {
    const repoId = get().pendingRepoId;
    if (repoId !== null) {
      set({ pendingRepoId: null });
    }
    return repoId;
  },
}));
