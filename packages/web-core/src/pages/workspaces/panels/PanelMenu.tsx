import { Check, PanelRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vibe/ui/components/DropdownMenu';
import { useWorkspacePanelLayout } from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { PANEL_CATALOG, PANEL_MENU_ORDER } from './panelCatalog';

type Props = {
  workspaceId: string | undefined;
  className?: string;
};

export function PanelMenu({ workspaceId, className }: Props) {
  const { openPanels, togglePanel } = useWorkspacePanelLayout(workspaceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open panel menu"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            className
          )}
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {PANEL_MENU_ORDER.map((id) => {
          const { label, icon: Icon } = PANEL_CATALOG[id];
          const isOpen = openPanels.has(id);
          return (
            <DropdownMenuItem
              key={id}
              onSelect={(e) => {
                e.preventDefault();
                togglePanel(id);
              }}
              className="pr-2"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{label}</span>
              <Check
                className={cn(
                  'h-4 w-4 ml-2 shrink-0',
                  isOpen ? 'opacity-100' : 'opacity-0'
                )}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
