import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderIcon, CaretDownIcon } from '@phosphor-icons/react';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { workspacesApi } from '@/shared/lib/api';
import { workspaceRecordKeys } from '@/shared/hooks/useWorkspaceRecord';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { RenameWorkspaceDialog } from '@vibe/ui/components/RenameWorkspaceDialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@vibe/ui/components/DropdownMenu';
import { isTauriApp } from '@/shared/lib/platform';

type TauriInternals = {
  invoke: (cmd: string, args: unknown) => Promise<unknown>;
};

async function revealInFileExplorer(path: string): Promise<void> {
  const internals = (window as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  if (!internals) return;
  await internals.invoke('plugin:opener|reveal_item_in_dir', { path });
}

export function NavbarBreadcrumbSlot() {
  const queryClient = useQueryClient();
  const { workspace, repos, isCreateMode } = useWorkspaceContext();
  const repo = repos[0];

  const handleRename = useCallback(async () => {
    if (!workspace) return;
    const currentName = workspace.name || workspace.branch;
    await RenameWorkspaceDialog.show({
      currentName,
      onRename: async (newName) => {
        await workspacesApi.update(workspace.id, { name: newName });
        queryClient.invalidateQueries({
          queryKey: workspaceRecordKeys.byId(workspace.id),
        });
        queryClient.invalidateQueries({
          queryKey: workspaceSummaryKeys.all,
        });
      },
    });
  }, [workspace, queryClient]);

  const handleCopyPath = useCallback(async () => {
    if (!repo) return;
    try {
      await navigator.clipboard.writeText(repo.path);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  }, [repo]);

  const handleReveal = useCallback(async () => {
    if (!repo) return;
    try {
      await revealInFileExplorer(repo.path);
    } catch (err) {
      console.error('Failed to reveal in file explorer:', err);
    }
  }, [repo]);

  if (isCreateMode || !workspace || !repo) return null;

  const folderName = repo.display_name || repo.name;
  const sessionName = workspace.name || workspace.branch;

  return (
    <div className="flex items-center gap-half text-sm text-normal min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-half rounded px-1.5 py-1 hover:bg-tertiary/60 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-brand">
          <FolderIcon
            className="size-icon-sm text-low shrink-0"
            weight="regular"
          />
          <span className="truncate font-semibold">{folderName}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {isTauriApp() && (
            <DropdownMenuItem onClick={handleReveal}>
              Show in Explorer
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleCopyPath}>
            Copy path
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="-mx-1 text-low shrink-0">/</span>
      <button
        type="button"
        onClick={handleRename}
        className="flex items-center gap-half min-w-0 rounded px-1.5 py-1 text-low hover:bg-tertiary/60 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-brand"
        title="Rename session"
      >
        <span className="truncate">{sessionName}</span>
        <CaretDownIcon
          className="size-icon-2xs text-low shrink-0"
          weight="regular"
        />
      </button>
    </div>
  );
}
