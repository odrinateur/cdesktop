import { useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  useDraggingWorkspaceId,
  usePillDragStore,
} from '@/shared/stores/usePillDragStore';
import {
  useSessionGridStore,
  type CellId,
  type DropHalf,
} from '@/shared/stores/useSessionGridStore';

/**
 * Absolute-positioned overlay that lights up while a pill is being
 * dragged. Covers the entire cell, splits into two drop zones (right
 * half + bottom half). On drop, dispatches `splitFromPill` with the
 * drop target.
 */
export function CellDropOverlay({ cellId }: { cellId: CellId }) {
  const draggingWorkspaceId = useDraggingWorkspaceId();
  const [hoverHalf, setHoverHalf] = useState<DropHalf | null>(null);

  // Determine the label by simulating what the reducer would do — if a
  // new cell would be created, "Add split"; otherwise "Open in split".
  const wouldCreateNewCell = useSessionGridStore((s) => {
    if (!hoverHalf) return false;
    const grid = s.grid;
    const cellLoc = (() => {
      for (let g = 0; g < grid.groups.length; g++) {
        for (let c = 0; c < grid.groups[g].cells.length; c++) {
          if (grid.groups[g].cells[c].id === cellId) {
            return { g, c };
          }
        }
      }
      return null;
    })();
    if (!cellLoc) return false;
    const totalCells = grid.groups.flatMap((gr) => gr.cells).length;
    if (totalCells === 1) return true; // first split always creates a new cell
    const isPrimaryAxisDrop =
      (grid.primaryOrientation === 'vertical' && hoverHalf === 'right') ||
      (grid.primaryOrientation === 'horizontal' && hoverHalf === 'bottom');
    if (isPrimaryAxisDrop) return grid.groups.length < 2;
    return grid.groups[cellLoc.g].cells.length < 2;
  });

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!draggingWorkspaceId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xFrac = (e.clientX - rect.left) / rect.width;
      const yFrac = (e.clientY - rect.top) / rect.height;
      const right = xFrac - 0.5;
      const bottom = yFrac - 0.5;
      // Top-left quadrant is the "no-op" zone — leave it as a passthrough
      // (do NOT preventDefault) so a pinned-pill release here triggers
      // unpin via the source pill's onDragEnd (dropEffect='none').
      if (right < 0 && bottom < 0) {
        setHoverHalf(null);
        usePillDragStore.getState().setOverDropTarget(false);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      let half: DropHalf;
      if (Math.abs(right) > Math.abs(bottom)) {
        half = right > 0 ? 'right' : 'bottom';
      } else {
        half = bottom > 0 ? 'bottom' : 'right';
      }
      setHoverHalf(half);
      usePillDragStore.getState().setOverDropTarget(true);
    },
    [draggingWorkspaceId]
  );

  const handleDragLeave = useCallback(() => {
    setHoverHalf(null);
    usePillDragStore.getState().setOverDropTarget(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const sessionId =
        e.dataTransfer.getData('application/x-vibe-pill') ||
        usePillDragStore.getState().draggingWorkspaceId ||
        '';
      const half = hoverHalf;
      setHoverHalf(null);
      // NOTE: do not clear draggingWorkspaceId here. The source pill's
      // onDragEnd does that *after* this handler returns, and it needs
      // to read draggingIsPinned to decide whether to unpin.
      if (!sessionId || !half) return;
      useSessionGridStore.getState().splitFromPill(sessionId, {
        cellId,
        half,
      });
    },
    [cellId, hoverHalf]
  );

  if (!draggingWorkspaceId) return null;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="absolute inset-0 z-40"
    >
      {/* Right half tint */}
      <div
        className={cn(
          'absolute right-0 top-0 h-full w-1/2 transition-colors pointer-events-none',
          hoverHalf === 'right'
            ? 'bg-blue-500/25 ring-2 ring-inset ring-blue-500/60'
            : ''
        )}
      />
      {/* Bottom half tint */}
      <div
        className={cn(
          'absolute bottom-0 left-0 w-full h-1/2 transition-colors pointer-events-none',
          hoverHalf === 'bottom'
            ? 'bg-blue-500/25 ring-2 ring-inset ring-blue-500/60'
            : ''
        )}
      />
      {hoverHalf && (
        <div
          className={cn(
            'absolute pointer-events-none rounded-full bg-blue-500 px-3 py-1 text-xs font-medium text-white shadow',
            hoverHalf === 'right'
              ? 'right-1/4 top-1/2 -translate-y-1/2 translate-x-1/2'
              : 'bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2'
          )}
        >
          {wouldCreateNewCell ? 'Add split' : 'Open in split'}
        </div>
      )}
    </div>
  );
}
