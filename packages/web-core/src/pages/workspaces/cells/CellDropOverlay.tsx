import { useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  useDraggingWorkspaceId,
  usePillDragStore,
} from '@/shared/stores/usePillDragStore';
import {
  useSessionGridStore,
  getValidDropHalves,
  type CellId,
  type DropHalf,
} from '@/shared/stores/useSessionGridStore';

/**
 * Absolute-positioned overlay that lights up while a pill is being dragged.
 * The set of valid drop zones is context-dependent (see `getValidDropHalves`):
 *   - Full (2-cell) group → 'full' "Open here" replace.
 *   - Initial single cell → 'right' + 'bottom' to pick orientation.
 *   - 1-cell group beside another group → sandwich along the secondary axis;
 *     the anchor cell only exposes the trailing half.
 */
export function CellDropOverlay({ cellId }: { cellId: CellId }) {
  const draggingWorkspaceId = useDraggingWorkspaceId();
  const [hoverHalf, setHoverHalf] = useState<DropHalf | null>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!draggingWorkspaceId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xFrac = (e.clientX - rect.left) / rect.width;
      const yFrac = (e.clientY - rect.top) / rect.height;
      const halves = getValidDropHalves(
        useSessionGridStore.getState().grid,
        cellId
      );
      const half = pickHalf(halves, xFrac, yFrac);
      if (!half) {
        setHoverHalf(null);
        usePillDragStore.getState().setOverDropTarget(false);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setHoverHalf(half);
      usePillDragStore.getState().setOverDropTarget(true);
    },
    [draggingWorkspaceId, cellId]
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
      {hoverHalf && (
        <div
          className={cn(
            'absolute pointer-events-none transition-colors bg-blue-500/25 ring-2 ring-inset ring-blue-500/60',
            tintClass(hoverHalf)
          )}
        />
      )}
      {hoverHalf && (
        <div
          className={cn(
            'absolute pointer-events-none rounded-full bg-blue-500 px-3 py-1 text-xs font-medium text-white shadow',
            labelPositionClass(hoverHalf)
          )}
        >
          {hoverHalf === 'full' ? 'Open here' : 'Add split'}
        </div>
      )}
    </div>
  );
}

/**
 * Pick the active drop half based on cursor position relative to the cell,
 * constrained to the halves the overlay is actually offering.
 */
function pickHalf(
  validHalves: DropHalf[],
  xFrac: number,
  yFrac: number
): DropHalf | null {
  if (validHalves.length === 0) return null;
  if (validHalves.length === 1) {
    const only = validHalves[0];
    if (only === 'full') return 'full';
    if (only === 'top') return yFrac <= 0.5 ? 'top' : null;
    if (only === 'bottom') return yFrac > 0.5 ? 'bottom' : null;
    if (only === 'left') return xFrac <= 0.5 ? 'left' : null;
    if (only === 'right') return xFrac > 0.5 ? 'right' : null;
    return null;
  }
  const has = (h: DropHalf) => validHalves.includes(h);

  if (has('top') && has('bottom')) {
    return yFrac <= 0.5 ? 'top' : 'bottom';
  }
  if (has('left') && has('right')) {
    return xFrac <= 0.5 ? 'left' : 'right';
  }
  if (has('right') && has('bottom')) {
    // Initial-state orientation picker: top-left quadrant is no-op so a
    // pinned-pill release there triggers unpin via the source onDragEnd.
    const right = xFrac - 0.5;
    const bottom = yFrac - 0.5;
    if (right < 0 && bottom < 0) return null;
    if (Math.abs(right) > Math.abs(bottom)) {
      return right > 0 ? 'right' : 'bottom';
    }
    return bottom > 0 ? 'bottom' : 'right';
  }
  return null;
}

function tintClass(half: DropHalf): string {
  switch (half) {
    case 'full':
      return 'inset-0';
    case 'right':
      return 'right-0 top-0 h-full w-1/2';
    case 'left':
      return 'left-0 top-0 h-full w-1/2';
    case 'bottom':
      return 'bottom-0 left-0 w-full h-1/2';
    case 'top':
      return 'top-0 left-0 w-full h-1/2';
  }
}

function labelPositionClass(half: DropHalf): string {
  switch (half) {
    case 'full':
      return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
    case 'right':
      return 'right-1/4 top-1/2 -translate-y-1/2 translate-x-1/2';
    case 'left':
      return 'left-1/4 top-1/2 -translate-y-1/2 -translate-x-1/2';
    case 'bottom':
      return 'bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2';
    case 'top':
      return 'top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2';
  }
}
