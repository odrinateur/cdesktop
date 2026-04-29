import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PanelId } from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { PANEL_CATALOG } from './panelCatalog';

type Props = {
  panelId: PanelId;
  onClose: (panelId: PanelId) => void;
  children: ReactNode;
  headerExtras?: ReactNode;
  // When true, reserve room on the right for the floating PanelMenu trigger
  // by shifting the close button left.
  reserveMenuSpace?: boolean;
  className?: string;
};

export function PanelHost({
  panelId,
  onClose,
  children,
  headerExtras,
  reserveMenuSpace,
  className,
}: Props) {
  const descriptor = PANEL_CATALOG[panelId];
  const Icon = descriptor.icon;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm',
        className
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{descriptor.label}</span>
        <div className="ml-auto flex items-center gap-1">
          {headerExtras}
          <button
            type="button"
            aria-label={`Close ${descriptor.label} panel`}
            onClick={() => onClose(panelId)}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              reserveMenuSpace && 'mr-6'
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
