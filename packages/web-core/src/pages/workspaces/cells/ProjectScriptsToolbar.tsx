import { useCallback } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { TerminalIcon } from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@vibe/ui/components/DropdownMenu';
import { workspacesApi } from '@/shared/lib/api';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { useLogsPanel } from '@/shared/hooks/useLogsPanel';
import {
  useProjectScripts,
  useRunningProjectScripts,
  runningScriptKey,
} from '@/shared/hooks/useProjectScripts';
import { iconForScriptName } from '@/shared/lib/iconForScriptName';
import { cn } from '@/shared/lib/utils';

type Props = {
  workspaceId: string;
  useWorktree: boolean;
  className?: string;
};

type ScriptEntry = {
  repoId: string;
  repoName: string;
  repoDisplayName: string;
  scriptName: string;
  command: string;
};

/**
 * Dropdown listing every package.json script detected on the workspace's
 * repos. Click a row to run it (or focus its logs if it's already running).
 * The X on a running row stops it. The trigger shows a small green dot when
 * at least one script is running — never a spinner, because dev servers
 * legitimately run for a long time and a spinner would look stuck.
 */
export function ProjectScriptsToolbar({
  workspaceId,
  useWorktree,
  className,
}: Props) {
  const { data: scriptsByRepo } = useProjectScripts(workspaceId);
  const running = useRunningProjectScripts();
  const openPanel = useUiPreferencesStore((s) => s.openPanel);
  const { viewProcessInPanel } = useLogsPanel();

  const lookupRepoName = useCallback(
    (repoName: string): string | null => (useWorktree ? repoName : null),
    [useWorktree]
  );

  const runOrFocus = useCallback(
    async (entry: ScriptEntry) => {
      const key = runningScriptKey(
        lookupRepoName(entry.repoName),
        entry.scriptName
      );
      const runningProcess = running.get(key);
      if (runningProcess) {
        openPanel(workspaceId, 'logs');
        viewProcessInPanel(runningProcess.id);
        return;
      }
      const result = await workspacesApi.runProjectScript(workspaceId, {
        repo_id: entry.repoId,
        script_name: entry.scriptName,
      });
      if (result.success) {
        openPanel(workspaceId, 'logs');
        viewProcessInPanel(result.data.id);
      }
    },
    [workspaceId, running, openPanel, viewProcessInPanel, lookupRepoName]
  );

  const stopScript = useCallback(
    async (entry: ScriptEntry) => {
      const key = runningScriptKey(
        lookupRepoName(entry.repoName),
        entry.scriptName
      );
      const runningProcess = running.get(key);
      if (!runningProcess) return;
      await workspacesApi.stopProjectScript(workspaceId, {
        execution_process_id: runningProcess.id,
      });
    },
    [workspaceId, running, lookupRepoName]
  );

  if (!scriptsByRepo || scriptsByRepo.length === 0) return null;

  const isMultiRepo = scriptsByRepo.length > 1;
  const groups: { repoDisplayName: string; entries: ScriptEntry[] }[] = [];
  let totalEntries = 0;

  for (const repo of scriptsByRepo) {
    const entries: ScriptEntry[] = repo.scripts.map((script) => ({
      repoId: repo.repo_id,
      repoName: repo.repo_name,
      repoDisplayName: repo.repo_display_name,
      scriptName: script.name,
      command: script.command,
    }));
    if (entries.length > 0) {
      groups.push({ repoDisplayName: repo.repo_display_name, entries });
      totalEntries += entries.length;
    }
  }

  if (totalEntries === 0) return null;

  const anyRunning = running.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Run project script"
          title="Run project script"
          className={cn(
            'relative inline-flex h-7 items-center justify-center gap-0.5 rounded px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            className
          )}
        >
          <TerminalIcon className="h-4 w-4" />
          <ChevronDown className="h-2.5 w-2.5" />
          {anyRunning && (
            <span
              className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[16rem]">
        {groups.map((group, groupIdx) => (
          <div key={group.repoDisplayName}>
            {isMultiRepo && (
              <>
                {groupIdx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{group.repoDisplayName}</DropdownMenuLabel>
              </>
            )}
            {group.entries.map((entry) => {
              const key = runningScriptKey(
                lookupRepoName(entry.repoName),
                entry.scriptName
              );
              const isRunning = running.has(key);
              const Icon = iconForScriptName(entry.scriptName);
              return (
                <DropdownMenuItem
                  key={`${entry.repoId}:${entry.scriptName}`}
                  onSelect={(e) => {
                    e.preventDefault();
                    void runOrFocus(entry);
                  }}
                  className="pr-1.5"
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 text-muted-foreground',
                      isRunning && 'text-foreground'
                    )}
                  />
                  <span
                    className={cn(
                      'flex-1 truncate',
                      isRunning && 'font-medium'
                    )}
                  >
                    {entry.scriptName}
                  </span>
                  {isRunning ? (
                    <>
                      <span className="ml-2 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <button
                        type="button"
                        aria-label={`Stop ${entry.scriptName}`}
                        title={`Stop ${entry.scriptName}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void stopScript(entry);
                        }}
                        className="ml-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <span className="ml-2 max-w-[10rem] truncate text-xs text-muted-foreground">
                      {entry.command}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
