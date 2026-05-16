import type { ReactNode } from 'react';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { WorkspacesSidebarContainer } from '@/pages/workspaces/WorkspacesSidebarContainer';

interface RoutinesLayoutProps {
  children: ReactNode;
}

/**
 * Shell for routines pages: keeps the workspaces sidebar in the same cell as
 * the rest of the app and renders the routines content in the main column,
 * mirroring `WorkspacesLayout`'s top-level structure.
 */
export function RoutinesLayout({ children }: RoutinesLayoutProps) {
  const isMobile = useIsMobile();
  const isLeftSidebarVisible = useUiPreferencesStore(
    (s) => s.isLeftSidebarVisible
  );

  if (isMobile) {
    return <div className="flex flex-col h-full min-h-0">{children}</div>;
  }

  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 h-full',
        isLeftSidebarVisible && 'ml-[300px]'
      )}
    >
      {isLeftSidebarVisible && (
        <div className="fixed top-0 left-0 bottom-0 w-[300px] z-40 pt-2 pb-3 pl-3 pr-2">
          <WorkspacesSidebarContainer />
        </div>
      )}
      <div className="flex-1 min-w-0 h-full">{children}</div>
    </div>
  );
}
