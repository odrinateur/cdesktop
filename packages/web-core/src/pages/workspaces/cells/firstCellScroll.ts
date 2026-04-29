// Module-scoped registration for the first cell's scroll-to-bottom. The
// sidebar lives outside the SessionGrid, so when its "scroll" affordance
// fires it needs to reach the first cell's chat container without prop
// drilling through the grid. The first cell registers on mount; the
// sidebar calls `scrollFirstCellToBottom` when needed.

type ScrollFn = (behavior?: 'auto' | 'smooth') => void;

let registered: ScrollFn | null = null;

export function registerFirstCellScroll(fn: ScrollFn | null) {
  registered = fn;
}

export function scrollFirstCellToBottom(
  behavior: 'auto' | 'smooth' = 'smooth'
) {
  registered?.(behavior);
}
