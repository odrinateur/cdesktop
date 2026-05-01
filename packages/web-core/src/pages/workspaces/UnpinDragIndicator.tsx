import { useEffect, useState } from 'react';
import { usePillDragStore } from '@/shared/stores/usePillDragStore';

/**
 * Floating "release to unpin" indicator. Visible while a pinned pill is
 * being dragged outside the Pinned section. Tracks the cursor via a
 * document-level dragover listener so it follows the pointer wherever
 * the user moves it (sidebar, cell area, anywhere).
 *
 * The indicator itself is non-interactive (`pointer-events-none`); the
 * actual unpin happens in the pill's onDragEnd in the sidebar container,
 * which checks dropEffect === 'none' and isOverPinArea === false.
 */
export function UnpinDragIndicator() {
  const dragging = usePillDragStore((s) => s.draggingWorkspaceId !== null);
  const isPinned = usePillDragStore((s) => s.draggingIsPinned);
  const overTarget = usePillDragStore((s) => s.isOverDropTarget);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!dragging || !isPinned) {
      setPos(null);
      return;
    }
    const handler = (e: DragEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener('dragover', handler);
    return () => document.removeEventListener('dragover', handler);
  }, [dragging, isPinned]);

  if (!dragging || !isPinned || overTarget || !pos) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.y + 12,
        left: pos.x + 12,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
      className="px-base py-half rounded text-xs font-medium text-white bg-red-500 shadow-md whitespace-nowrap"
    >
      Release to unpin
    </div>
  );
}
