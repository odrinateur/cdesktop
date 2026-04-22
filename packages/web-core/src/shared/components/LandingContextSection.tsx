import { useMemo } from 'react';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useWorkspaces } from '@/shared/hooks/useWorkspaces';

const RECENT_LIMIT = 8;

function formatSubhead(attentionCount: number): string {
  if (attentionCount === 0) return 'Recent sessions';
  return attentionCount === 1
    ? '1 session awaiting input'
    : `${attentionCount} sessions awaiting input`;
}

export function LandingContextSection() {
  const appNavigation = useAppNavigation();
  const { workspaces } = useWorkspaces();

  const recentWorkspaces = useMemo(
    () =>
      workspaces
        .filter((w) => !w.isArchived)
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT_LIMIT),
    [workspaces]
  );

  const attentionCount = useMemo(
    () => recentWorkspaces.filter((w) => w.hasUnseenActivity).length,
    [recentWorkspaces]
  );

  const hasRecent = recentWorkspaces.length > 0;

  return (
    <div className="flex flex-col gap-base">
      <h1 className="text-3xl font-medium tracking-tight text-high">
        Welcome back
      </h1>
      {hasRecent ? (
        <>
          <p className="text-sm text-low">{formatSubhead(attentionCount)}</p>
          <ul className="flex flex-col gap-half rounded-sm border border-border/60">
            {recentWorkspaces.map((workspace, index) => (
              <li
                key={workspace.id}
                className={index > 0 ? 'border-t border-border/60' : undefined}
              >
                <button
                  type="button"
                  onClick={() => appNavigation.goToWorkspace(workspace.id)}
                  className="flex w-full min-w-0 items-center gap-base px-base py-half text-left text-sm text-normal hover:bg-secondary"
                >
                  {workspace.hasUnseenActivity && (
                    <span
                      aria-label="Awaiting input"
                      className="inline-block size-2 shrink-0 rounded-full bg-accent"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {workspace.name}
                  </span>
                  {workspace.branch && (
                    <span className="shrink-0 text-xs text-low">
                      {workspace.branch}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-low">What would you like to work on?</p>
      )}
    </div>
  );
}
