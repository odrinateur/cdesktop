import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { usePillDragStore } from '@/shared/stores/usePillDragStore';
import { useSessionGridStore } from '@/shared/stores/useSessionGridStore';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { useTranslation } from 'react-i18next';
import { ThemeMode } from 'shared/types';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useUserContext } from '@/shared/hooks/useUserContext';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useScratch } from '@/shared/hooks/useScratch';
import { useTheme, getResolvedTheme } from '@/shared/hooks/useTheme';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import { splitMessageToTitleDescription } from '@/shared/lib/string';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import {
  PERSIST_KEYS,
  usePersistedExpanded,
  useUiPreferencesStore,
  type WorkspacePrFilter,
  type WorkspaceSortBy,
  type WorkspaceSortOrder,
} from '@/shared/stores/useUiPreferencesStore';
import type { Workspace } from '@/shared/hooks/useWorkspaces';
import { CommandBarDialog } from '@/shared/dialogs/command-bar/CommandBarDialog';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import {
  WorkspacesSidebar,
  type WorkspacesSidebarFolderGroup,
  type WorkspacesSidebarPersistKeys,
  type WorkspaceLayoutMode,
} from '@vibe/ui/components/WorkspacesSidebar';
import {
  MultiSelectDropdown,
  type MultiSelectDropdownOption,
} from '@vibe/ui/components/MultiSelectDropdown';
import { PropertyDropdown } from '@vibe/ui/components/PropertyDropdown';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  ButtonGroup,
  ButtonGroupItem,
} from '@vibe/ui/components/IconButtonGroup';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/Dialog';
import { FolderIcon, GitPullRequestIcon, XIcon } from '@phosphor-icons/react';
import { useRemoteCloudHostsAppBarModel } from '@/shared/hooks/useRemoteCloudHosts';

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

const PAGE_SIZE = 50;
const NO_PROJECT_ID = '__no_project__';

const PR_FILTER_OPTIONS: WorkspacePrFilter[] = ['all', 'has_pr', 'no_pr'];

const SORT_BY_OPTIONS: WorkspaceSortBy[] = ['updated_at', 'created_at'];

interface WorkspacesSidebarContainerProps {
  onScrollToBottom?: (behavior?: 'auto' | 'smooth') => void;
}

interface WorkspacesSortDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sortBy: WorkspaceSortBy;
  sortOrder: WorkspaceSortOrder;
  onSortByChange: (sortBy: WorkspaceSortBy) => void;
  onSortOrderChange: (sortOrder: WorkspaceSortOrder) => void;
}

// Sort/filter dialogs kept defined (hide, don't strip). Not rendered while
// enableFlatGrouping / enableAccordionGrouping are both false.
export function WorkspacesSortDialog({
  open,
  onOpenChange,
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: WorkspacesSortDialogProps) {
  const { t } = useTranslation('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <div className="border-b border-border px-double pb-base pt-double">
          <DialogHeader className="space-y-half">
            <DialogTitle>
              {t('kanban.workspaceSidebar.sortDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('kanban.workspaceSidebar.sortDialogDescription')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-double py-double">
          <div className="flex flex-col gap-base">
            <div className="flex items-center justify-between gap-base">
              <span className="text-sm text-low">
                {t('kanban.workspaceSidebar.sortByLabel')}
              </span>
              <PropertyDropdown
                value={sortBy}
                options={SORT_BY_OPTIONS.map((option) => ({
                  value: option,
                  label:
                    option === 'updated_at'
                      ? t('kanban.workspaceSidebar.sortUpdatedAt')
                      : t('kanban.workspaceSidebar.sortCreatedAt'),
                }))}
                onChange={onSortByChange}
              />
            </div>
            <div className="flex items-center justify-between gap-base">
              <span className="text-sm text-low">
                {t('kanban.workspaceSidebar.sortOrderLabel')}
              </span>
              <ButtonGroup>
                <ButtonGroupItem
                  active={sortOrder === 'desc'}
                  onClick={() => onSortOrderChange('desc')}
                >
                  {t('kanban.sortDescending')}
                </ButtonGroupItem>
                <ButtonGroupItem
                  active={sortOrder === 'asc'}
                  onClick={() => onSortOrderChange('asc')}
                >
                  {t('kanban.sortAscending')}
                </ButtonGroupItem>
              </ButtonGroup>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WorkspacesFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectOptions: MultiSelectDropdownOption<string>[];
  projectIds: string[];
  prFilter: WorkspacePrFilter;
  hasActiveFilters: boolean;
  onProjectFilterChange: (projectIds: string[]) => void;
  onPrFilterChange: (prFilter: WorkspacePrFilter) => void;
  onClearFilters: () => void;
}

export function WorkspacesFilterDialog({
  open,
  onOpenChange,
  projectOptions,
  projectIds,
  prFilter,
  hasActiveFilters,
  onProjectFilterChange,
  onPrFilterChange,
  onClearFilters,
}: WorkspacesFilterDialogProps) {
  const { t } = useTranslation('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <div className="border-b border-border px-double pb-base pt-double">
          <DialogHeader className="space-y-half">
            <DialogTitle>
              {t('kanban.workspaceSidebar.filterDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('kanban.workspaceSidebar.filterDialogDescription')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-double py-double">
          <div className="flex flex-col items-start gap-base">
            <MultiSelectDropdown
              values={projectIds}
              options={projectOptions}
              onChange={onProjectFilterChange}
              icon={FolderIcon}
              label={t('kanban.workspaceSidebar.projectFilterLabel')}
            />
            <PropertyDropdown
              value={prFilter}
              options={PR_FILTER_OPTIONS.map((option) => ({
                value: option,
                label:
                  option === 'all'
                    ? t('kanban.workspaceSidebar.prFilterAll')
                    : option === 'has_pr'
                      ? t('kanban.workspaceSidebar.prFilterHasPr')
                      : t('kanban.workspaceSidebar.prFilterNoPr'),
              }))}
              onChange={onPrFilterChange}
              icon={GitPullRequestIcon}
              label={t('kanban.workspaceSidebar.prFilterLabel')}
            />
            {hasActiveFilters && (
              <div className="self-end">
                <PrimaryButton
                  variant="tertiary"
                  value={t('kanban.clearFilters')}
                  actionIcon={XIcon}
                  onClick={onClearFilters}
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getWorkspaceSortTimestamp(
  workspace: Workspace,
  sortBy: WorkspaceSortBy
): number | null {
  if (sortBy === 'updated_at') {
    return toTimestamp(workspace.latestProcessCompletedAt);
  }

  return toTimestamp(workspace.createdAt);
}

export function WorkspacesSidebarContainer({
  onScrollToBottom = () => {},
}: WorkspacesSidebarContainerProps) {
  const {
    workspaceId: selectedWorkspaceId,
    activeWorkspaces,
    archivedWorkspaces,
    isWorkspacesListLoading,
    isCreateMode,
    selectWorkspace,
    navigateToCreate,
  } = useWorkspaceContext();

  const isMobile = useIsMobile();
  const { hosts: remoteCloudHosts } = useRemoteCloudHostsAppBarModel();
  const { hostId: routeHostId } = useParams({ strict: false });
  const setMobileActiveTab = useUiPreferencesStore((s) => s.setMobileActiveTab);
  const searchQuery = useUiPreferencesStore((s) => s.sidebarSearchQuery);
  const [showArchive, setShowArchive] = usePersistedExpanded(
    PERSIST_KEYS.workspacesSidebarArchived,
    false
  );
  const [isAccordionLayout, setAccordionLayout] = usePersistedExpanded(
    PERSIST_KEYS.workspacesSidebarAccordionLayout,
    true
  );
  const enableFlatGrouping = useUiPreferencesStore((s) => s.enableFlatGrouping);
  const enableAccordionGrouping = useUiPreferencesStore(
    (s) => s.enableAccordionGrouping
  );

  const layoutMode: WorkspaceLayoutMode = enableAccordionGrouping
    ? isAccordionLayout
      ? 'accordion'
      : enableFlatGrouping
        ? 'flat'
        : 'folder'
    : enableFlatGrouping
      ? 'flat'
      : 'folder';
  const toggleLayoutMode = () => setAccordionLayout(!isAccordionLayout);

  // Workspace sidebar filters + sort (state preserved behind the scenes;
  // UI entry points are hidden in default mode).
  const workspaceFilters = useUiPreferencesStore((s) => s.workspaceFilters);
  const workspaceSort = useUiPreferencesStore((s) => s.workspaceSort);

  // Remote data for project filter (all orgs) — hidden in default mode.
  const { workspaces: remoteWorkspaces } = useUserContext();

  // Map local workspace ID → remote project ID
  const remoteProjectByLocalId = useMemo(() => {
    const map = new Map<string, string>();
    for (const rw of remoteWorkspaces) {
      if (rw.local_workspace_id) {
        map.set(rw.local_workspace_id, rw.project_id);
      }
    }
    return map;
  }, [remoteWorkspaces]);

  // Theme toggle (footer)
  const { theme, setTheme } = useTheme();
  const { updateAndSaveConfig } = useUserSystem();
  const resolvedTheme = getResolvedTheme(theme);
  const handleToggleTheme = useCallback(() => {
    const next =
      getResolvedTheme(theme) === 'dark' ? ThemeMode.LIGHT : ThemeMode.DARK;
    setTheme(next);
    void updateAndSaveConfig({ theme: next });
  }, [theme, setTheme, updateAndSaveConfig]);

  // Pagination state for infinite scroll
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // Reset display limit when search, filter, or sort state changes
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, showArchive, workspaceFilters, workspaceSort]);

  const searchLower = searchQuery.toLowerCase();
  const isSearching = searchQuery.length > 0;

  // Apply sidebar filters (project + PR), then search
  const filteredActiveWorkspaces = useMemo(() => {
    let result = activeWorkspaces;

    // Project filter
    if (workspaceFilters.projectIds.length > 0) {
      const includeNoProject =
        workspaceFilters.projectIds.includes(NO_PROJECT_ID);
      const realProjectIds = workspaceFilters.projectIds.filter(
        (id) => id !== NO_PROJECT_ID
      );
      result = result.filter((ws) => {
        const projectId = remoteProjectByLocalId.get(ws.id);
        if (!projectId) return includeNoProject;
        return realProjectIds.includes(projectId);
      });
    }

    // PR filter
    if (workspaceFilters.prFilter === 'has_pr') {
      result = result.filter((ws) => !!ws.prStatus);
    } else if (workspaceFilters.prFilter === 'no_pr') {
      result = result.filter((ws) => !ws.prStatus);
    }

    // Search filter
    if (searchLower) {
      result = result.filter(
        (ws) =>
          ws.name.toLowerCase().includes(searchLower) ||
          ws.branch.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }, [activeWorkspaces, workspaceFilters, remoteProjectByLocalId, searchLower]);

  const filteredArchivedWorkspaces = useMemo(() => {
    let result = archivedWorkspaces;

    if (workspaceFilters.projectIds.length > 0) {
      const includeNoProject =
        workspaceFilters.projectIds.includes(NO_PROJECT_ID);
      const realProjectIds = workspaceFilters.projectIds.filter(
        (id) => id !== NO_PROJECT_ID
      );
      result = result.filter((ws) => {
        const projectId = remoteProjectByLocalId.get(ws.id);
        if (!projectId) return includeNoProject;
        return realProjectIds.includes(projectId);
      });
    }

    if (workspaceFilters.prFilter === 'has_pr') {
      result = result.filter((ws) => !!ws.prStatus);
    } else if (workspaceFilters.prFilter === 'no_pr') {
      result = result.filter((ws) => !ws.prStatus);
    }

    if (searchLower) {
      result = result.filter(
        (ws) =>
          ws.name.toLowerCase().includes(searchLower) ||
          ws.branch.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }, [
    archivedWorkspaces,
    workspaceFilters,
    remoteProjectByLocalId,
    searchLower,
  ]);

  const sortWorkspaces = useCallback(
    (workspaces: Workspace[]) =>
      [...workspaces].sort((a, b) => {
        // Always keep pinned workspaces at the top.
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }

        const aTimestamp = getWorkspaceSortTimestamp(a, workspaceSort.sortBy);
        const bTimestamp = getWorkspaceSortTimestamp(b, workspaceSort.sortBy);

        // Workspaces without the selected timestamp are always sorted first.
        if (aTimestamp === null && bTimestamp === null) {
          return a.name.localeCompare(b.name);
        }
        if (aTimestamp === null) {
          return -1;
        }
        if (bTimestamp === null) {
          return 1;
        }

        if (aTimestamp === bTimestamp) {
          return a.name.localeCompare(b.name);
        }

        return workspaceSort.sortOrder === 'asc'
          ? aTimestamp - bTimestamp
          : bTimestamp - aTimestamp;
      }),
    [workspaceSort.sortBy, workspaceSort.sortOrder]
  );

  const sortedActiveWorkspaces = useMemo(
    () => sortWorkspaces(filteredActiveWorkspaces),
    [filteredActiveWorkspaces, sortWorkspaces]
  );

  const sortedArchivedWorkspaces = useMemo(
    () => sortWorkspaces(filteredArchivedWorkspaces),
    [filteredArchivedWorkspaces, sortWorkspaces]
  );

  // Apply pagination (only when not searching)
  const paginatedActiveWorkspaces = useMemo(
    () =>
      isSearching
        ? sortedActiveWorkspaces
        : sortedActiveWorkspaces.slice(0, displayLimit),
    [sortedActiveWorkspaces, displayLimit, isSearching]
  );

  const paginatedArchivedWorkspaces = useMemo(
    () =>
      isSearching
        ? sortedArchivedWorkspaces
        : sortedArchivedWorkspaces.slice(0, displayLimit),
    [sortedArchivedWorkspaces, displayLimit, isSearching]
  );

  // Partition paginated active list into { pinned, byFolder }.
  const { pinnedWorkspaces, folderGroups } = useMemo(() => {
    const pinned: typeof paginatedActiveWorkspaces = [];
    const groups = new Map<string, WorkspacesSidebarFolderGroup>();

    for (const ws of paginatedActiveWorkspaces) {
      if (ws.isPinned) {
        pinned.push(ws);
        continue;
      }
      const primary = ws.primaryRepo;
      if (!primary) {
        // Defensive: workspace with no attached repo. Skip and warn.
        // (Under multi-folder-sessions invariant this should not happen.)
        console.warn(
          `[sidebar] Workspace ${ws.id} has no primary repo; skipping folder grouping.`
        );
        continue;
      }
      const existing = groups.get(primary.id);
      if (existing) {
        existing.sessions.push(ws);
      } else {
        groups.set(primary.id, {
          repoId: primary.id,
          displayName: primary.displayName || primary.name,
          sessions: [ws],
        });
      }
    }

    const folderGroupsArr = Array.from(groups.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    return { pinnedWorkspaces: pinned, folderGroups: folderGroupsArr };
  }, [paginatedActiveWorkspaces]);

  // Check if there are more workspaces to load
  const hasMoreWorkspaces = showArchive
    ? sortedArchivedWorkspaces.length > displayLimit
    : sortedActiveWorkspaces.length > displayLimit;

  // Handle scroll to load more
  const handleLoadMore = useCallback(() => {
    if (!isSearching && hasMoreWorkspaces) {
      setDisplayLimit((prev) => prev + PAGE_SIZE);
    }
  }, [isSearching, hasMoreWorkspaces]);

  // Read persisted draft for sidebar placeholder
  const { scratch: draftScratch } = useScratch(
    ScratchType.DRAFT_WORKSPACE,
    DRAFT_WORKSPACE_ID
  );

  // Extract draft title from persisted scratch
  const persistedDraftTitle = useMemo(() => {
    const scratchData: DraftWorkspaceData | undefined =
      draftScratch?.payload?.type === 'DRAFT_WORKSPACE'
        ? draftScratch.payload.data
        : undefined;

    if (!scratchData?.message?.trim()) return undefined;
    const { title } = splitMessageToTitleDescription(
      scratchData.message.trim()
    );
    return title || 'New Workspace';
  }, [draftScratch]);

  // Handle workspace selection.
  // - If already in this cell (focused first cell): scroll to bottom.
  // - If mounted in another cell of the grid: just focus that cell (don't
  //   navigate, since the URL tracks the first cell only).
  // - Otherwise: navigate the URL, which routes through WorkspaceProvider
  //   into setFirstCellSession (replacing cell #1).
  const handleSelectWorkspace = useCallback(
    (id: string) => {
      if (id === selectedWorkspaceId) {
        onScrollToBottom();
      } else {
        const grid = useSessionGridStore.getState().grid;
        const mountedCell = grid.groups
          .flatMap((g) => g.cells)
          .find((c) => c.sessionId === id);
        const isFirstCell = grid.groups[0]?.cells[0]?.sessionId === id;
        if (mountedCell && !isFirstCell) {
          useSessionGridStore.getState().focusCell(mountedCell.id);
        } else {
          selectWorkspace(id);
        }
      }
      if (isMobile) {
        setMobileActiveTab('chat');
      }
    },
    [
      selectedWorkspaceId,
      selectWorkspace,
      onScrollToBottom,
      isMobile,
      setMobileActiveTab,
    ]
  );

  const handleAddWorkspace = useCallback(() => {
    navigateToCreate();
    if (isMobile) {
      setMobileActiveTab('chat');
    }
  }, [navigateToCreate, isMobile, setMobileActiveTab]);

  const handleOpenWorkspaceActions = useCallback((workspaceId: string) => {
    CommandBarDialog.show({
      page: 'workspaceActions',
      workspaceId,
    });
  }, []);

  const sidebarPersistKeys: WorkspacesSidebarPersistKeys = {
    raisedHand: PERSIST_KEYS.workspacesSidebarRaisedHand,
    notRunning: PERSIST_KEYS.workspacesSidebarNotRunning,
    running: PERSIST_KEYS.workspacesSidebarRunning,
  };

  const activeRemoteHost = useMemo(() => {
    if (remoteCloudHosts.length === 0 || !routeHostId) {
      return null;
    }

    return remoteCloudHosts.find((host) => host.id === routeHostId) ?? null;
  }, [routeHostId, remoteCloudHosts]);

  const handleOpenRemoteHostSettings = useCallback(() => {
    void SettingsDialog.show({
      initialSection: 'relay',
      ...(routeHostId ? { initialState: { hostId: routeHostId } } : {}),
    });
  }, [routeHostId]);

  // Make every pill a drag source. The grid's per-cell drop overlay reads
  // `usePillDragStore` to know what's being dragged; the actual drop
  // (split / open-in-split / pin) is performed by the drop target.
  const getWorkspaceDragProps = useCallback(
    (workspaceId: string) => ({
      draggable: !isMobile,
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-vibe-pill', workspaceId);
        usePillDragStore.getState().setDragging(workspaceId);
      },
      onDragEnd: () => {
        usePillDragStore.getState().setDragging(null);
      },
    }),
    [isMobile]
  );

  // Sidebar pill state derived from the session-grid:
  // - openInGridWorkspaceIds = every cell's sessionId (gives pill background)
  // - focusedSessionId       = the focused cell's sessionId (gives bright + bold)
  const grid = useSessionGridStore((s) => s.grid);
  const openInGridWorkspaceIds = useMemo(
    () =>
      new Set(
        grid.groups
          .flatMap((g) => g.cells)
          .map((c) => c.sessionId)
          .filter(Boolean)
      ),
    [grid]
  );
  const focusedSessionId = useMemo(
    () =>
      grid.groups
        .flatMap((g) => g.cells)
        .find((c) => c.id === grid.focusedCellId)?.sessionId ?? null,
    [grid]
  );

  // Drop on the Pinned section pins the workspace. Backend has no pin-order
  // field today so the drop position is ignored.
  const queryClient = useQueryClient();
  const handlePinDrop = useCallback(
    async (workspaceId: string) => {
      try {
        await workspacesApi.update(workspaceId, { pinned: true });
        queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
      } catch (err) {
        console.warn('Pin via drag failed', err);
      }
    },
    [queryClient]
  );

  return (
    <WorkspacesSidebar
      workspaces={paginatedActiveWorkspaces}
      totalWorkspacesCount={activeWorkspaces.length}
      archivedWorkspaces={paginatedArchivedWorkspaces}
      isLoading={isWorkspacesListLoading}
      selectedWorkspaceId={focusedSessionId ?? selectedWorkspaceId ?? null}
      onSelectWorkspace={handleSelectWorkspace}
      onAddWorkspace={handleAddWorkspace}
      isCreateMode={isCreateMode}
      draftTitle={persistedDraftTitle}
      onSelectCreate={navigateToCreate}
      showArchive={showArchive}
      onShowArchiveChange={setShowArchive}
      layoutMode={layoutMode}
      onToggleLayoutMode={toggleLayoutMode}
      enableFlatGrouping={enableFlatGrouping}
      enableAccordionGrouping={enableAccordionGrouping}
      folderGroups={folderGroups}
      pinnedWorkspaces={pinnedWorkspaces}
      onLoadMore={handleLoadMore}
      hasMoreWorkspaces={hasMoreWorkspaces && !isSearching}
      onOpenWorkspaceActions={handleOpenWorkspaceActions}
      persistKeys={sidebarPersistKeys}
      activeRemoteHost={activeRemoteHost}
      onOpenRemoteHostSettings={handleOpenRemoteHostSettings}
      resolvedTheme={resolvedTheme}
      onToggleTheme={handleToggleTheme}
      getWorkspaceDragProps={getWorkspaceDragProps}
      onPinDrop={handlePinDrop}
      openInGridWorkspaceIds={openInGridWorkspaceIds}
    />
  );
}
