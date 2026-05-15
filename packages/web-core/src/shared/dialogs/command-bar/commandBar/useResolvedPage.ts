import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StackIcon,
  SlidersIcon,
  SquaresFourIcon,
  GitBranchIcon,
  KanbanIcon,
} from '@phosphor-icons/react';
import type { Workspace } from 'shared/types';
import { Pages } from '@/shared/command-bar/actions/pages';
import type {
  PageId,
  StaticPageId,
  CommandBarGroupItem,
  ResolvedGroup,
  ResolvedGroupItem,
} from '@/shared/types/commandBar';
import {
  isActionVisible,
  type ActionVisibilityContext,
} from '@/shared/types/actions';
import { isPageVisible } from '@/shared/command-bar/actions/useActionVisibility';
import { injectSearchMatches } from './injectSearchMatches';

export interface ResolvedCommandBarPage {
  id: string;
  title?: string;
  groups: ResolvedGroup[];
}

const PAGE_ICONS = {
  root: SquaresFourIcon,
  workspaceActions: StackIcon,
  diffOptions: SlidersIcon,
  viewOptions: SquaresFourIcon,
  repoActions: GitBranchIcon,
  issueActions: KanbanIcon,
} as const satisfies Record<StaticPageId, typeof StackIcon>;

type Translator = (key: string) => string;

// i18next returns the key when no translation is found, so non-key labels
// pass through unchanged. Only flagged labels (with a "namespace:" prefix or
// dotted key form) get looked up.
function maybeTranslate(
  value: string | undefined,
  t: Translator
): string | undefined {
  if (!value) return value;
  if (value.includes(':') || value.includes('.')) {
    return t(value);
  }
  return value;
}

function expandGroupItems(
  items: CommandBarGroupItem[],
  ctx: ActionVisibilityContext,
  t: Translator
): ResolvedGroupItem[] {
  return items.flatMap((item) => {
    if (item.type === 'childPages') {
      const page = Pages[item.id as StaticPageId];
      if (!isPageVisible(page, ctx)) return [];
      return [
        {
          type: 'page' as const,
          pageId: item.id,
          label: maybeTranslate(page.title, t) ?? item.id,
          icon: PAGE_ICONS[item.id as StaticPageId],
        },
      ];
    }
    if (item.type === 'action') {
      if (!isActionVisible(item.action, ctx)) return [];
    }
    return [item];
  });
}

function buildPageGroups(
  pageId: StaticPageId,
  ctx: ActionVisibilityContext,
  t: Translator
): ResolvedGroup[] {
  return Pages[pageId].items
    .map((group) => {
      const items = expandGroupItems(group.items, ctx, t);
      return items.length
        ? { label: maybeTranslate(group.label, t) ?? group.label, items }
        : null;
    })
    .filter((g): g is ResolvedGroup => g !== null);
}

export function useResolvedPage(
  pageId: PageId,
  search: string,
  ctx: ActionVisibilityContext,
  workspace: Workspace | undefined
): ResolvedCommandBarPage {
  const { t, i18n } = useTranslation('common');
  const language = i18n.language;
  return useMemo(() => {
    const groups = buildPageGroups(pageId, ctx, t);
    if (pageId === 'root' && search.trim()) {
      groups.push(...injectSearchMatches(search, ctx, workspace));
    }

    return {
      id: Pages[pageId].id,
      title: maybeTranslate(Pages[pageId].title, t),
      groups,
    };
    // language is included so memo invalidates on language change
  }, [pageId, search, ctx, workspace, t, language]);
}
