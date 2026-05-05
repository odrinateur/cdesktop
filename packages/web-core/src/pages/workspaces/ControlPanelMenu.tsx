import {
  Archive,
  Check,
  Monitor,
  Moon,
  Settings,
  Settings2,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemeMode } from 'shared/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@vibe/ui/components/DropdownMenu';
import { cn } from '@/shared/lib/utils';

type Props = {
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  onOpenSettings: () => void;
  onViewArchive: () => void;
  className?: string;
};

const THEME_OPTIONS: Array<{
  mode: ThemeMode;
  icon: LucideIcon;
  labelKey: string;
}> = [
  { mode: ThemeMode.LIGHT, icon: Sun, labelKey: 'sidebar.controlPanel.theme.light' },
  { mode: ThemeMode.DARK, icon: Moon, labelKey: 'sidebar.controlPanel.theme.dark' },
  { mode: ThemeMode.SYSTEM, icon: Monitor, labelKey: 'sidebar.controlPanel.theme.system' },
];

export function ControlPanelMenu({
  theme,
  onSetTheme,
  onOpenSettings,
  onViewArchive,
  className,
}: Props) {
  const { t } = useTranslation('common');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('sidebar.controlPanel.openMenu')}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded text-low transition-colors hover:bg-tertiary/60 hover:text-normal',
            className
          )}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel>
          {t('sidebar.controlPanel.theme.label')}
        </DropdownMenuLabel>
        {THEME_OPTIONS.map(({ mode, icon: Icon, labelKey }) => {
          const isActive = theme === mode;
          return (
            <DropdownMenuItem
              key={mode}
              onSelect={(e) => {
                e.preventDefault();
                onSetTheme(mode);
              }}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{t(labelKey)}</span>
              <Check
                className={cn(
                  'h-4 w-4 ml-2 shrink-0 text-blue-500',
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
              />
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpenSettings()}>
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">{t('sidebar.controlPanel.settings')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onViewArchive()}>
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">
            {t('sidebar.controlPanel.viewArchive')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
