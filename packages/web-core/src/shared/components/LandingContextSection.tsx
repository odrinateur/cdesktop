import { useMemo } from 'react';
import { CaretRightIcon } from '@phosphor-icons/react';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import {
  useWorkspaces,
  type SidebarWorkspace,
} from '@/shared/hooks/useWorkspaces';
import { formatRelativeTimeShort } from '@/shared/lib/date';

const RECENT_LIMIT = 8;

function formatSubhead(attentionCount: number): string {
  if (attentionCount === 0) return 'Recent sessions';
  return attentionCount === 1
    ? '1 session awaiting input'
    : `${attentionCount} sessions awaiting input`;
}

type StatusTag = {
  label: string;
  textClass: string;
  dotClass: string;
};

function getStatusTag(workspace: SidebarWorkspace): StatusTag | null {
  if (workspace.hasPendingApproval) {
    return {
      label: 'Awaiting input',
      textClass: 'text-amber-400',
      dotClass: 'bg-amber-400',
    };
  }
  if (workspace.isRunning) {
    return {
      label: 'Running',
      textClass: 'text-blue-400',
      dotClass: 'bg-blue-400',
    };
  }
  if (
    workspace.latestProcessStatus === 'failed' ||
    workspace.latestProcessStatus === 'killed'
  ) {
    return {
      label: 'Failed',
      textClass: 'text-error',
      dotClass: 'bg-error',
    };
  }
  return null;
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
          <ul className="flex flex-col gap-[0.375rem]">
            {recentWorkspaces.map((workspace) => {
              const status = getStatusTag(workspace);
              return (
                <li key={workspace.id}>
                  <button
                    type="button"
                    onClick={() => appNavigation.goToWorkspace(workspace.id)}
                    className="group flex w-full min-w-0 items-center gap-base rounded-md bg-secondary px-double py-base text-left text-sm text-normal hover:bg-panel"
                  >
                    {status && (
                      <span className="flex shrink-0 items-center gap-1">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${status.dotClass}`}
                          aria-hidden
                        />
                        <span
                          className={`text-xs font-medium ${status.textClass}`}
                        >
                          {status.label}
                        </span>
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {workspace.name}
                    </span>
                    {workspace.branch && (
                      <span className="shrink-0 text-xs text-neutral-500">
                        {workspace.branch}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-neutral-500">
                      {formatRelativeTimeShort(workspace.updatedAt)}
                    </span>
                    <CaretRightIcon
                      className="size-icon-xs shrink-0 text-neutral-600 group-hover:text-neutral-400"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-low">What would you like to work on?</p>
      )}
    </div>
  );
}
