import {
  GitBranch,
  Play,
  ScrollText,
  SquareSplitHorizontal,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { type PanelId, PANEL_IDS } from '@/shared/stores/useUiPreferencesStore';

export type PanelDescriptor = {
  id: PanelId;
  /** i18n key in the `common` namespace, e.g. `panels.changes`. */
  labelKey: string;
  icon: LucideIcon;
};

export const PANEL_CATALOG: Record<PanelId, PanelDescriptor> = {
  changes: {
    id: 'changes',
    labelKey: 'panels.changes',
    icon: SquareSplitHorizontal,
  },
  logs: { id: 'logs', labelKey: 'panels.logs', icon: ScrollText },
  preview: { id: 'preview', labelKey: 'panels.preview', icon: Play },
  git: { id: 'git', labelKey: 'panels.git', icon: GitBranch },
  terminal: { id: 'terminal', labelKey: 'panels.terminal', icon: Terminal },
};

export const PANEL_MENU_ORDER: PanelId[] = [
  'preview',
  'changes',
  'terminal',
  'git',
  'logs',
];

export { PANEL_IDS };
