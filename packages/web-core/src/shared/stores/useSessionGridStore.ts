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

export type DropHalf = 'right' | 'bottom';

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

  const totalCells = getAllCells(grid).length;

  // First split: orientation is decided here. 'right' → vertical (columns),
  // 'bottom' → horizontal (rows).
  if (totalCells === 1) {
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

  // After the first split, 'right' and 'bottom' map to "across primary axis"
  // vs "within group" depending on orientation.
  const isPrimaryAxisDrop =
    (grid.primaryOrientation === 'vertical' && target.half === 'right') ||
    (grid.primaryOrientation === 'horizontal' && target.half === 'bottom');

  const newCell = makeCell(sessionId);

  if (isPrimaryAxisDrop) {
    // Want a new group across the primary axis.
    if (grid.groups.length < 2) {
      return {
        ...grid,
        groups: [...grid.groups, makeGroup([newCell])],
        focusedCellId: newCell.id,
      };
    }
    // Already maxed → "Open in split": replace the target cell.
    return reduceReplaceCell(grid, target.cellId, sessionId);
  }

  // Stack within the target's group.
  const targetGroup = grid.groups[loc.groupIndex];
  if (targetGroup.cells.length < 2) {
    const newGroup: SessionGroup = {
      ...targetGroup,
      cells: [...targetGroup.cells, newCell],
    };
    const newGroups = grid.groups.slice();
    newGroups[loc.groupIndex] = newGroup;
    return { ...grid, groups: newGroups, focusedCellId: newCell.id };
  }
  // Group is full → "Open in split": replace the target cell.
  return reduceReplaceCell(grid, target.cellId, sessionId);
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
        set((s) => ({ grid: reduceSetFirstCellSession(s.grid, sessionId) })),

      splitFromPill: (sessionId, target) =>
        set((s) => ({ grid: reduceSplitFromPill(s.grid, sessionId, target) })),

      closeCell: (cellId) =>
        set((s) => ({ grid: reduceCloseCell(s.grid, cellId) })),

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
        set((s) => ({ grid: reduceRemoveSession(s.grid, sessionId) })),
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
        return {
          ...currentState,
          grid: focusValid
            ? grid
            : { ...grid, focusedCellId: allCells[0]?.id ?? '' },
        };
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

// Re-export pure reducers for unit testing.
export const __testing = {
  emptyGrid,
  reduceSetFirstCellSession,
  reduceSplitFromPill,
  reduceCloseCell,
  reduceRemoveSession,
  findCell,
  findCellBySessionId,
  getAllCells,
};
