import { Fragment, useCallback, type ReactNode } from 'react';
import { Group, type Layout, Panel } from 'react-resizable-panels';
import {
  useWorkspacePanelLayout,
  type PanelId,
} from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { PanelHost } from './PanelHost';
import { ResizeHandle } from './ResizeHandle';

type PanelRenderer = (panelId: PanelId) => ReactNode;
type PanelHeaderRenderer = (panelId: PanelId) => ReactNode | null;

type Props = {
  workspaceId: string | undefined;
  renderPanel: PanelRenderer;
  renderPanelHeader?: PanelHeaderRenderer;
  className?: string;
};

export function PanelLayout({
  workspaceId,
  renderPanel,
  renderPanelHeader,
  className,
}: Props) {
  const { columns, closePanel, setColumnSplitRatio } =
    useWorkspacePanelLayout(workspaceId);

  if (columns.length === 0) {
    return (
      <div
        className={cn(
          'h-full w-full flex items-center justify-center text-sm text-muted-foreground',
          className
        )}
      >
        Open a panel from the menu to begin.
      </div>
    );
  }

  return (
    <Group
      id={`panel-layout-${workspaceId ?? 'none'}`}
      orientation="horizontal"
      className={cn('h-full w-full flex-1 min-w-0', className)}
    >
      {columns.map((column, columnIdx) => (
        <Fragment key={`col-${columnIdx}`}>
          {columnIdx > 0 && (
            <ResizeHandle
              id={`panel-col-sep-${columnIdx}`}
              orientation="vertical"
            />
          )}
          <Panel
            id={`panel-col-${columnIdx}`}
            minSize="15%"
            className="min-w-0 h-full"
          >
            <PanelColumnContent
              panels={column.panels}
              splitRatio={column.splitRatio}
              columnIdx={columnIdx}
              isRightmost={columnIdx === columns.length - 1}
              renderPanel={renderPanel}
              renderPanelHeader={renderPanelHeader}
              onClose={closePanel}
              onSplitChange={setColumnSplitRatio}
            />
          </Panel>
        </Fragment>
      ))}
    </Group>
  );
}

type ColumnProps = {
  panels: PanelId[];
  splitRatio: number | undefined;
  columnIdx: number;
  isRightmost: boolean;
  renderPanel: PanelRenderer;
  renderPanelHeader?: PanelHeaderRenderer;
  onClose: (panelId: PanelId) => void;
  onSplitChange: (columnIdx: number, ratio: number) => void;
};

function PanelColumnContent({
  panels,
  splitRatio,
  columnIdx,
  isRightmost,
  renderPanel,
  renderPanelHeader,
  onClose,
  onSplitChange,
}: ColumnProps) {
  const handleLayoutChange = useCallback(
    (layout: Layout) => {
      const top = layout[`row-${columnIdx}-0`];
      const bottom = layout[`row-${columnIdx}-1`];
      if (typeof top !== 'number' || typeof bottom !== 'number') return;
      const total = top + bottom;
      if (total <= 0) return;
      const ratio = top / total;
      if (Number.isFinite(ratio)) onSplitChange(columnIdx, ratio);
    },
    [columnIdx, onSplitChange]
  );

  if (panels.length === 1) {
    const id = panels[0]!;
    return (
      <div className="h-full w-full p-1">
        <PanelHost
          panelId={id}
          onClose={onClose}
          headerExtras={renderPanelHeader?.(id)}
          reserveMenuSpace={isRightmost}
        >
          {renderPanel(id)}
        </PanelHost>
      </div>
    );
  }

  const [topId, bottomId] = panels;
  const ratio = splitRatio ?? 0.5;
  const defaultLayout: Layout = {
    [`row-${columnIdx}-0`]: ratio,
    [`row-${columnIdx}-1`]: 1 - ratio,
  };

  return (
    <Group
      id={`panel-col-group-${columnIdx}`}
      orientation="vertical"
      className="h-full w-full"
      defaultLayout={defaultLayout}
      onLayoutChange={handleLayoutChange}
    >
      <Panel id={`row-${columnIdx}-0`} minSize="15%" className="min-h-0 w-full">
        <div className="h-full w-full p-1">
          <PanelHost
            panelId={topId!}
            onClose={onClose}
            headerExtras={renderPanelHeader?.(topId!)}
            reserveMenuSpace={isRightmost}
          >
            {renderPanel(topId!)}
          </PanelHost>
        </div>
      </Panel>
      <ResizeHandle
        id={`panel-row-sep-${columnIdx}`}
        orientation="horizontal"
      />
      <Panel id={`row-${columnIdx}-1`} minSize="15%" className="min-h-0 w-full">
        <div className="h-full w-full p-1">
          <PanelHost
            panelId={bottomId!}
            onClose={onClose}
            headerExtras={renderPanelHeader?.(bottomId!)}
          >
            {renderPanel(bottomId!)}
          </PanelHost>
        </div>
      </Panel>
    </Group>
  );
}
