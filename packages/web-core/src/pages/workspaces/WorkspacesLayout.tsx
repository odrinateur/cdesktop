import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { usePageTitle } from '@/shared/hooks/usePageTitle';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import {
  useMobileActiveTab,
  useWorkspacePanelState,
} from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { CreateModeProvider } from '@/features/create-mode/model/CreateModeProvider';
import { useCreateModeSeed } from '@/features/create-mode/model/useCreateModeSeed';
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
import { SessionGrid } from './cells/SessionGrid';
import { scrollFirstCellToBottom } from './cells/firstCellScroll';
import { WorkspacesGuideDialog } from '@/shared/dialogs/shared/WorkspacesGuideDialog';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { RoutinesFirstCellSlot } from '@/shared/components/routines/RoutinesFirstCellSlot';

const WORKSPACES_GUIDE_ID = 'workspaces-guide';

export function WorkspacesLayout() {
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

  // Mobile branch still mounts CreateModeProvider at root level when in
  // create mode, so it needs the seed key + initialState. Desktop now mounts
  // CreateFirstCellSlot inside the matching leaf route under _shell, which
  // owns its own useCreateModeSeed call there.
  const {
    providerKey: createModeProviderKey,
    initialState: createModeSeedState,
  } = useCreateModeSeed();
  const appNavigation = useAppNavigation();
  const handleWorkspaceCreated = useCallback(
    (workspaceId: string) => {
      appNavigation.goToWorkspace(workspaceId);
    },
    [appNavigation]
  );

  const location = useLocation();
  const isRoutinesMode = location.pathname.startsWith('/routines');

  const isMobile = useIsMobile();
  const [mobileTab] = useMobileActiveTab();
  const mainContainerRef = useRef<WorkspacesMainContainerHandle>(null);

  // Desktop's first cell registers its scroll handler in firstCellScroll.ts;
  // mobile keeps using the local ref. The single sidebar callback dispatches
  // to whichever is active.
  const handleScrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      if (isMobile) {
        mainContainerRef.current?.scrollToBottom(behavior);
        return;
      }
      scrollFirstCellToBottom(behavior);
    },
    [isMobile]
  );

  // Sidebar visibility lives at the layout level. Per-cell panel state and
  // panel layout now live inside CellHost via useWorkspacePanelState /
  // useWorkspacePanelLayout, scoped to each cell's workspace.
  const { isLeftSidebarVisible } = useWorkspacePanelState(
    isCreateMode || isRoutinesMode ? undefined : workspaceId
  );

  const {
    config,
    updateAndSaveConfig,
    loading: configLoading,
  } = useUserSystem();
  const hasAutoShownWorkspacesGuide = useRef(false);

  // Auto-show Workspaces Guide on first visit
  const AUTO_SHOW_WORKSPACES_GUIDE = false;
  useEffect(() => {
    if (!AUTO_SHOW_WORKSPACES_GUIDE) return;
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
              {isRoutinesMode ? (
                <RoutinesFirstCellSlot />
              ) : isCreateMode ? (
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
              initialState={createModeSeedState}
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

  // Anchor-cell slot for create + routines now comes from the matched leaf
  // route under _shell (rendered through <Outlet/>). Other paths return null
  // here so SessionGrid falls back to showing the workspace from the store.
  const firstCellSlot: ReactNode | null =
    isCreateMode || isRoutinesMode ? <Outlet /> : null;

  const mainContent = <SessionGrid firstCellSlot={firstCellSlot} />;

  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 h-full',
        isLeftSidebarVisible && !isMobile && 'ml-[300px]'
      )}
    >
      {isLeftSidebarVisible && !isMobile && (
        <div className="fixed top-0 left-0 bottom-0 w-[300px] z-40 pt-2 pb-3 pl-3 pr-2">
          <WorkspacesSidebarContainer onScrollToBottom={handleScrollToBottom} />
        </div>
      )}

      <div className="flex-1 min-w-0 h-full">{mainContent}</div>
    </div>
  );
}
