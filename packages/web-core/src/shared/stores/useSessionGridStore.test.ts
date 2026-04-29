import { describe, it, expect } from 'vitest';
import { __testing } from './useSessionGridStore';

const {
  emptyGrid,
  reduceSetFirstCellSession,
  reduceSplitFromPill,
  reduceCloseCell,
  reduceRemoveSession,
  getAllCells,
} = __testing;

describe('reduceSetFirstCellSession', () => {
  it('replaces the first cell session and focuses it', () => {
    const g = emptyGrid('A');
    const next = reduceSetFirstCellSession(g, 'B');
    expect(next.groups[0].cells[0].sessionId).toBe('B');
    expect(next.focusedCellId).toBe(next.groups[0].cells[0].id);
  });

  it('focuses the existing cell when the URL already matches the first cell', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    const bCellId = g.groups[1].cells[0].id;
    // URL effect re-fires with A — A is already in cell #1.
    const next = reduceSetFirstCellSession(g, 'A');
    expect(next.focusedCellId).toBe(g.groups[0].cells[0].id);
    // The B cell should still exist untouched.
    expect(next.groups[1].cells[0].id).toBe(bCellId);
  });

  it('replaces cell #1 and drops the duplicate when the session was mounted elsewhere', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    // URL changes to /workspaces/B (which is in cell #2).
    const next = reduceSetFirstCellSession(g, 'B');
    // Cell #1 now has B, cell #2 was dropped (no duplicates).
    expect(getAllCells(next)).toHaveLength(1);
    expect(next.groups[0].cells[0].sessionId).toBe('B');
  });
});

describe('reduceSplitFromPill', () => {
  it('first split with half=right sets vertical orientation and adds a column', () => {
    const g = emptyGrid('A');
    const next = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    expect(next.primaryOrientation).toBe('vertical');
    expect(next.groups).toHaveLength(2);
    expect(next.groups[1].cells[0].sessionId).toBe('B');
  });

  it('first split with half=bottom sets horizontal orientation', () => {
    const g = emptyGrid('A');
    const next = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'bottom',
    });
    expect(next.primaryOrientation).toBe('horizontal');
    expect(next.groups).toHaveLength(2);
  });

  it('second split orthogonal: bottom-drop on a 2-column layout stacks within the target group', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    // Now split A's cell with bottom: should add a stacked cell in column 0.
    const aCellId = g.groups[0].cells[0].id;
    const next = reduceSplitFromPill(g, 'C', {
      cellId: aCellId,
      half: 'bottom',
    });
    expect(next.groups[0].cells).toHaveLength(2);
    expect(next.groups[0].cells[1].sessionId).toBe('C');
    expect(next.groups[1].cells).toHaveLength(1);
  });

  it('full 2x2: drop on right with 2 columns already → "open in split" (replaces target cell)', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    g = reduceSplitFromPill(g, 'C', {
      cellId: g.groups[0].cells[0].id,
      half: 'bottom',
    });
    g = reduceSplitFromPill(g, 'D', {
      cellId: g.groups[1].cells[0].id,
      half: 'bottom',
    });
    expect(getAllCells(g)).toHaveLength(4);
    // Drop E with half=right onto B (column 1, top) — columns are maxed → replace B.
    const bCellId = g.groups[1].cells[0].id;
    const next = reduceSplitFromPill(g, 'E', {
      cellId: bCellId,
      half: 'right',
    });
    expect(getAllCells(next)).toHaveLength(4);
    expect(next.groups[1].cells[0].sessionId).toBe('E');
  });

  it('drag of an already-mounted session is a no-op', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    const before = g;
    const after = reduceSplitFromPill(before, 'A', {
      cellId: before.groups[1].cells[0].id,
      half: 'bottom',
    });
    expect(after).toBe(before);
  });
});

describe('reduceCloseCell', () => {
  it('refuses to close the first cell', () => {
    const g = emptyGrid('A');
    const next = reduceCloseCell(g, g.groups[0].cells[0].id);
    expect(next).toBe(g);
  });

  it('removes a sibling and resets group ratio', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'bottom',
    });
    expect(g.groups[0].cells).toHaveLength(2);
    const bCellId = g.groups[0].cells[1].id;
    const next = reduceCloseCell(g, bCellId);
    expect(next.groups[0].cells).toHaveLength(1);
    expect(next.groups[0].splitRatio).toBeCloseTo(0.5);
  });

  it('removes a whole group and shifts focus to the surviving group', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    const bCellId = g.groups[1].cells[0].id;
    // Focus is on B (the freshly-added cell).
    expect(g.focusedCellId).toBe(bCellId);
    const next = reduceCloseCell(g, bCellId);
    expect(next.groups).toHaveLength(1);
    expect(next.focusedCellId).toBe(next.groups[0].cells[0].id);
    expect(next.splitRatio).toBeCloseTo(0.5);
  });

  it('does not change focus when closing a non-focused cell', () => {
    // Build [A,B] | [C], focus on A.
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'bottom',
    });
    g = reduceSplitFromPill(g, 'C', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    const aCellId = g.groups[0].cells[0].id;
    g = { ...g, focusedCellId: aCellId };
    const bCellId = g.groups[0].cells[1].id;
    const next = reduceCloseCell(g, bCellId);
    expect(next.focusedCellId).toBe(aCellId);
  });

  it('preserves the surviving group splitRatio when closing one cell of a 2x2', () => {
    // Build full 2x2.
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    g = reduceSplitFromPill(g, 'C', {
      cellId: g.groups[0].cells[0].id,
      half: 'bottom',
    });
    g = reduceSplitFromPill(g, 'D', {
      cellId: g.groups[1].cells[0].id,
      half: 'bottom',
    });
    // User dragged the secondary handle: groups[1].splitRatio becomes 0.7.
    g = {
      ...g,
      groups: [g.groups[0], { ...g.groups[1], splitRatio: 0.7 }],
    };
    // Close C (groups[0].cells[1]). The untouched group's ratio must persist.
    const cCellId = g.groups[0].cells[1].id;
    const next = reduceCloseCell(g, cCellId);
    expect(next.groups[1].splitRatio).toBeCloseTo(0.7);
  });
});

describe('reduceRemoveSession', () => {
  it('promotes the next cell when the first cell session is deleted externally', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    const next = reduceRemoveSession(g, 'A');
    expect(getAllCells(next)).toHaveLength(1);
    expect(next.groups[0].cells[0].sessionId).toBe('B');
  });

  it('with only one cell, leaves an empty placeholder', () => {
    const g = emptyGrid('A');
    const next = reduceRemoveSession(g, 'A');
    expect(getAllCells(next)).toHaveLength(1);
    expect(next.groups[0].cells[0].sessionId).toBe('');
  });

  it('removing a non-first cell collapses normally without touching the first cell', () => {
    let g = emptyGrid('A');
    g = reduceSplitFromPill(g, 'B', {
      cellId: g.groups[0].cells[0].id,
      half: 'right',
    });
    const next = reduceRemoveSession(g, 'B');
    expect(getAllCells(next)).toHaveLength(1);
    expect(next.groups[0].cells[0].sessionId).toBe('A');
  });
});
