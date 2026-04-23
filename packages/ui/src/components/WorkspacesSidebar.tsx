import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PlusIcon,
  ArrowLeftIcon,
  ArchiveIcon,
  StackIcon,
  SpinnerIcon,
  SidebarSimpleIcon,
  MagnifyingGlassIcon,
  XIcon,
  CaretDownIcon,
  SunIcon,
  MoonIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { IconButton } from './IconButton';
import { WorkspaceSummary } from './WorkspaceSummary';
import type { AppBarHostStatus } from './AppBar';
import {
  CollapsibleSectionHeader,
  type SectionAction,
} from './CollapsibleSectionHeader';

export type WorkspaceLayoutMode = 'folder' | 'flat' | 'accordion';

export interface WorkspacesSidebarWorkspace {
  id: string;
  name: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isRunning?: boolean;
  isPinned?: boolean;
  hasPendingApproval?: boolean;
  hasRunningDevServer?: boolean;
  hasUnseenActivity?: boolean;
  latestProcessCompletedAt?: string;
  latestProcessStatus?: 'running' | 'completed' | 'failed' | 'killed';
  prStatus?: 'open' | 'merged' | 'closed' | 'unknown';
  primaryRepo?: { id: string; name: string; displayName: string };
}

export interface WorkspacesSidebarFolderGroup {
  repoId: string;
  displayName: string;
  sessions: WorkspacesSidebarWorkspace[];
}

export interface WorkspacesSidebarPersistKeys {
  raisedHand: string;
  notRunning: string;
  running: string;
}

const DEFAULT_PERSIST_KEYS: WorkspacesSidebarPersistKeys = {
  raisedHand: 'workspaces-sidebar-raised-hand',
  notRunning: 'workspaces-sidebar-not-running',
  running: 'workspaces-sidebar-running',
};

const FOLDER_EXPANDED_KEY_PREFIX = 'workspaces-sidebar-folder-expanded:';

function readFolderExpanded(repoId: string): boolean {
  try {
    const raw = localStorage.getItem(`${FOLDER_EXPANDED_KEY_PREFIX}${repoId}`);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

function writeFolderExpanded(repoId: string, expanded: boolean): void {
  try {
    localStorage.setItem(
      `${FOLDER_EXPANDED_KEY_PREFIX}${repoId}`,
      expanded ? 'true' : 'false'
    );
  } catch {
    // localStorage may be unavailable
  }
}

export interface WorkspacesSidebarProps {
  workspaces: WorkspacesSidebarWorkspace[];
  totalWorkspacesCount: number;
  archivedWorkspaces?: WorkspacesSidebarWorkspace[];
  isLoading?: boolean;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace?: () => void;
  /** Current search query (controlled; container owns filtering). */
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** Whether we're in create mode */
  isCreateMode?: boolean;
  /** Title extracted from draft message (only shown when isCreateMode and non-empty) */
  draftTitle?: string;
  /** Handler to navigate back to create mode */
  onSelectCreate?: () => void;
  /** Whether to show archived workspaces */
  showArchive?: boolean;
  /** Handler for toggling archive view */
  onShowArchiveChange?: (show: boolean) => void;
  /** Active grouping mode. Defaults to 'folder'. */
  layoutMode?: WorkspaceLayoutMode;
  /** Handler for toggling between flat and accordion (only used when accordion flag is on). */
  onToggleLayoutMode?: () => void;
  /** Flag gates: when false (default), flat/accordion UI is suppressed entirely. */
  enableFlatGrouping?: boolean;
  enableAccordionGrouping?: boolean;
  /** Pre-grouped folder buckets for layoutMode='folder'. */
  folderGroups?: WorkspacesSidebarFolderGroup[];
  /** Pinned workspaces (lifted out of folder groups). */
  pinnedWorkspaces?: WorkspacesSidebarWorkspace[];
  /** Handler to load more workspaces on scroll */
  onLoadMore?: () => void;
  /** Whether there are more workspaces to load */
  hasMoreWorkspaces?: boolean;
  /** Callback for opening workspace actions */
  onOpenWorkspaceActions?: (workspaceId: string) => void;
  /** Persist keys for collapsible sections */
  persistKeys?: WorkspacesSidebarPersistKeys;
  activeRemoteHost?: {
    name: string;
    status: AppBarHostStatus;
  } | null;
  onOpenRemoteHostSettings?: () => void;
  /** Hide-sidebar button wiring (left icon in top bar). */
  onHideSidebar?: () => void;
  /** Theme toggle wiring (footer, bottom-right). */
  resolvedTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export interface WorkspacesSidebarReopenTagProps {
  active?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  ariaLabel?: string;
  className?: string;
}

export function WorkspacesSidebarReopenTag({
  active = false,
  onHoverStart,
  onHoverEnd,
  ariaLabel,
  className,
}: WorkspacesSidebarReopenTagProps) {
  return (
    <button
      type="button"
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      aria-label={ariaLabel ?? 'Preview sessions sidebar'}
      title={ariaLabel ?? 'Preview sessions sidebar'}
      className={cn(
        'group inline-flex h-24 w-4 items-center justify-center rounded-md border border-border bg-secondary/95 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-e-resize',
        active ? 'bg-panel text-normal' : 'text-low hover:text-normal',
        className
      )}
    >
      <span className="grid grid-cols-2 gap-[2px]">
        <span className="size-dot rounded-full bg-low/70 group-hover:bg-low" />
        <span className="size-dot rounded-full bg-low/70 group-hover:bg-low" />
        <span className="size-dot rounded-full bg-low/70 group-hover:bg-low" />
        <span className="size-dot rounded-full bg-low/70 group-hover:bg-low" />
        <span className="size-dot rounded-full bg-low/70 group-hover:bg-low" />
        <span className="size-dot rounded-full bg-low/70 group-hover:bg-low" />
      </span>
    </button>
  );
}

function WorkspaceList({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspaceActions,
}: {
  workspaces: WorkspacesSidebarWorkspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenWorkspaceActions: (workspaceId: string) => void;
}) {
  return (
    <>
      {workspaces.map((workspace) => (
        <WorkspaceSummary
          key={workspace.id}
          name={workspace.name}
          workspaceId={workspace.id}
          filesChanged={workspace.filesChanged}
          linesAdded={workspace.linesAdded}
          linesRemoved={workspace.linesRemoved}
          isActive={selectedWorkspaceId === workspace.id}
          isRunning={workspace.isRunning}
          isPinned={workspace.isPinned}
          hasPendingApproval={workspace.hasPendingApproval}
          hasRunningDevServer={workspace.hasRunningDevServer}
          hasUnseenActivity={workspace.hasUnseenActivity}
          latestProcessCompletedAt={workspace.latestProcessCompletedAt}
          latestProcessStatus={workspace.latestProcessStatus}
          prStatus={workspace.prStatus}
          summary
          onOpenWorkspaceActions={onOpenWorkspaceActions}
          onClick={() => onSelectWorkspace(workspace.id)}
        />
      ))}
    </>
  );
}

function FolderGroup({
  group,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspaceActions,
}: {
  group: WorkspacesSidebarFolderGroup;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenWorkspaceActions: (workspaceId: string) => void;
}) {
  const [expanded, setExpandedState] = useState(() =>
    readFolderExpanded(group.repoId)
  );

  const toggle = useCallback(() => {
    setExpandedState((prev) => {
      const next = !prev;
      writeFolderExpanded(group.repoId, next);
      return next;
    });
  }, [group.repoId]);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={toggle}
        className="group w-full flex items-center gap-half px-double py-half text-sm text-low opacity-60 hover:opacity-100 hover:text-normal transition-colors lowercase"
      >
        <span className="flex-1 text-left truncate">{group.displayName}</span>
        <CaretDownIcon
          className={cn(
            'size-icon-xs opacity-0 group-hover:opacity-100 transition-transform',
            expanded ? 'rotate-0' : '-rotate-90'
          )}
          weight="bold"
        />
      </button>
      {expanded && (
        <div className="flex flex-col">
          <WorkspaceList
            workspaces={group.sessions}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={onSelectWorkspace}
            onOpenWorkspaceActions={onOpenWorkspaceActions}
          />
        </div>
      )}
    </div>
  );
}

function SidebarTopBar({
  searchQuery,
  onSearchChange,
  onHideSidebar,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onHideSidebar?: () => void;
}) {
  const { t } = useTranslation('common');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const collapse = useCallback(() => {
    setIsSearchExpanded(false);
    onSearchChange('');
  }, [onSearchChange]);

  useEffect(() => {
    if (isSearchExpanded) {
      inputRef.current?.focus();
    }
  }, [isSearchExpanded]);

  return (
    <div className="flex items-center gap-half px-base pt-base pb-half mb-base">
      <IconButton
        icon={SidebarSimpleIcon}
        onClick={onHideSidebar}
        aria-label={t('sidebar.hideSidebar.aria', {
          defaultValue: 'Hide sidebar',
        })}
        title={t('sidebar.hideSidebar.aria', { defaultValue: 'Hide sidebar' })}
      />
      {isSearchExpanded ? (
        <div className="flex-1 flex items-center gap-half">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                collapse();
              }
            }}
            placeholder={t('workspaces.searchPlaceholder')}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-normal placeholder:text-low"
          />
          <IconButton
            icon={XIcon}
            onClick={collapse}
            aria-label={t('sidebar.search.collapse.aria', {
              defaultValue: 'Close search',
            })}
          />
        </div>
      ) : (
        <IconButton
          icon={MagnifyingGlassIcon}
          onClick={() => setIsSearchExpanded(true)}
          aria-label={t('sidebar.search.open.aria', {
            defaultValue: 'Search sessions',
          })}
          title={t('sidebar.search.open.aria', {
            defaultValue: 'Search sessions',
          })}
        />
      )}
    </div>
  );
}

function NewSessionRow({ onAddWorkspace }: { onAddWorkspace?: () => void }) {
  const { t } = useTranslation('common');
  return (
    <button
      type="button"
      onClick={onAddWorkspace}
      className="w-full flex items-center gap-base px-double py-half text-base text-normal hover:bg-tertiary/60 transition-colors"
    >
      <PlusIcon className="size-icon-sm" weight="bold" />
      <span>{t('sidebar.newSession', { defaultValue: 'New session' })}</span>
    </button>
  );
}

function PinnedSection({
  pinnedWorkspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspaceActions,
}: {
  pinnedWorkspaces: WorkspacesSidebarWorkspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenWorkspaceActions: (workspaceId: string) => void;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-col">
      <div className="px-double py-half">
        <span className="text-sm text-low opacity-60">
          {t('sidebar.pinned.sectionHeader', { defaultValue: 'Pinned' })}
        </span>
      </div>
      {pinnedWorkspaces.length > 0 ? (
        <WorkspaceList
          workspaces={pinnedWorkspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onOpenWorkspaceActions={onOpenWorkspaceActions}
        />
      ) : (
        <p className="px-double py-half text-sm text-low opacity-60">
          {t('sidebar.pinned.emptyHint', {
            defaultValue: 'Pin sessions from their menu to keep them here.',
          })}
        </p>
      )}
    </div>
  );
}

export function WorkspacesSidebar({
  workspaces,
  totalWorkspacesCount,
  archivedWorkspaces = [],
  isLoading = false,
  selectedWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  searchQuery,
  onSearchChange,
  isCreateMode = false,
  draftTitle,
  onSelectCreate,
  showArchive = false,
  onShowArchiveChange,
  layoutMode = 'folder',
  onToggleLayoutMode,
  enableFlatGrouping = false,
  enableAccordionGrouping = false,
  folderGroups = [],
  pinnedWorkspaces = [],
  onLoadMore,
  hasMoreWorkspaces = false,
  onOpenWorkspaceActions,
  persistKeys = DEFAULT_PERSIST_KEYS,
  activeRemoteHost = null,
  onOpenRemoteHostSettings,
  onHideSidebar,
  resolvedTheme,
  onToggleTheme,
}: WorkspacesSidebarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleOpenWorkspaceActions = useCallback(
    (workspaceId: string) => {
      onOpenWorkspaceActions?.(workspaceId);
    },
    [onOpenWorkspaceActions]
  );

  // Handle scroll to load more
  const handleScroll = () => {
    if (!hasMoreWorkspaces || !onLoadMore) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when scrolled within 100px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      onLoadMore();
    }
  };

  // Categorize workspaces for accordion layout
  const { raisedHandWorkspaces, idleWorkspaces, runningWorkspaces } =
    useMemo(() => {
      // Running workspaces should stay in the "Running" section even if unseen.
      const needsAttention = (ws: WorkspacesSidebarWorkspace) =>
        ws.hasPendingApproval || (ws.hasUnseenActivity && !ws.isRunning);

      return {
        raisedHandWorkspaces: workspaces.filter((ws) => needsAttention(ws)),
        idleWorkspaces: workspaces.filter(
          (ws) => !ws.isRunning && !needsAttention(ws)
        ),
        runningWorkspaces: workspaces.filter(
          (ws) => ws.isRunning && !needsAttention(ws)
        ),
      };
    }, [workspaces]);

  const headerActions: SectionAction[] = enableAccordionGrouping
    ? [
        {
          icon: StackIcon,
          onClick: () => onToggleLayoutMode?.(),
          isActive: layoutMode === 'accordion',
        },
      ]
    : [];

  const resolvedMode: WorkspaceLayoutMode = showArchive
    ? 'flat'
    : layoutMode === 'accordion' && enableAccordionGrouping
      ? 'accordion'
      : layoutMode === 'flat' && enableFlatGrouping
        ? 'flat'
        : 'folder';

  const themeAriaLabel = t(
    'common:sidebar.footer.themeToggle.aria',
    resolvedTheme === 'dark'
      ? {
          defaultValue: 'Switch to light mode',
          mode: t('common:sidebar.theme.light', { defaultValue: 'light' }),
        }
      : {
          defaultValue: 'Switch to dark mode',
          mode: t('common:sidebar.theme.dark', { defaultValue: 'dark' }),
        }
  );

  return (
    <div className="w-full h-full bg-secondary flex flex-col">
      {/* Top bar: hide-sidebar + expandable search */}
      <SidebarTopBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onHideSidebar={onHideSidebar}
      />

      {/* Legacy header title row — only rendered when a mode-toggle is available */}
      {headerActions.length > 0 && (
        <CollapsibleSectionHeader
          title={t('common:workspaces.title')}
          collapsible={false}
          actions={headerActions}
          className="border-b"
        />
      )}

      {/* New Session row */}
      {!isLoading && !showArchive && <NewSessionRow onAddWorkspace={onAddWorkspace} />}

      {activeRemoteHost && (
        <div className="px-base py-half">
          <div className="rounded-sm border border-border bg-panel/60 px-base py-half flex items-center justify-between gap-base">
            <div className="min-w-0">
              <p className="text-xs text-low uppercase tracking-wide">
                {t('common:workspaces.remoteHostLabel', {
                  defaultValue: 'Remote host',
                })}
              </p>
              <p className="text-sm text-high truncate">
                {activeRemoteHost.name}
              </p>
            </div>
            <div className="flex items-center gap-half shrink-0">
              <span
                className={cn(
                  'inline-flex h-2.5 w-2.5 rounded-full',
                  activeRemoteHost.status === 'online'
                    ? 'bg-success'
                    : activeRemoteHost.status === 'offline'
                      ? 'bg-low'
                      : 'bg-warning'
                )}
                aria-hidden="true"
              />
              {onOpenRemoteHostSettings && (
                <button
                  type="button"
                  onClick={onOpenRemoteHostSettings}
                  className="text-xs text-brand hover:underline"
                >
                  {t('common:workspaces.remoteHostManage', {
                    defaultValue: 'Manage',
                  })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable workspace list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-base"
      >
        {isLoading ? (
          <div className="flex h-full min-h-[220px] items-center justify-center px-base">
            <div className="flex items-center justify-center text-low">
              <SpinnerIcon className="size-6 animate-spin" weight="bold" />
            </div>
          </div>
        ) : showArchive ? (
          /* Archived workspaces view */
          <div className="flex flex-col gap-base">
            <span className="text-sm font-medium text-low px-base">
              {t('common:workspaces.archived')}
            </span>
            {archivedWorkspaces.length === 0 ? (
              <span className="text-sm text-low opacity-60 px-base">
                {t('common:workspaces.noArchived')}
              </span>
            ) : (
              archivedWorkspaces.map((workspace) => (
                <WorkspaceSummary
                  summary
                  key={workspace.id}
                  name={workspace.name}
                  workspaceId={workspace.id}
                  filesChanged={workspace.filesChanged}
                  linesAdded={workspace.linesAdded}
                  linesRemoved={workspace.linesRemoved}
                  isActive={selectedWorkspaceId === workspace.id}
                  isRunning={workspace.isRunning}
                  isPinned={workspace.isPinned}
                  hasPendingApproval={workspace.hasPendingApproval}
                  hasRunningDevServer={workspace.hasRunningDevServer}
                  hasUnseenActivity={workspace.hasUnseenActivity}
                  latestProcessCompletedAt={workspace.latestProcessCompletedAt}
                  latestProcessStatus={workspace.latestProcessStatus}
                  prStatus={workspace.prStatus}
                  onOpenWorkspaceActions={handleOpenWorkspaceActions}
                  onClick={() => onSelectWorkspace(workspace.id)}
                />
              ))
            )}
          </div>
        ) : resolvedMode === 'accordion' ? (
          /* Accordion layout view (flag-gated) */
          <div className="flex flex-col gap-base">
            {/* Needs Attention section */}
            <CollapsibleSectionHeader
              title={t('common:workspaces.needsAttention')}
              persistKey={persistKeys.raisedHand}
              defaultExpanded={true}
            >
              <div className="flex flex-col gap-base py-half">
                {draftTitle && (
                  <WorkspaceSummary
                    name={draftTitle}
                    isActive={isCreateMode}
                    isDraft={true}
                    onClick={onSelectCreate}
                  />
                )}
                {raisedHandWorkspaces.length === 0 && !draftTitle ? (
                  <span className="text-sm text-low opacity-60 pl-base">
                    {t('common:workspaces.noWorkspaces')}
                  </span>
                ) : (
                  <WorkspaceList
                    workspaces={raisedHandWorkspaces}
                    selectedWorkspaceId={selectedWorkspaceId}
                    onSelectWorkspace={onSelectWorkspace}
                    onOpenWorkspaceActions={handleOpenWorkspaceActions}
                  />
                )}
              </div>
            </CollapsibleSectionHeader>

            {/* Running section */}
            <CollapsibleSectionHeader
              title={t('common:workspaces.running')}
              persistKey={persistKeys.running}
              defaultExpanded={true}
            >
              <div className="flex flex-col gap-base py-half">
                {runningWorkspaces.length === 0 ? (
                  <span className="text-sm text-low opacity-60 pl-base">
                    {t('common:workspaces.noWorkspaces')}
                  </span>
                ) : (
                  <WorkspaceList
                    workspaces={runningWorkspaces}
                    selectedWorkspaceId={selectedWorkspaceId}
                    onSelectWorkspace={onSelectWorkspace}
                    onOpenWorkspaceActions={handleOpenWorkspaceActions}
                  />
                )}
              </div>
            </CollapsibleSectionHeader>

            {/* Idle section */}
            <CollapsibleSectionHeader
              title={t('common:workspaces.idle')}
              persistKey={persistKeys.notRunning}
              defaultExpanded={true}
            >
              <div className="flex flex-col gap-base py-half">
                {idleWorkspaces.length === 0 ? (
                  <span className="text-sm text-low opacity-60 pl-base">
                    {t('common:workspaces.noWorkspaces')}
                  </span>
                ) : (
                  <WorkspaceList
                    workspaces={idleWorkspaces}
                    selectedWorkspaceId={selectedWorkspaceId}
                    onSelectWorkspace={onSelectWorkspace}
                    onOpenWorkspaceActions={handleOpenWorkspaceActions}
                  />
                )}
              </div>
            </CollapsibleSectionHeader>
          </div>
        ) : resolvedMode === 'flat' ? (
          /* Active workspaces flat view (flag-gated) */
          <div className="flex flex-col gap-base">
            <div className="flex items-center justify-between px-base">
              <span className="text-sm font-medium text-low">
                {t('common:workspaces.active')}
              </span>
              <span className="text-xs text-low">{totalWorkspacesCount}</span>
            </div>
            {draftTitle && (
              <WorkspaceSummary
                name={draftTitle}
                isActive={isCreateMode}
                isDraft={true}
                onClick={onSelectCreate}
              />
            )}
            {workspaces.map((workspace) => (
              <WorkspaceSummary
                key={workspace.id}
                name={workspace.name}
                workspaceId={workspace.id}
                filesChanged={workspace.filesChanged}
                linesAdded={workspace.linesAdded}
                linesRemoved={workspace.linesRemoved}
                isActive={selectedWorkspaceId === workspace.id}
                isRunning={workspace.isRunning}
                isPinned={workspace.isPinned}
                hasPendingApproval={workspace.hasPendingApproval}
                hasRunningDevServer={workspace.hasRunningDevServer}
                hasUnseenActivity={workspace.hasUnseenActivity}
                latestProcessCompletedAt={workspace.latestProcessCompletedAt}
                latestProcessStatus={workspace.latestProcessStatus}
                prStatus={workspace.prStatus}
                onOpenWorkspaceActions={handleOpenWorkspaceActions}
                onClick={() => onSelectWorkspace(workspace.id)}
              />
            ))}
          </div>
        ) : (
          /* Default: Pinned + folder groups */
          <div className="flex flex-col gap-base">
            {draftTitle && (
              <WorkspaceSummary
                name={draftTitle}
                isActive={isCreateMode}
                isDraft={true}
                onClick={onSelectCreate}
              />
            )}
            <PinnedSection
              pinnedWorkspaces={pinnedWorkspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              onSelectWorkspace={onSelectWorkspace}
              onOpenWorkspaceActions={handleOpenWorkspaceActions}
            />
            {folderGroups.map((group) => (
              <FolderGroup
                key={group.repoId}
                group={group}
                selectedWorkspaceId={selectedWorkspaceId}
                onSelectWorkspace={onSelectWorkspace}
                onOpenWorkspaceActions={handleOpenWorkspaceActions}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: archive toggle + theme toggle */}
      <div className="p-double flex items-center gap-base">
        <button
          onClick={() => onShowArchiveChange?.(!showArchive)}
          className="flex-1 flex items-center gap-base text-sm text-low hover:text-normal transition-colors duration-100"
        >
          {showArchive ? (
            <>
              <ArrowLeftIcon className="size-icon-xs" />
              <span>{t('common:workspaces.backToActive')}</span>
            </>
          ) : (
            <>
              <ArchiveIcon className="size-icon-xs" />
              <span>{t('common:workspaces.viewArchive')}</span>
              <span className="ml-auto text-xs bg-tertiary px-1.5 py-0.5 rounded">
                {archivedWorkspaces.length}
              </span>
            </>
          )}
        </button>
        {onToggleTheme && (
          <IconButton
            icon={resolvedTheme === 'dark' ? SunIcon : MoonIcon}
            onClick={onToggleTheme}
            aria-label={themeAriaLabel}
            title={themeAriaLabel}
          />
        )}
      </div>
    </div>
  );
}
