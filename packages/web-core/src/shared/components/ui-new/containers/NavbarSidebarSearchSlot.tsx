import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { IconButton } from '@vibe/ui/components/IconButton';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';

export function NavbarSidebarSearchSlot() {
  const { t } = useTranslation('common');
  const searchQuery = useUiPreferencesStore((s) => s.sidebarSearchQuery);
  const setSearchQuery = useUiPreferencesStore((s) => s.setSidebarSearchQuery);
  const setLeftSidebarVisible = useUiPreferencesStore(
    (s) => s.setLeftSidebarVisible
  );
  const [isExpanded, setIsExpanded] = useState(searchQuery.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);

  const collapse = useCallback(() => {
    setIsExpanded(false);
    setSearchQuery('');
  }, [setSearchQuery]);

  const expand = useCallback(() => {
    setIsExpanded(true);
    setLeftSidebarVisible(true);
  }, [setLeftSidebarVisible]);

  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  if (!isExpanded) {
    return (
      <IconButton
        icon={MagnifyingGlassIcon}
        onClick={expand}
        aria-label={t('sidebar.search.open.aria', {
          defaultValue: 'Search sessions',
        })}
        title={t('sidebar.search.open.aria', {
          defaultValue: 'Search sessions',
        })}
      />
    );
  }

  return (
    <div className="flex items-center gap-half">
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            collapse();
          }
        }}
        placeholder={t('workspaces.searchPlaceholder')}
        className="w-36 bg-transparent border-0 outline-none text-sm text-normal placeholder:text-low"
      />
      <IconButton
        icon={XIcon}
        onClick={collapse}
        aria-label={t('sidebar.search.collapse.aria', {
          defaultValue: 'Close search',
        })}
      />
    </div>
  );
}
