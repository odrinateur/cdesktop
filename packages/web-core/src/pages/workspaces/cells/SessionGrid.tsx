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

  const totalCells = grid.groups.flatMap((g) => g.cells).length;

  // Single-cell fast path — no outer Group needed.
  if (totalCells === 1) {
    return <CellWrapper cell={grid.groups[0].cells[0]} isFirstCell />;
  }

  // primaryOrientation 'vertical' = vertical split line between left/right
  // groups (so children are arranged horizontally).
  const outerOrientation =
    grid.primaryOrientation === 'vertical' ? 'horizontal' : 'vertical';

  const onPrimaryLayoutChange = (layout: Layout) => {
    const ratio = (layout['group-0'] ?? 50) / 100;
    useSessionGridStore.getState().setPrimarySplitRatio(ratio);
  };

  const primaryDefault: Layout = {
    'group-0': grid.splitRatio * 100,
    'group-1': (1 - grid.splitRatio) * 100,
  };

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

  // Hooks below run regardless of cell count — keep them above the
  // 1-cell early return so the hook order stays stable when a group
  // transitions 1↔2 cells (otherwise React throws "rendered more hooks
  // than expected"). When the group has 1 cell the values are unused.
  const isFull2x2 = otherGroupCellCount === 2;
  const effectiveRatio = isFull2x2 ? otherGroupRatio : group.splitRatio;
  const groupRef = useRef<GroupImperativeHandle>(null);

  // Imperative ratio mirror: when the *other* group's ratio changes (in
  // 2x2), push the layout into our Group so the visible split tracks.
  useEffect(() => {
    if (!isFull2x2) return;
    groupRef.current?.setLayout({
      'cell-0': effectiveRatio * 100,
      'cell-1': (1 - effectiveRatio) * 100,
    });
  }, [effectiveRatio, isFull2x2]);

  const onInnerLayoutChange = useCallback(
    (layout: Layout) => {
      const ratio = (layout['cell-0'] ?? 50) / 100;
      setGroupSplitRatio(groupIndex, ratio);
      // 2x2 synchronization: write into the *other* group too so all four
      // panels resize in lockstep.
      if (isFull2x2) {
        setGroupSplitRatio(1 - groupIndex, ratio);
      }
    },
    [groupIndex, isFull2x2, setGroupSplitRatio]
  );

  // Single cell in this group — no inner Group needed.
  if (group.cells.length === 1) {
    const cell = group.cells[0];
    return (
      <CellWrapper
        cell={cell}
        isFirstCell={groupIndex === 0}
        isFocused={focusedCellId === cell.id}
        onFocus={() => focusCell(cell.id)}
        onClose={groupIndex === 0 ? undefined : () => closeCell(cell.id)}
      />
    );
  }

  // Two cells in this group → orthogonal inner Group.
  const innerOrientation =
    primaryOrientation === 'vertical' ? 'vertical' : 'horizontal';

  const innerDefault: Layout = {
    'cell-0': effectiveRatio * 100,
    'cell-1': (1 - effectiveRatio) * 100,
  };

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
          isFirstCell={groupIndex === 0}
          isFocused={focusedCellId === group.cells[0].id}
          onFocus={() => focusCell(group.cells[0].id)}
          onClose={
            groupIndex === 0 ? undefined : () => closeCell(group.cells[0].id)
          }
        />
      </Panel>
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
