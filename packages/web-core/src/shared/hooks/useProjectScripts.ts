import { useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  ExecutionProcess,
  ExecutorAction,
  PackageScriptsForRepo,
} from 'shared/types';
import { workspacesApi } from '@/shared/lib/api';
import { ExecutionProcessesContext } from '@/shared/hooks/useExecutionProcessesContext';

export const projectScriptsKeys = {
  all: ['project-scripts'] as const,
  byWorkspace: (workspaceId: string) =>
    [...projectScriptsKeys.all, workspaceId] as const,
};

/**
 * Fetches the list of package.json scripts for every repo in the workspace.
 * Auto-detects the package manager from lockfiles.
 */
export function useProjectScripts(workspaceId: string | undefined) {
  return useQuery<PackageScriptsForRepo[]>({
    queryKey: workspaceId
      ? projectScriptsKeys.byWorkspace(workspaceId)
      : projectScriptsKeys.all,
    enabled: !!workspaceId,
    queryFn: () => workspacesApi.getPackageScripts(workspaceId as string),
    staleTime: 30_000,
  });
}

function extractScriptInfo(
  process: ExecutionProcess
): { repoName: string | null; scriptName: string } | null {
  const action = process.executor_action as ExecutorAction | undefined;
  if (!action) return null;
  const typ = action.typ;
  if (!typ || typ.type !== 'ScriptRequest') return null;
  const label = typ.label;
  if (!label) return null;
  return { repoName: typ.working_dir ?? null, scriptName: label };
}

/**
 * Returns running project-script processes for the current workspace.
 *
 * Match strategy: keyed by `${repoName ?? ''}:${scriptName}`. In a single-repo
 * workspace `repoName` is null (no worktree subdir prefix) — the empty string
 * key still works because we look up with the same convention.
 */
export type RunningScriptKey = string;

export function runningScriptKey(
  repoName: string | null,
  scriptName: string
): RunningScriptKey {
  return `${repoName ?? ''}:${scriptName}`;
}

export function useRunningProjectScripts(): Map<
  RunningScriptKey,
  ExecutionProcess
> {
  // Read the context directly (without the throwing wrapper) because this
  // hook also runs from the navbar, which sits ABOVE the per-cell
  // ExecutionProcessesProvider in the tree. When the provider is absent we
  // gracefully return an empty map — the buttons still render, they just
  // won't show "running" state until a session-scoped consumer mounts.
  const ctx = useContext(ExecutionProcessesContext);
  const processes = ctx?.executionProcessesAll ?? null;

  return useMemo(() => {
    const map = new Map<RunningScriptKey, ExecutionProcess>();
    if (!processes) return map;
    for (const process of processes) {
      if (process.run_reason !== 'projectscript') continue;
      if (process.status !== 'running') continue;
      const info = extractScriptInfo(process);
      if (!info) continue;
      map.set(runningScriptKey(info.repoName, info.scriptName), process);
    }
    return map;
  }, [processes]);
}
