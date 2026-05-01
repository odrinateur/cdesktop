import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Tiny store for in-progress pill drags. Sidebar pills set
// `draggingWorkspaceId` on dragStart; cell drop overlays read it to decide
// whether to show their drop zones; everyone clears on dragEnd.
// ---------------------------------------------------------------------------

interface PillDragState {
  draggingWorkspaceId: string | null;
  /** True when the pill being dragged is currently pinned. */
  draggingIsPinned: boolean;
  /**
   * Whether the cursor is currently over a real drop target (pin section
   * or a cell's active drop half). Used to hide the "release to unpin"
   * indicator while the cursor is over something that will accept the
   * drop.
   */
  isOverDropTarget: boolean;
  /**
   * Set synchronously by the Pinned section's drop handler. Read in the
   * source pill's `onDragEnd` to decide whether the release should unpin
   * (any drop *outside* pin section unpins; pin-section drop does not).
   */
  droppedInPinSection: boolean;
  setDragging: (workspaceId: string | null, isPinned?: boolean) => void;
  setOverDropTarget: (over: boolean) => void;
  setDroppedInPinSection: (v: boolean) => void;
}

export const usePillDragStore = create<PillDragState>()((set) => ({
  draggingWorkspaceId: null,
  draggingIsPinned: false,
  isOverDropTarget: false,
  droppedInPinSection: false,
  setDragging: (workspaceId, isPinned = false) =>
    set({
      draggingWorkspaceId: workspaceId,
      draggingIsPinned: workspaceId !== null && isPinned,
      isOverDropTarget: false,
      droppedInPinSection: false,
    }),
  setOverDropTarget: (over) => set({ isOverDropTarget: over }),
  setDroppedInPinSection: (v) => set({ droppedInPinSection: v }),
}));

export const useDraggingWorkspaceId = () =>
  usePillDragStore((s) => s.draggingWorkspaceId);
