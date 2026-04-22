import type { Repo } from 'shared/types';

import type { BranchItem } from '@/shared/types/selectionItems';
import { repoApi } from '@/shared/lib/api';
import {
  SelectionDialog,
  type SelectionPage,
} from '@/shared/dialogs/command-bar/SelectionDialog';
import {
  buildBranchSelectionPages,
  type BranchSelectionResult,
} from '@/shared/dialogs/command-bar/selections/branchSelection';

function toBranchItem(branch: {
  name: string;
  is_current: boolean;
}): BranchItem {
  return {
    name: branch.name,
    isCurrent: branch.is_current,
  };
}

function getRepoDisplayName(repo: Repo): string {
  return repo.display_name || repo.name;
}

/**
 * Open the branch-selection dialog for a repository and return the selected
 * branch name, or `null` if the user dismissed the dialog.
 *
 * Shared between the legacy step-1 repo picker and the new composer chip row.
 */
export async function pickBranchForRepo(repo: Repo): Promise<string | null> {
  const branches = await repoApi.getBranches(repo.id);
  const branchItems = branches.map(toBranchItem);
  if (branchItems.length === 0) return null;

  const branchResult = (await SelectionDialog.show({
    initialPageId: 'selectBranch',
    pages: buildBranchSelectionPages(
      branchItems,
      getRepoDisplayName(repo)
    ) as Record<string, SelectionPage>,
  })) as BranchSelectionResult | undefined;

  return branchResult?.branch ?? null;
}
