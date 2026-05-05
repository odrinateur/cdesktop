import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  // When true, the cell overlay also has a close-cell X to the right of the
  // PanelMenu — push the in-header close button further left so it doesn't
  // sit underneath the floating PanelMenu (which is now in the middle).
  reserveCloseCellSpace?: boolean;
  className?: string;
};

export function PanelHost({
  panelId,
  onClose,
  children,
  headerExtras,
  reserveMenuSpace,
  reserveCloseCellSpace,
  className,
}: Props) {
  const { t } = useTranslation('common');
  const descriptor = PANEL_CATALOG[panelId];
  const Icon = descriptor.icon;
  const label = t(descriptor.labelKey);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm',
        className
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{label}</span>
        <div className="ml-auto flex items-center gap-1">
          {headerExtras}
          <button
            type="button"
            aria-label={t('panels.closePanel', { panel: label })}
            onClick={() => onClose(panelId)}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              reserveCloseCellSpace
                ? 'mr-[3.75rem]'
                : reserveMenuSpace && 'mr-8'
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
