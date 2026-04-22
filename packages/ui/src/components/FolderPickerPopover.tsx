import { FolderIcon, FolderPlusIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { Repo } from 'shared/types';

import { DropdownMenuItem, DropdownMenuSeparator } from './Dropdown';

export interface FolderPickerPopoverProps {
  recents: Repo[];
  excludeRepoIds?: Set<string>;
  onSelect: (repo: Repo) => void;
  onOpenFolder: () => void;
}

/**
 * Renders the inner content of a folder-picker popover: a list of recent
 * folders and an "Open folder…" entry at the bottom.
 *
 * Used by the primary folder chip (swap primary) and the `+` menu's
 * "Add folder" submenu (add a secondary). Secondary chips do NOT use this
 * component — they open a branch-picker dropdown instead.
 *
 * This component emits `DropdownMenu` items; wrap it with a
 * `DropdownMenuContent` (top-level popover) or `DropdownMenuSubContent`
 * (nested submenu). It does not own the `DropdownMenu` root.
 */
export function FolderPickerPopover({
  recents,
  excludeRepoIds,
  onSelect,
  onOpenFolder,
}: FolderPickerPopoverProps) {
  const { t } = useTranslation();

  const filteredRecents = excludeRepoIds
    ? recents.filter((r) => !excludeRepoIds.has(r.id))
    : recents;

  const openFolderLabel = t('createMode.composerChips.openFolder', {
    defaultValue: 'Open folder…',
  });
  const emptyHintLabel = t('createMode.composerChips.recentsEmpty', {
    defaultValue: 'No recent folders',
  });

  return (
    <>
      {filteredRecents.length > 0 ? (
        filteredRecents.map((repo) => (
          <DropdownMenuItem
            key={repo.id}
            icon={FolderIcon}
            onSelect={() => onSelect(repo)}
          >
            <span className="truncate">{repo.display_name || repo.name}</span>
          </DropdownMenuItem>
        ))
      ) : (
        <DropdownMenuItem disabled>
          <span className="text-low">{emptyHintLabel}</span>
        </DropdownMenuItem>
      )}

      {filteredRecents.length > 0 && <DropdownMenuSeparator />}

      <DropdownMenuItem icon={FolderPlusIcon} onSelect={onOpenFolder}>
        {openFolderLabel}
      </DropdownMenuItem>
    </>
  );
}
