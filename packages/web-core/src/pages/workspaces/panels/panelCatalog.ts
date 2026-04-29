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
  label: string;
  icon: LucideIcon;
};

export const PANEL_CATALOG: Record<PanelId, PanelDescriptor> = {
  changes: { id: 'changes', label: 'Changes', icon: SquareSplitHorizontal },
  logs: { id: 'logs', label: 'Logs', icon: ScrollText },
  preview: { id: 'preview', label: 'Preview', icon: Play },
  git: { id: 'git', label: 'Git', icon: GitBranch },
  terminal: { id: 'terminal', label: 'Terminal', icon: Terminal },
};

export const PANEL_MENU_ORDER: PanelId[] = [
  'preview',
  'changes',
  'terminal',
  'git',
  'logs',
];

export { PANEL_IDS };
