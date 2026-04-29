import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Layout, Panel } from 'react-resizable-panels';
import type { CreateModeInitialState } from '@/shared/types/createMode';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { usePageTitle } from '@/shared/hooks/usePageTitle';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useMobileActiveTab } from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { CreateModeProvider } from '@/features/create-mode/model/CreateModeProvider';
import {
  consumeCreateModeSeedState,
  getCreateModeSeedVersion,
  subscribeCreateModeSeedState,
} from '@/features/create-mode/model/createModeSeedStore';
import { ReviewProvider } from '@/shared/hooks/ReviewProvider';
import { ChangesViewProvider } from '@/shared/hooks/ChangesViewProvider';
import { WorkspacesSidebarContainer } from './WorkspacesSidebarContainer';
import { LogsContentContainer } from './LogsContentContainer';
import {
  WorkspacesMainContainer,
  type WorkspacesMainContainerHandle,
} from './WorkspacesMainContainer';
import { RightSidebar } from './RightSidebar';
import { ChangesPanelContainer } from './ChangesPanelContainer';
import { CreateChatBoxContainer } from '@/shared/components/CreateChatBoxContainer';
import { PreviewBrowserContainer } from './PreviewBrowserContainer';
import { GitPanelContainer } from './GitPanelContainer';
import { TerminalPanelContainer } from '@/shared/components/TerminalPanelContainer';
import { PanelLayout, PanelMenu, ResizeHandle } from './panels';
import { PanelHeaderActionButton } from './panels/PanelHeaderActionButton';
import { Actions } from '@/shared/actions';
import { WorkspacesGuideDialog } from '@/shared/dialogs/shared/WorkspacesGuideDialog';
import { useUserSystem } from '@/shared/hooks/useUserSystem';

import {
  PERSIST_KEYS,
  usePaneSize,
  useWorkspacePanelState,
  useWorkspacePanelLayout,
  type PanelId,
} from '@/shared/stores/useUiPreferencesStore';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

const WORKSPACES_GUIDE_ID = 'workspaces-guide';

export function WorkspacesLayout() {
  const appNavigation = useAppNavigation();
  const {
    workspaceId,
    workspace: selectedWorkspace,
    isLoading,
    isCreateMode,
    selectedSession,
    selectedSessionId,
    sessions,
    isSessionsLoading,
    selectSession,
    repos,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceContext();

  const { t } = useTranslation('common');
  usePageTitle(
    isCreateMode ? t('workspaces.newWorkspace') : selectedWorkspace?.name
  );

  const seedVersion = useSyncExternalStore(
    subscribeCreateModeSeedState,
    getCreateModeSeedVersion,
    getCreateModeSeedVersion
  );
  const consumedSeedVersionRef = useRef(0);
  const [createModeSeed, setCreateModeSeed] = useState<{
    version: number;
    state: CreateModeInitialState | null;
  }>({
    version: 0,
    state: null,
  });

  useEffect(() => {
    if (!isCreateMode) {
      consumedSeedVersionRef.current = 0;
      setCreateModeSeed((current) =>
        current.version === 0 && current.state === null
          ? current
          : { version: 0, state: null }
      );
      return;
    }

    if (seedVersion === 0 || seedVersion === consumedSeedVersionRef.current) {
      return;
    }

    consumedSeedVersionRef.current = seedVersion;
    setCreateModeSeed({
      version: seedVersion,
      state: consumeCreateModeSeedState(),
    });
  }, [isCreateMode, seedVersion]);

  const createModeProviderKey =
    createModeSeed.version > 0
      ? `create-mode-seed-${createModeSeed.version}`
      : 'create-mode-seed-default';

  const isMobile = useIsMobile();
  const [mobileTab] = useMobileActiveTab();
  const mainContainerRef = useRef<WorkspacesMainContainerHandle>(null);

  const handleScrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      mainContainerRef.current?.scrollToBottom(behavior);
    },
    []
  );

  const handleWorkspaceCreated = useCallback(
    (workspaceId: string) => {
      appNavigation.goToWorkspace(workspaceId);
    },
    [appNavigation]
  );

  // Use workspace-specific panel state (pass undefined when in create mode)
  const {
    isLeftSidebarVisible,
    isLeftMainPanelVisible,
    setLeftMainPanelVisible,
  } = useWorkspacePanelState(isCreateMode ? undefined : workspaceId);

  const panelLayoutWorkspaceId = isCreateMode ? undefined : workspaceId;
  const { columns: panelColumns } =
    useWorkspacePanelLayout(panelLayoutWorkspaceId);
  const hasPanels = panelColumns.length > 0;

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

  const {
    config,
    updateAndSaveConfig,
    loading: configLoading,
  } = useUserSystem();
  const hasAutoShownWorkspacesGuide = useRef(false);

  // Auto-show Workspaces Guide on first visit
  useEffect(() => {
    if (hasAutoShownWorkspacesGuide.current) return;
    if (configLoading || !config) return;

    const seenFeatures = config.showcases?.seen_features ?? [];
    if (seenFeatures.includes(WORKSPACES_GUIDE_ID)) return;

    hasAutoShownWorkspacesGuide.current = true;

    void updateAndSaveConfig({
      showcases: { seen_features: [...seenFeatures, WORKSPACES_GUIDE_ID] },
    });
    WorkspacesGuideDialog.show().finally(() => WorkspacesGuideDialog.hide());
  }, [configLoading, config, updateAndSaveConfig]);

  // If the user has no panels open AND the chat is hidden, force the chat
  // back so the workspace isn't a blank screen. Don't touch the left sidebar
  // — the user may have hidden it intentionally.
  useEffect(() => {
    if (!hasPanels && !isLeftMainPanelVisible) {
      setLeftMainPanelVisible(true);
    }
  }, [hasPanels, isLeftMainPanelVisible, setLeftMainPanelVisible]);

  const [rightMainPanelSize, setRightMainPanelSize] = usePaneSize(
    PERSIST_KEYS.rightMainPanel,
    50
  );

  const defaultLayout: Layout =
    typeof rightMainPanelSize === 'number'
      ? {
          'left-main': 100 - rightMainPanelSize,
          'right-main': rightMainPanelSize,
        }
      : { 'left-main': 50, 'right-main': 50 };

  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    };
  }, []);

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

  // ── Mobile layout ──────────────────────────────────────────────────
  // Uses `hidden` CSS class (NOT conditional rendering) to preserve
  // WebSocket connections and scroll positions across tab switches.
  if (isMobile) {
    const mobileContent = (
      <ReviewProvider workspaceId={selectedWorkspace?.id}>
        <ChangesViewProvider>
          <div className="flex flex-col h-full min-h-0">
            {/* Workspaces tab */}
            <div
              className={cn(
                'flex-1 min-h-0 overflow-hidden',
                mobileTab !== 'workspaces' && 'hidden'
              )}
            >
              <WorkspacesSidebarContainer
                onScrollToBottom={handleScrollToBottom}
              />
            </div>

            {/* Chat tab */}
            <div
              className={cn(
                'flex-1 min-h-0 overflow-hidden',
                mobileTab !== 'chat' && 'hidden'
              )}
            >
              {isCreateMode ? (
                <CreateChatBoxContainer
                  onWorkspaceCreated={handleWorkspaceCreated}
                />
              ) : (
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
              )}
            </div>

            {/* Changes tab */}
            <div
              className={cn(
                'flex-1 min-h-0 overflow-hidden',
                mobileTab !== 'changes' && 'hidden'
              )}
            >
              {selectedWorkspace?.id && (
                <ChangesPanelContainer
                  className=""
                  workspaceId={selectedWorkspace.id}
                />
              )}
            </div>

            {/* Logs tab */}
            <div
              className={cn(
                'flex-1 min-h-0 overflow-hidden',
                mobileTab !== 'logs' && 'hidden'
              )}
            >
              <LogsContentContainer className="" />
            </div>

            {/* Preview tab */}
            <div
              className={cn(
                'flex-1 min-h-0 overflow-hidden',
                mobileTab !== 'preview' && 'hidden'
              )}
            >
              {selectedWorkspace?.id && (
                <PreviewBrowserContainer
                  workspaceId={selectedWorkspace.id}
                  className=""
                />
              )}
            </div>

            {/* Git tab */}
            <div
              className={cn(
                'flex-1 min-h-0 overflow-hidden',
                mobileTab !== 'git' && 'hidden'
              )}
            >
              {selectedWorkspace && !isCreateMode && (
                <RightSidebar
                  rightMainPanelMode={null}
                  selectedWorkspace={selectedWorkspace}
                  repos={repos}
                />
              )}
            </div>
          </div>
        </ChangesViewProvider>
      </ReviewProvider>
    );

    return (
      <div className="flex flex-1 min-h-0 h-full">
        <div className="flex-1 min-w-0 h-full">
          {isCreateMode ? (
            <CreateModeProvider
              key={createModeProviderKey}
              initialState={createModeSeed.state}
            >
              {mobileContent}
            </CreateModeProvider>
          ) : (
            mobileContent
          )}
        </div>
      </div>
    );
  }

  const mainContent = (
    <ReviewProvider workspaceId={selectedWorkspace?.id}>
      <ChangesViewProvider>
        <div className="relative flex h-full">
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
                className="min-w-0 h-full overflow-hidden"
              >
                {isCreateMode ? (
                  <CreateChatBoxContainer
                    onWorkspaceCreated={handleWorkspaceCreated}
                  />
                ) : (
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
                )}
              </Panel>
            )}

            {isLeftMainPanelVisible && hasPanels && !isCreateMode && (
              <ResizeHandle
                id="main-separator"
                orientation="vertical"
              />
            )}

            {hasPanels && !isCreateMode && (
              <Panel
                id="right-main"
                minSize="20%"
                className="min-w-0 h-full overflow-hidden"
              >
                <PanelLayout
                  workspaceId={panelLayoutWorkspaceId}
                  renderPanel={renderPanel}
                  renderPanelHeader={renderPanelHeader}
                />
              </Panel>
            )}
          </Group>

          {!isCreateMode && (
            <div className="absolute top-2 right-3 z-20">
              <PanelMenu workspaceId={panelLayoutWorkspaceId} />
            </div>
          )}
        </div>
      </ChangesViewProvider>
    </ReviewProvider>
  );

  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 h-full',
        isLeftSidebarVisible && !isMobile && 'ml-[300px]'
      )}
    >
      {isLeftSidebarVisible && !isMobile && (
        <div className="fixed top-14 left-0 bottom-0 w-[300px] z-40 pb-3 pl-3 pr-2">
          <WorkspacesSidebarContainer onScrollToBottom={handleScrollToBottom} />
        </div>
      )}

      <div className="flex-1 min-w-0 h-full">
        {isCreateMode ? (
          <CreateModeProvider
            key={createModeProviderKey}
            initialState={createModeSeed.state}
          >
            {mainContent}
          </CreateModeProvider>
        ) : (
          mainContent
        )}
      </div>
    </div>
  );
}
