import { Separator } from 'react-resizable-panels';
import { cn } from '@/shared/lib/utils';

type Orientation = 'horizontal' | 'vertical';

type Props = {
  id: string;
  orientation: Orientation;
  className?: string;
  /**
   * Render a permanent 1px bar in #262625 instead of the transparent gutter.
   * Used for the dividers between session cells.
   */
  solid?: boolean;
};

// Transparent gutter; reveals a thin bar on hover/drag. Used between columns,
// inside columns (between stacked panels), and on the left edge of the panel
// region. The hit area is wider than the visible bar so it's easy to grab.
export function ResizeHandle({ id, orientation, className, solid }: Props) {
  const isVertical = orientation === 'vertical';
  if (solid) {
    return (
      <Separator
        id={id}
        className={cn(
          'shrink-0 bg-[#e2e2e1] dark:bg-[#262625]',
          isVertical ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
          className
        )}
      />
    );
  }
  return (
    <Separator
      id={id}
      className={cn(
        'group relative shrink-0 flex items-center justify-center bg-transparent transition-colors',
        isVertical ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none rounded-full bg-border opacity-0 transition-opacity group-hover:opacity-100',
          isVertical
            ? 'h-[60px] w-px group-hover:w-0.5'
            : 'w-[60px] h-px group-hover:h-0.5'
        )}
      />
    </Separator>
  );
}
