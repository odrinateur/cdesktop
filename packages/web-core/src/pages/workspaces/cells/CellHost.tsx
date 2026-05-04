import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Group, Layout, Panel } from 'react-resizable-panels';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { ChangesViewProvider } from '@/shared/hooks/ChangesViewProvider';
import { ReviewProvider } from '@/shared/hooks/ReviewProvider';
import { WorkspaceProvider } from '@/shared/providers/WorkspaceProvider';
import { ExecutionProcessesProvider } from '@/shared/providers/ExecutionProcessesProvider';
import { LogsPanelProvider } from '@/shared/providers/LogsPanelProvider';
import { Actions } from '@/shared/actions';
import { cn } from '@/shared/lib/utils';
import {
  PERSIST_KEYS,
  usePaneSize,
  useWorkspacePanelLayout,
  useWorkspacePanelState,
  type PanelId,
} from '@/shared/stores/useUiPreferencesStore';
import { NavbarBreadcrumbSlot } from '@/shared/components/ui-new/containers/NavbarBreadcrumbSlot';
import { ChangesPanelContainer } from '../ChangesPanelContainer';
import { GitPanelContainer } from '../GitPanelContainer';
import { LogsContentContainer } from '../LogsContentContainer';
import { PreviewBrowserContainer } from '../PreviewBrowserContainer';
import {
  WorkspacesMainContainer,
  type WorkspacesMainContainerHandle,
} from '../WorkspacesMainContainer';
import { TerminalPanelContainer } from '@/shared/components/TerminalPanelContainer';
import { PanelLayout, PanelMenu, ResizeHandle } from '../panels';
import { PanelHeaderActionButton } from '../panels/PanelHeaderActionButton';
import { registerFirstCellScroll } from './firstCellScroll';
import { CellDropOverlay } from './CellDropOverlay';
import { type CellId } from '@/shared/stores/useSessionGridStore';

interface CellHostProps {
  workspaceId: string;
  cellId: CellId;
  /**
   * Whether this is the top-left cell. The first cell registers its
   * chat-scroll callback for the sidebar to reach. Also the only cell
   * without a close affordance.
   */
  isFirstCell: boolean;
  isFocused: boolean;
  onFocus: () => void;
  /** Omitted on the first cell; otherwise wired to the X chrome button. */
  onClose?: () => void;
}

/**
 * Renders one session cell — chat on the left, the cell's panel layout on
 * the right, with a floating panel menu and resize handle between them.
 * Mounts its own WorkspaceProvider/ReviewProvider/ChangesViewProvider so
 * sibling cells stay isolated.
 */
export function CellHost({
  workspaceId,
  cellId,
  isFirstCell,
  isFocused,
  onFocus,
  onClose,
}: CellHostProps) {
  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <CellExecutionProcessesProvider>
        <LogsPanelProvider>
          <ReviewProvider workspaceId={workspaceId}>
            <ChangesViewProvider>
              <CellHostInner
                cellId={cellId}
                isFirstCell={isFirstCell}
                isFocused={isFocused}
                onFocus={onFocus}
                onClose={onClose}
              />
            </ChangesViewProvider>
          </ReviewProvider>
        </LogsPanelProvider>
      </CellExecutionProcessesProvider>
    </WorkspaceProvider>
  );
}

/**
 * Per-cell ExecutionProcessesProvider — reads the cell's own selectedSessionId
 * from its WorkspaceContext (set by the wrapping WorkspaceProvider) so each
 * cell streams its own execution processes. Without this, all cells would
 * share the route-level provider and see the URL session's processes (which
 * is what made sibling cells flash "running" together).
 */
function CellExecutionProcessesProvider({ children }: { children: ReactNode }) {
  const { selectedSessionId } = useWorkspaceContext();
  return (
    <ExecutionProcessesProvider sessionId={selectedSessionId}>
      {children}
    </ExecutionProcessesProvider>
  );
}

interface CellHostInnerProps {
  cellId: CellId;
  isFirstCell: boolean;
  isFocused: boolean;
  onFocus: () => void;
  onClose?: () => void;
}

function CellHostInner({
  cellId,
  isFirstCell,
  isFocused,
  onFocus,
  onClose,
}: CellHostInnerProps) {
  const {
    workspaceId,
    workspace: selectedWorkspace,
    isLoading,
    selectedSession,
    selectedSessionId,
    sessions,
    isSessionsLoading,
    selectSession,
    repos,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceContext();

  const mainContainerRef = useRef<WorkspacesMainContainerHandle>(null);

  // First cell registers its scroll handler so the sidebar can drive it.
  useEffect(() => {
    if (!isFirstCell) return;
    registerFirstCellScroll((behavior) => {
      mainContainerRef.current?.scrollToBottom(behavior);
    });
    return () => registerFirstCellScroll(null);
  }, [isFirstCell]);

  const { isLeftMainPanelVisible, setLeftMainPanelVisible } =
    useWorkspacePanelState(workspaceId);
  const { columns: panelColumns } = useWorkspacePanelLayout(workspaceId);
  const hasPanels = panelColumns.length > 0;

  // If the user has no panels open AND the chat is hidden, force the chat
  // back so the cell isn't a blank screen.
  useEffect(() => {
    if (!hasPanels && !isLeftMainPanelVisible) {
      setLeftMainPanelVisible(true);
    }
  }, [hasPanels, isLeftMainPanelVisible, setLeftMainPanelVisible]);

  const renderPanel = useCallback(
    (panelId: PanelId) => {
      switch (panelId) {
        case 'changes':
          return selectedWorkspace?.id ? (
            <ChangesPanelContainer
              className=""
              workspaceId={selectedWorkspace.id}
            />
          ) : null;
        case 'logs':
          return <LogsContentContainer className="" />;
        case 'preview':
          return selectedWorkspace?.id ? (
            <PreviewBrowserContainer
              workspaceId={selectedWorkspace.id}
              className=""
            />
          ) : null;
        case 'git':
          return (
            <GitPanelContainer
              selectedWorkspace={selectedWorkspace}
              repos={repos}
            />
          );
        case 'terminal':
          return <TerminalPanelContainer />;
        default:
          return null;
      }
    },
    [selectedWorkspace, repos]
  );

  const renderPanelHeader = useCallback(
    (panelId: PanelId) => {
      if (panelId !== 'changes') return null;
      return (
        <>
          <PanelHeaderActionButton
            action={Actions.ToggleDiffViewMode}
            workspaceId={selectedWorkspace?.id}
          />
          <PanelHeaderActionButton
            action={Actions.ToggleAllDiffs}
            workspaceId={selectedWorkspace?.id}
          />
        </>
      );
    },
    [selectedWorkspace?.id]
  );

  const [rightMainPanelSize, setRightMainPanelSize] = usePaneSize(
    PERSIST_KEYS.rightMainPanel,
    50
  );
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    };
  }, []);

  // defaultLayout MUST match the set of Panels that actually render below;
  // react-resizable-panels throws "Invalid N panel layout" when entries don't
  // match registered Panels. The recovery effect above flips chat back on
  // when both sides would be empty, but that runs *after* the first render —
  // so we also short-circuit the Group when there's nothing to put in it.
  const rightSize =
    typeof rightMainPanelSize === 'number' ? rightMainPanelSize : 50;
  const defaultLayout: Layout =
    isLeftMainPanelVisible && hasPanels
      ? { 'left-main': 100 - rightSize, 'right-main': rightSize }
      : isLeftMainPanelVisible
        ? { 'left-main': 100 }
        : hasPanels
          ? { 'right-main': 100 }
          : {};

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      if (isLeftMainPanelVisible && hasPanels) {
        if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = setTimeout(() => {
          setRightMainPanelSize(layout['right-main']);
        }, 150);
      }
    },
    [isLeftMainPanelVisible, hasPanels, setRightMainPanelSize]
  );

  // Focus-on-click anywhere inside the cell. Stop propagation so cells
  // nested inside one another (shouldn't happen today, but safe) don't
  // double-focus.
  const handleMouseDownCapture = useCallback(() => {
    if (!isFocused) onFocus();
  }, [isFocused, onFocus]);

  // Nothing to render this paint — the recovery effect will flip
  // isLeftMainPanelVisible back to true on the next tick.
  if (!isLeftMainPanelVisible && !hasPanels) {
    return (
      <div
        onMouseDownCapture={handleMouseDownCapture}
        className={cn(
          'relative flex h-full transition-opacity',
          !isFocused && 'opacity-70'
        )}
      />
    );
  }

  return (
    <div
      onMouseDownCapture={handleMouseDownCapture}
      className={cn(
        'relative flex h-full transition-opacity',
        !isFocused && 'opacity-70'
      )}
    >
      <Group
        orientation="horizontal"
        className="flex-1 min-w-0 h-full"
        defaultLayout={defaultLayout}
        onLayoutChange={onLayoutChange}
      >
        {isLeftMainPanelVisible && (
          <Panel
            id="left-main"
            minSize="20%"
            className="relative min-w-0 h-full overflow-hidden"
          >
            <WorkspacesMainContainer
              ref={mainContainerRef}
              selectedWorkspace={selectedWorkspace ?? null}
              selectedSession={selectedSession}
              selectedSessionId={selectedSessionId}
              sessions={sessions}
              repos={repos}
              onSelectSession={selectSession}
              isLoading={isLoading}
              isSessionsLoading={isSessionsLoading}
              isNewSessionMode={isNewSessionMode}
              onStartNewSession={startNewSession}
            />
            {/* Breadcrumb — overlay only on the chat panel so it does not
                cover preview/git/etc. on the right. When right-side panels
                are open the breadcrumb can run flush to the chat panel's
                right edge (the toolbar floats over the right panel area);
                when chat is full-width, reserve room for the toolbar. */}
            <div
              className={cn(
                'absolute top-2 left-5 z-20 overflow-hidden',
                hasPanels ? 'right-0' : 'right-[80px]'
              )}
            >
              <NavbarBreadcrumbSlot />
            </div>
          </Panel>
        )}

        {isLeftMainPanelVisible && hasPanels && (
          <ResizeHandle id="main-separator" orientation="vertical" />
        )}

        {hasPanels && (
          <Panel
            id="right-main"
            minSize="20%"
            className="min-w-0 h-full overflow-hidden p-0.5"
          >
            <PanelLayout
              workspaceId={workspaceId}
              renderPanel={renderPanel}
              renderPanelHeader={renderPanelHeader}
              isFirstCell={isFirstCell}
            />
          </Panel>
        )}
      </Group>

      {/* Visual order (left → right): close-panel X (in PanelHost header)
          · toggle-panels (PanelMenu) · close-cell X. PanelMenu sits in the
          middle so the two X buttons can't be confused for one another. */}
      <div className="absolute top-2 right-3 z-20 flex items-center gap-0">
        <PanelMenu workspaceId={workspaceId} />
        {!isFirstCell && onClose && (
          <button
            type="button"
            aria-label="Close cell"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <CellDropOverlay cellId={cellId} />
    </div>
  );
}
