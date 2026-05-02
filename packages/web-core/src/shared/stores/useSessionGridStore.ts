import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Session-grid store — describes how the workspace area is split into 1–4
// session cells. Top-left cell is the "first cell": never closeable, becomes
// the target when a pill is clicked from the sidebar.
//
// Layout is two-level. The primary axis (vertical or horizontal) is set by
// the *first* split — drop on the right half to split horizontally (vertical
// orientation gives two side-by-side groups); drop on the bottom half to
// stack (horizontal orientation gives two over/under groups). Secondary
// splits inside a group go orthogonal. When the grid collapses back to 1
// cell, primaryOrientation resets.
// ---------------------------------------------------------------------------

export type CellId = string;
export type SessionId = string;
export type PrimaryOrientation = 'vertical' | 'horizontal';

export type SessionCell = {
  id: CellId;
  sessionId: SessionId;
};

export type SessionGroup = {
  cells: SessionCell[]; // 1 or 2
  /** 0..1 ratio for the first cell within this group; ignored when 1 cell. */
  splitRatio: number;
};

export type SessionGrid = {
  primaryOrientation: PrimaryOrientation;
  /** 1 or 2 groups, max. */
  groups: SessionGroup[];
  /** 0..1 ratio for the first group; ignored when 1 group. */
  splitRatio: number;
  focusedCellId: CellId;
};

export type DropHalf = 'right' | 'bottom' | 'top' | 'left' | 'full';

export type DropTarget = {
  cellId: CellId;
  half: DropHalf;
};

const DEFAULT_RATIO = 0.5;

function newCellId(): CellId {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `cell-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function makeCell(sessionId: SessionId): SessionCell {
  return { id: newCellId(), sessionId };
}

function makeGroup(cells: SessionCell[]): SessionGroup {
  return { cells, splitRatio: DEFAULT_RATIO };
}

function emptyGrid(sessionId: SessionId): SessionGrid {
  const cell = makeCell(sessionId);
  return {
    primaryOrientation: 'vertical',
    groups: [makeGroup([cell])],
    splitRatio: DEFAULT_RATIO,
    focusedCellId: cell.id,
  };
}

// ---------------------------------------------------------------------------
// Reducers — pure helpers exported for testability.
// ---------------------------------------------------------------------------

function findCell(
  grid: SessionGrid,
  cellId: CellId
): { groupIndex: number; cellIndex: number } | null {
  for (let g = 0; g < grid.groups.length; g++) {
    const cells = grid.groups[g].cells;
    for (let c = 0; c < cells.length; c++) {
      if (cells[c].id === cellId) return { groupIndex: g, cellIndex: c };
    }
  }
  return null;
}

function findCellBySessionId(
  grid: SessionGrid,
  sessionId: SessionId
): SessionCell | undefined {
  if (!sessionId) return undefined;
  for (const group of grid.groups) {
    for (const cell of group.cells) {
      if (cell.sessionId === sessionId) return cell;
    }
  }
  return undefined;
}

function getAllCells(grid: SessionGrid): SessionCell[] {
  return grid.groups.flatMap((g) => g.cells);
}

function isFirstCell(grid: SessionGrid, cellId: CellId): boolean {
  return grid.groups[0]?.cells[0]?.id === cellId;
}

/**
 * Pick a fallback cell when the focused cell goes away.
 * "The cell that absorbed the space" — i.e. the surviving sibling in the
 * group, or if the whole group collapsed, a cell from the other group.
 */
function pickFallbackFocus(
  newGrid: SessionGrid,
  closedLocation: { groupIndex: number; cellIndex: number }
): CellId {
  // If the group still exists, focus the surviving sibling.
  const group = newGrid.groups[closedLocation.groupIndex];
  if (group) {
    const sibling = group.cells[Math.max(0, closedLocation.cellIndex - 1)];
    if (sibling) return sibling.id;
  }
  // Otherwise pick the first cell of the first remaining group.
  return newGrid.groups[0].cells[0].id;
}

function reduceSetFirstCellSession(
  grid: SessionGrid,
  sessionId: SessionId
): SessionGrid {
  // Already in the first cell → focus it and stop.
  const firstCellSessionId = grid.groups[0]?.cells[0]?.sessionId;
  if (firstCellSessionId === sessionId) {
    return {
      ...grid,
      focusedCellId: grid.groups[0].cells[0].id,
    };
  }

  // If mounted in another cell, drop that cell first so the session ends up
  // only in cell #1 (no duplicates). Reflow may collapse a group.
  let working = grid;
  const dup = findCellBySessionId(working, sessionId);
  if (dup) {
    working = reduceCloseCell(working, dup.id);
  }

  return rewriteFirstCellSession(working, sessionId);
}

function reduceSplitFromPill(
  grid: SessionGrid,
  sessionId: SessionId,
  target: DropTarget
): SessionGrid {
  // Already mounted — drag is a no-op (per design).
  if (findCellBySessionId(grid, sessionId)) return grid;

  const loc = findCell(grid, target.cellId);
  if (!loc) return grid;

  // 'full' → unconditional replace. The overlay offers this when the target
  // cell is in a full (2-cell) group.
  if (target.half === 'full') {
    return reduceReplaceCell(grid, target.cellId, sessionId);
  }

  const totalCells = getAllCells(grid).length;

  // First split: orientation is decided here. 'right' → vertical (columns),
  // 'bottom' → horizontal (rows). Other halves are not offered in this state.
  if (totalCells === 1) {
    if (target.half !== 'right' && target.half !== 'bottom') return grid;
    const orientation: PrimaryOrientation =
      target.half === 'right' ? 'vertical' : 'horizontal';
    const newCell = makeCell(sessionId);
    return {
      primaryOrientation: orientation,
      groups: [grid.groups[0], makeGroup([newCell])],
      splitRatio: DEFAULT_RATIO,
      focusedCellId: newCell.id,
    };
  }

  // After the first split, the secondary axis (within group) is perpendicular
  // to primary. 'top'/'bottom' insert before/after for vertical primary;
  // 'left'/'right' insert before/after for horizontal primary.
  const targetGroup = grid.groups[loc.groupIndex];
  const newCell = makeCell(sessionId);

  if (targetGroup.cells.length >= 2) {
    // Defensive — overlay should offer 'full' instead of stack halves here.
    return reduceReplaceCell(grid, target.cellId, sessionId);
  }

  let insertAt: number | null = null;
  if (grid.primaryOrientation === 'vertical') {
    if (target.half === 'top') insertAt = 0;
    else if (target.half === 'bottom') insertAt = targetGroup.cells.length;
    else if (target.half === 'right') {
      // Defensive cross-axis path (overlay doesn't currently offer this in
      // multi-cell state). Add a new group when there's room; else replace.
      if (grid.groups.length < 2) {
        return {
          ...grid,
          groups: [...grid.groups, makeGroup([newCell])],
          focusedCellId: newCell.id,
        };
      }
      return reduceReplaceCell(grid, target.cellId, sessionId);
    }
  } else {
    if (target.half === 'left') insertAt = 0;
    else if (target.half === 'right') insertAt = targetGroup.cells.length;
    else if (target.half === 'bottom') {
      if (grid.groups.length < 2) {
        return {
          ...grid,
          groups: [...grid.groups, makeGroup([newCell])],
          focusedCellId: newCell.id,
        };
      }
      return reduceReplaceCell(grid, target.cellId, sessionId);
    }
  }

  if (insertAt === null) return grid;

  const cells = targetGroup.cells.slice();
  cells.splice(insertAt, 0, newCell);
  const newGroups = grid.groups.slice();
  newGroups[loc.groupIndex] = { ...targetGroup, cells };
  return { ...grid, groups: newGroups, focusedCellId: newCell.id };
}

/**
 * Compute the drop halves a cell should expose to the overlay. The rules:
 *   - Cell in a full (2-cell) group → ['full'] (replace only).
 *   - Initial single-cell grid → ['right', 'bottom'] (orientation picker).
 *   - Cell in a 1-cell group with another group present → sandwich along the
 *     secondary axis. The anchor cell (groups[0].cells[0]) only exposes the
 *     "after" half so the dragged session can never displace it.
 */
function getValidDropHalves(grid: SessionGrid, cellId: CellId): DropHalf[] {
  const loc = findCell(grid, cellId);
  if (!loc) return [];
  const group = grid.groups[loc.groupIndex];
  if (group.cells.length === 2) return ['full'];

  const totalCells = getAllCells(grid).length;
  if (totalCells === 1) return ['right', 'bottom'];

  const isAnchor = isFirstCell(grid, cellId);
  if (grid.primaryOrientation === 'vertical') {
    return isAnchor ? ['bottom'] : ['top', 'bottom'];
  }
  return isAnchor ? ['right'] : ['left', 'right'];
}

function reduceReplaceCell(
  grid: SessionGrid,
  cellId: CellId,
  sessionId: SessionId
): SessionGrid {
  const loc = findCell(grid, cellId);
  if (!loc) return grid;
  const groups = grid.groups.slice();
  const cells = groups[loc.groupIndex].cells.slice();
  const replacement: SessionCell = { id: newCellId(), sessionId };
  cells[loc.cellIndex] = replacement;
  groups[loc.groupIndex] = { ...groups[loc.groupIndex], cells };
  return { ...grid, groups, focusedCellId: replacement.id };
}

function reduceCloseCell(grid: SessionGrid, cellId: CellId): SessionGrid {
  // First cell is the unclosable anchor.
  if (isFirstCell(grid, cellId)) return grid;
  const loc = findCell(grid, cellId);
  if (!loc) return grid;

  const groups = grid.groups.slice();
  const groupCells = groups[loc.groupIndex].cells.slice();
  groupCells.splice(loc.cellIndex, 1);

  if (groupCells.length === 0) {
    // Drop the whole group; collapse to single column → reset orientation
    // ratio to default so a future re-split starts at 50/50.
    groups.splice(loc.groupIndex, 1);
    const collapsed: SessionGrid = {
      ...grid,
      groups,
      splitRatio: DEFAULT_RATIO,
    };
    // If we're back to a single cell, primaryOrientation reset is purely
    // informational; reset to default for cleanliness.
    if (groups.length === 1 && groups[0].cells.length === 1) {
      collapsed.primaryOrientation = 'vertical';
    }
    const focusWasOnClosed = grid.focusedCellId === cellId;
    if (focusWasOnClosed) {
      collapsed.focusedCellId = pickFallbackFocus(collapsed, loc);
    }
    return collapsed;
  }

  // Group still has a cell. Don't touch its splitRatio — only a *full*
  // collapse to one group resets ratios (covered in the branch above).
  groups[loc.groupIndex] = {
    ...groups[loc.groupIndex],
    cells: groupCells,
  };

  const newGrid: SessionGrid = { ...grid, groups };
  if (grid.focusedCellId === cellId) {
    newGrid.focusedCellId = pickFallbackFocus(newGrid, loc);
  }
  return newGrid;
}

/**
 * Replace the first cell's session unconditionally (does not early-return
 * if the session is already mounted elsewhere). Used internally by
 * `reduceRemoveSession` when promoting a cell into the first slot — the
 * promoted session is *always* still mounted in the source cell at this
 * point, so the public `reduceSetFirstCellSession` path would refuse.
 */
function rewriteFirstCellSession(
  grid: SessionGrid,
  sessionId: SessionId
): SessionGrid {
  const firstGroup = grid.groups[0];
  const [firstCell, ...rest] = firstGroup.cells;
  const updated: SessionCell = { ...firstCell, sessionId };
  return {
    ...grid,
    groups: [
      { ...firstGroup, cells: [updated, ...rest] },
      ...grid.groups.slice(1),
    ],
    focusedCellId: updated.id,
  };
}

/**
 * Collapse the abnormal "1 group with 2 cells" state into the equivalent
 * "2 groups with 1 cell each" state, flipping `primaryOrientation` so the
 * pixel layout is preserved. Without this, dropping on a 2-cell group's cell
 * is forced to "Open here" replace because `getValidDropHalves` reports
 * `['full']` for any cell in a full group — leaving the user unable to
 * grow the layout to a 3-cell shape from a single column / single row.
 *
 * Reachable today via close-then-collapse (e.g. start with [A]|[B], stack
 * C below A → [A,C]|[B], then close B → [A,C] in a single group).
 */
function normalizeGrid(grid: SessionGrid): SessionGrid {
  if (grid.groups.length !== 1 || grid.groups[0].cells.length !== 2) {
    return grid;
  }
  const onlyGroup = grid.groups[0];
  const [c0, c1] = onlyGroup.cells;
  return {
    ...grid,
    primaryOrientation:
      grid.primaryOrientation === 'vertical' ? 'horizontal' : 'vertical',
    groups: [
      { cells: [c0], splitRatio: DEFAULT_RATIO },
      { cells: [c1], splitRatio: DEFAULT_RATIO },
    ],
    splitRatio: onlyGroup.splitRatio,
  };
}

function reduceRemoveSession(
  grid: SessionGrid,
  sessionId: SessionId
): SessionGrid {
  const cell = findCellBySessionId(grid, sessionId);
  if (!cell) return grid;
  // External deletion can hit the first cell. If so, promote the next cell
  // by removing the first cell's session — the grid must always have a first
  // cell, so we collapse and let setFirstCellSession be called separately
  // for any pending URL-based session.
  if (isFirstCell(grid, cell.id)) {
    // Find the next cell to promote.
    const allCells = getAllCells(grid);
    if (allCells.length === 1) {
      // Only the first cell exists and its session was deleted. Leave the
      // cell in place but with an empty sessionId — caller is expected to
      // call setFirstCellSession with a replacement.
      const updated: SessionCell = { ...cell, sessionId: '' };
      return {
        ...grid,
        groups: [
          {
            ...grid.groups[0],
            cells: [updated, ...grid.groups[0].cells.slice(1)],
          },
        ],
        focusedCellId: updated.id,
      };
    }
    // Promote the next cell's session into the first slot, then drop the
    // source cell. We use the internal `rewriteFirstCellSession` because
    // the promoted session is currently mounted in the source cell and the
    // public setFirstCellSession would refuse the duplication.
    const next = allCells[1];
    return reduceCloseCell(
      rewriteFirstCellSession(grid, next.sessionId),
      next.id
    );
  }
  return reduceCloseCell(grid, cell.id);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SessionGridState {
  grid: SessionGrid;
  setFirstCellSession: (sessionId: SessionId) => void;
  splitFromPill: (sessionId: SessionId, target: DropTarget) => void;
  closeCell: (cellId: CellId) => void;
  focusCell: (cellId: CellId) => void;
  setPrimarySplitRatio: (ratio: number) => void;
  setGroupSplitRatio: (groupIndex: number, ratio: number) => void;
  removeSession: (sessionId: SessionId) => void;
}

export const useSessionGridStore = create<SessionGridState>()(
  persist(
    (set) => ({
      grid: emptyGrid(''),

      setFirstCellSession: (sessionId) =>
        set((s) => ({
          grid: normalizeGrid(reduceSetFirstCellSession(s.grid, sessionId)),
        })),

      splitFromPill: (sessionId, target) =>
        set((s) => ({
          grid: normalizeGrid(reduceSplitFromPill(s.grid, sessionId, target)),
        })),

      closeCell: (cellId) =>
        set((s) => ({ grid: normalizeGrid(reduceCloseCell(s.grid, cellId)) })),

      focusCell: (cellId) =>
        set((s) => {
          if (!findCell(s.grid, cellId)) return s;
          if (s.grid.focusedCellId === cellId) return s;
          return { grid: { ...s.grid, focusedCellId: cellId } };
        }),

      setPrimarySplitRatio: (ratio) =>
        set((s) => ({ grid: { ...s.grid, splitRatio: clamp01(ratio) } })),

      setGroupSplitRatio: (groupIndex, ratio) =>
        set((s) => {
          if (groupIndex < 0 || groupIndex >= s.grid.groups.length) return s;
          const groups = s.grid.groups.slice();
          groups[groupIndex] = {
            ...groups[groupIndex],
            splitRatio: clamp01(ratio),
          };
          return { grid: { ...s.grid, groups } };
        }),

      removeSession: (sessionId) =>
        set((s) => ({
          grid: normalizeGrid(reduceRemoveSession(s.grid, sessionId)),
        })),
    }),
    {
      name: 'vk-session-grid',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ grid: s.grid }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { grid?: SessionGrid } | undefined;
        const grid = persisted?.grid;
        if (!grid || !grid.groups || grid.groups.length === 0) {
          return currentState;
        }
        // Repair: ensure focusedCellId points to a real cell.
        const allCells = grid.groups.flatMap((g) => g.cells);
        const focusValid = allCells.some((c) => c.id === grid.focusedCellId);
        const repaired = focusValid
          ? grid
          : { ...grid, focusedCellId: allCells[0]?.id ?? '' };
        // Self-heal any persisted "1 group, 2 cells" abnormal state so users
        // returning from an older build land in the normalized shape.
        return { ...currentState, grid: normalizeGrid(repaired) };
      },
    }
  )
);

function clamp01(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_RATIO;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ---------------------------------------------------------------------------
// Selectors / hooks
// ---------------------------------------------------------------------------

export const useSessionGrid = () => useSessionGridStore((s) => s.grid);

export const useFocusedCellId = () =>
  useSessionGridStore((s) => s.grid.focusedCellId);

export const useFocusedCell = (): SessionCell | undefined =>
  useSessionGridStore((s) =>
    getAllCells(s.grid).find((c) => c.id === s.grid.focusedCellId)
  );

export const useSessionInGrid = (sessionId: SessionId): boolean =>
  useSessionGridStore((s) => findCellBySessionId(s.grid, sessionId) != null);

export const useFirstCellSessionId = (): SessionId =>
  useSessionGridStore((s) => s.grid.groups[0]?.cells[0]?.sessionId ?? '');

export { getValidDropHalves };

// Re-export pure reducers for unit testing.
export const __testing = {
  emptyGrid,
  reduceSetFirstCellSession,
  reduceSplitFromPill,
  reduceCloseCell,
  reduceRemoveSession,
  normalizeGrid,
  findCell,
  findCellBySessionId,
  getAllCells,
  getValidDropHalves,
};
