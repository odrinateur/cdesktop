import { create } from 'zustand';
import type { Diff, DiffStats, UnifiedPrComment } from 'shared/types';
import type { NormalizedGitHubComment } from '@/shared/hooks/useWorkspaceContext';

// ---------------------------------------------------------------------------
// Zustand store for workspace diff data (diffs, stats, GitHub comments).
//
// Keyed by workspaceId so multiple workspaces can render simultaneously
// (e.g. several cells in the session-grid layout). Each WorkspaceProvider
// owns one slot — it calls setWorkspaceDiffData(id, …) on update and
// clearWorkspaceDiffData(id) on unmount.
// ---------------------------------------------------------------------------

const EMPTY_DIFFS: Diff[] = [];
const EMPTY_DIFF_PATHS: Set<string> = new Set();
const EMPTY_DIFF_STATS: DiffStats = {
  files_changed: 0,
  lines_added: 0,
  lines_removed: 0,
};
const EMPTY_COMMENTS: UnifiedPrComment[] = [];
const EMPTY_NORMALIZED: NormalizedGitHubComment[] = [];
const EMPTY_FILES: string[] = [];

const noopGetCommentsForFile = () => EMPTY_NORMALIZED;
const noopGetCommentCountForFile = () => 0;
const noopGetFilesWithComments = () => EMPTY_FILES;
const noopGetFirstCommentLine = () => null;
const noopSetShowGitHubComments = () => {};

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface WorkspaceDiffData {
  diffs: Diff[];
  diffPaths: Set<string>;
  diffStats: DiffStats;
  gitHubComments: UnifiedPrComment[];
  isGitHubCommentsLoading: boolean;
  showGitHubComments: boolean;
  setShowGitHubComments: (show: boolean) => void;
  getGitHubCommentsForFile: (filePath: string) => NormalizedGitHubComment[];
  getGitHubCommentCountForFile: (filePath: string) => number;
  getFilesWithGitHubComments: () => string[];
  getFirstCommentLineForFile: (filePath: string) => number | null;
}

interface WorkspaceDiffState {
  byWorkspace: { [workspaceId: string]: WorkspaceDiffData };
  /** Write/replace one workspace's slot. Called by WorkspaceProvider. */
  setWorkspaceDiffData: (workspaceId: string, data: WorkspaceDiffData) => void;
  /** Drop one workspace's slot. Called on workspace switch / unmount. */
  clearWorkspaceDiffData: (workspaceId: string) => void;
}

const DEFAULT_DATA: WorkspaceDiffData = {
  diffs: EMPTY_DIFFS,
  diffPaths: EMPTY_DIFF_PATHS,
  diffStats: EMPTY_DIFF_STATS,
  gitHubComments: EMPTY_COMMENTS,
  isGitHubCommentsLoading: false,
  showGitHubComments: false,
  setShowGitHubComments: noopSetShowGitHubComments,
  getGitHubCommentsForFile: noopGetCommentsForFile,
  getGitHubCommentCountForFile: noopGetCommentCountForFile,
  getFilesWithGitHubComments: noopGetFilesWithComments,
  getFirstCommentLineForFile: noopGetFirstCommentLine,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceDiffStore = create<WorkspaceDiffState>()((set) => ({
  byWorkspace: {},

  setWorkspaceDiffData: (workspaceId, data) =>
    set((s) => ({
      byWorkspace: { ...s.byWorkspace, [workspaceId]: data },
    })),

  clearWorkspaceDiffData: (workspaceId) =>
    set((s) => {
      if (!(workspaceId in s.byWorkspace)) return s;
      const next = { ...s.byWorkspace };
      delete next[workspaceId];
      return { byWorkspace: next };
    }),
}));

/** Read one workspace's slot, or the empty defaults when unknown. */
export function getWorkspaceDiffData(
  workspaceId: string | undefined
): WorkspaceDiffData {
  if (!workspaceId) return DEFAULT_DATA;
  return (
    useWorkspaceDiffStore.getState().byWorkspace[workspaceId] ?? DEFAULT_DATA
  );
}

// ---------------------------------------------------------------------------
// Atomic selectors — each subscribes to a single field of one workspace's
// slot so re-renders stay scoped. Pass `undefined` for workspaceId during
// loading / no-workspace contexts and the hook returns the empty default.
// ---------------------------------------------------------------------------

function selectSlice<K extends keyof WorkspaceDiffData>(
  workspaceId: string | undefined,
  key: K
): WorkspaceDiffData[K] {
  return useWorkspaceDiffStore(
    (s) =>
      (workspaceId ? s.byWorkspace[workspaceId] : undefined)?.[key] ??
      DEFAULT_DATA[key]
  );
}

export const useDiffs = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'diffs');

export const useDiffPaths = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'diffPaths');

export const useDiffStats = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'diffStats');

export const useStoreDiffGitHubComments = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'gitHubComments');

export const useIsGitHubCommentsLoading = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'isGitHubCommentsLoading');

export const useShowGitHubComments = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'showGitHubComments');

export const useSetShowGitHubComments = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'setShowGitHubComments');

export const useGetGitHubCommentsForFile = (workspaceId: string | undefined) =>
  selectSlice(workspaceId, 'getGitHubCommentsForFile');

export const useGetGitHubCommentCountForFile = (
  workspaceId: string | undefined
) => selectSlice(workspaceId, 'getGitHubCommentCountForFile');

export const useGetFilesWithGitHubComments = (
  workspaceId: string | undefined
) => selectSlice(workspaceId, 'getFilesWithGitHubComments');

export const useGetFirstCommentLineForFile = (
  workspaceId: string | undefined
) => selectSlice(workspaceId, 'getFirstCommentLineForFile');
