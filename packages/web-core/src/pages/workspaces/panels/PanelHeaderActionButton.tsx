import { useCallback } from 'react';
import type {
  ActionDefinition,
  ActionIcon,
  ActionVisibilityContext,
} from '@/shared/types/actions';
import { useActions } from '@/shared/hooks/useActions';
import { useActionVisibilityContext } from '@/shared/hooks/useActionVisibilityContext';
import { cn } from '@/shared/lib/utils';

type Props = {
  action: ActionDefinition;
  workspaceId?: string;
};

// Renders an Action as a small icon button suitable for panel headers.
// Mirrors the navbar-style behavior (icon, tooltip, active/disabled state)
// without depending on the Navbar UI primitives.
export function PanelHeaderActionButton({ action, workspaceId }: Props) {
  const { executeAction } = useActions();
  const ctx = useActionVisibilityContext();

  const isVisible = action.isVisible ? action.isVisible(ctx) : true;
  const isActive = action.isActive ? action.isActive(ctx) : false;
  const isEnabled = action.isEnabled ? action.isEnabled(ctx) : true;

  const handleClick = useCallback(() => {
    if (action.requiresTarget && workspaceId) {
      executeAction(action, workspaceId);
    } else {
      executeAction(action);
    }
  }, [action, executeAction, workspaceId]);

  if (!isVisible) return null;

  const icon = resolveIcon(action, ctx);
  const tooltip = resolveTooltip(action, ctx);

  // PanelHeaderActionButton doesn't support ContextBar's special icon
  // sentinels (ide-icon, copy-icon). Only real component icons make sense in
  // a panel header.
  if (typeof icon === 'string') return null;
  const Icon = icon;

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onClick={handleClick}
      disabled={!isEnabled}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed',
        isActive && 'bg-accent text-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function resolveIcon(
  action: ActionDefinition,
  ctx: ActionVisibilityContext
): ActionIcon {
  if (action.getIcon) return action.getIcon(ctx);
  return action.icon;
}

function resolveTooltip(
  action: ActionDefinition,
  ctx: ActionVisibilityContext
): string {
  if (action.getTooltip) return action.getTooltip(ctx);
  if (action.getLabel) return action.getLabel(ctx);
  return typeof action.label === 'function' ? action.label() : action.label;
}
