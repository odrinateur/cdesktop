import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Tiny store for in-progress pill drags. Sidebar pills set
// `draggingWorkspaceId` on dragStart; cell drop overlays read it to decide
// whether to show their drop zones; everyone clears on dragEnd.
// ---------------------------------------------------------------------------

interface PillDragState {
  draggingWorkspaceId: string | null;
  setDragging: (workspaceId: string | null) => void;
}

export const usePillDragStore = create<PillDragState>()((set) => ({
  draggingWorkspaceId: null,
  setDragging: (workspaceId) => set({ draggingWorkspaceId: workspaceId }),
}));

export const useDraggingWorkspaceId = () =>
  usePillDragStore((s) => s.draggingWorkspaceId);
