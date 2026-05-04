import { useCallback, useEffect, useRef } from 'react';
import {
  Group,
  Layout,
  Panel,
  type GroupImperativeHandle,
} from 'react-resizable-panels';
import {
  useSessionGrid,
  useSessionGridStore,
  type SessionGroup,
  type CellId,
} from '@/shared/stores/useSessionGridStore';
import { CellHost } from './CellHost';
import { ResizeHandle } from '../panels';

/**
 * Renders all session cells from `useSessionGrid` using nested
 * react-resizable-panels Groups. The outer group's orientation comes from
 * `primaryOrientation`; inner groups (within a 2-cell group) go orthogonal.
 *
 * Geometry rules:
 * - Primary-axis ratio persists in `grid.splitRatio`.
 * - Secondary-axis ratios persist per group in `group.splitRatio`.
 * - When both groups have 2 cells (full 2x2), the inner ratios are
 *   synchronized: dragging one in-group handle mirrors the same ratio onto
 *   the other group via the imperative ref.
 */
export function SessionGrid() {
  const grid = useSessionGrid();

  if (!grid.groups[0]?.cells[0]?.sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No session selected.
      </div>
    );
  }

  // Always render the outer <Group> + <Panel> shape, even with one group, so
  // that the surviving cell stays mounted across 1↔2 group transitions
  // (close-the-other-group, split-from-1-group). React preserves a Panel by
  // its position+key; a JSX shape change (bare CellWrapper ↔ Group) would
  // tear it down. Top-insert / cell-reordering still remounts because cells
  // physically swap Panels there.
  const outerOrientation =
    grid.primaryOrientation === 'vertical' ? 'horizontal' : 'vertical';

  const groupCount = grid.groups.length;

  const onPrimaryLayoutChange = (layout: Layout) => {
    if (groupCount < 2) return;
    const ratio = (layout['group-0'] ?? 50) / 100;
    useSessionGridStore.getState().setPrimarySplitRatio(ratio);
  };

  const primaryDefault: Layout =
    groupCount === 2
      ? {
          'group-0': grid.splitRatio * 100,
          'group-1': (1 - grid.splitRatio) * 100,
        }
      : { 'group-0': 100 };

  return (
    <Group
      orientation={outerOrientation}
      className="flex h-full w-full"
      defaultLayout={primaryDefault}
      onLayoutChange={onPrimaryLayoutChange}
    >
      {grid.groups.map((group, index) => {
        const isLast = index === grid.groups.length - 1;
        return (
          <PrimaryGroupSlot
            key={`group-${index}`}
            id={`group-${index}`}
            group={group}
            groupIndex={index}
            isLastGroup={isLast}
            primaryOrientation={grid.primaryOrientation}
          />
        );
      })}
    </Group>
  );
}

function PrimaryGroupSlot({
  id,
  group,
  groupIndex,
  isLastGroup,
  primaryOrientation,
}: {
  id: string;
  group: SessionGroup;
  groupIndex: number;
  isLastGroup: boolean;
  primaryOrientation: 'vertical' | 'horizontal';
}) {
  return (
    <>
      <Panel id={id} minSize="20%" className="min-w-0 min-h-0 overflow-hidden">
        <GroupBody
          group={group}
          groupIndex={groupIndex}
          primaryOrientation={primaryOrientation}
        />
      </Panel>
      {!isLastGroup && (
        <ResizeHandle
          id={`primary-${groupIndex}`}
          orientation={
            primaryOrientation === 'vertical' ? 'vertical' : 'horizontal'
          }
          solid
        />
      )}
    </>
  );
}

function GroupBody({
  group,
  groupIndex,
  primaryOrientation,
}: {
  group: SessionGroup;
  groupIndex: number;
  primaryOrientation: 'vertical' | 'horizontal';
}) {
  const focusedCellId = useSessionGridStore((s) => s.grid.focusedCellId);
  const otherGroupCellCount = useSessionGridStore(
    (s) => s.grid.groups[1 - groupIndex]?.cells.length ?? 0
  );
  const otherGroupRatio = useSessionGridStore(
    (s) => s.grid.groups[1 - groupIndex]?.splitRatio ?? 0.5
  );

  const focusCell = useSessionGridStore((s) => s.focusCell);
  const closeCell = useSessionGridStore((s) => s.closeCell);
  const setGroupSplitRatio = useSessionGridStore((s) => s.setGroupSplitRatio);

  const isFull2x2 = otherGroupCellCount === 2;
  const effectiveRatio = isFull2x2 ? otherGroupRatio : group.splitRatio;
  const groupRef = useRef<GroupImperativeHandle>(null);

  // Imperative ratio mirror: when the *other* group's ratio changes (in
  // 2x2), push the layout into our Group so the visible split tracks.
  // Guarded on `group.cells.length === 2` because the inner <Group> is only
  // rendered in that branch — without this, the effect can fire after a
  // close-then-reopen sequence where react-resizable-panels has briefly torn
  // down the group from its mountedGroups map and setLayout would throw
  // "Could not find Group with id …".
  const ourGroupHasInner = group.cells.length === 2;
  useEffect(() => {
    if (!isFull2x2 || !ourGroupHasInner) return;
    try {
      groupRef.current?.setLayout({
        'cell-0': effectiveRatio * 100,
        'cell-1': (1 - effectiveRatio) * 100,
      });
    } catch {
      // Group was torn down between ref capture and effect run; the next
      // commit will re-establish the layout via defaultLayout.
    }
  }, [effectiveRatio, isFull2x2, ourGroupHasInner]);

  const onInnerLayoutChange = useCallback(
    (layout: Layout) => {
      if (group.cells.length < 2) return;
      const ratio = (layout['cell-0'] ?? 50) / 100;
      setGroupSplitRatio(groupIndex, ratio);
      // 2x2 synchronization: write into the *other* group too so all four
      // panels resize in lockstep.
      if (isFull2x2) {
        setGroupSplitRatio(1 - groupIndex, ratio);
      }
    },
    [group.cells.length, groupIndex, isFull2x2, setGroupSplitRatio]
  );

  // Always render the inner <Group> + <Panel id="cell-0"> shape, even with
  // one cell, so the cell-0 Panel and its CellHost survive 1↔2 cell
  // transitions (bottom-insert, sibling-close). The library accepts a
  // single-Panel Group; ResizeHandle and cell-1 only render at 2 cells.
  const innerOrientation =
    primaryOrientation === 'vertical' ? 'vertical' : 'horizontal';

  const isAnchor = (cellIndex: number) => groupIndex === 0 && cellIndex === 0;

  const innerDefault: Layout =
    group.cells.length === 2
      ? {
          'cell-0': effectiveRatio * 100,
          'cell-1': (1 - effectiveRatio) * 100,
        }
      : { 'cell-0': 100 };

  return (
    <Group
      groupRef={groupRef}
      orientation={innerOrientation}
      className="flex h-full w-full"
      defaultLayout={innerDefault}
      onLayoutChange={onInnerLayoutChange}
    >
      <Panel
        id="cell-0"
        minSize="20%"
        className="min-w-0 min-h-0 overflow-hidden"
      >
        <CellWrapper
          cell={group.cells[0]}
          isFirstCell={isAnchor(0)}
          isFocused={focusedCellId === group.cells[0].id}
          onFocus={() => focusCell(group.cells[0].id)}
          onClose={isAnchor(0) ? undefined : () => closeCell(group.cells[0].id)}
        />
      </Panel>
      {group.cells.length === 2 && (
        <>
          <ResizeHandle
            id={`secondary-${groupIndex}`}
            orientation={
              innerOrientation === 'horizontal' ? 'vertical' : 'horizontal'
            }
            solid
          />
          <Panel
            id="cell-1"
            minSize="20%"
            className="min-w-0 min-h-0 overflow-hidden"
          >
            <CellWrapper
              cell={group.cells[1]}
              isFirstCell={false}
              isFocused={focusedCellId === group.cells[1].id}
              onFocus={() => focusCell(group.cells[1].id)}
              onClose={() => closeCell(group.cells[1].id)}
            />
          </Panel>
        </>
      )}
    </Group>
  );
}

function CellWrapper({
  cell,
  isFirstCell,
  isFocused = true,
  onFocus = () => {},
  onClose,
}: {
  cell: { id: CellId; sessionId: string };
  isFirstCell: boolean;
  isFocused?: boolean;
  onFocus?: () => void;
  onClose?: () => void;
}) {
  return (
    <CellHost
      key={cell.id}
      workspaceId={cell.sessionId}
      cellId={cell.id}
      isFirstCell={isFirstCell}
      isFocused={isFocused}
      onFocus={onFocus}
      onClose={onClose}
    />
  );
}
