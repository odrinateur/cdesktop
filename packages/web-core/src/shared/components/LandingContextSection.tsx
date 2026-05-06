import { useMemo } from 'react';
import { CaretRightIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import {
  useWorkspaces,
  type SidebarWorkspace,
} from '@/shared/hooks/useWorkspaces';
import { formatRelativeTimeShort } from '@/shared/lib/date';

const RECENT_LIMIT = 8;

type StatusTag = {
  label: string;
  textClass: string;
  dotClass: string;
};

function getStatusTag(
  workspace: SidebarWorkspace,
  t: (key: string) => string
): StatusTag | null {
  if (workspace.hasPendingApproval) {
    return {
      label: t('createMode.landing.status.awaitingInput'),
      textClass: 'text-amber-400',
      dotClass: 'bg-amber-400',
    };
  }
  if (workspace.isRunning) {
    return {
      label: t('createMode.landing.status.running'),
      textClass: 'text-blue-400',
      dotClass: 'bg-blue-400',
    };
  }
  if (
    workspace.latestProcessStatus === 'failed' ||
    workspace.latestProcessStatus === 'killed'
  ) {
    return {
      label: t('createMode.landing.status.failed'),
      textClass: 'text-error',
      dotClass: 'bg-error',
    };
  }
  return null;
}

export function LandingContextSection() {
  const { t } = useTranslation('common');
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

  const subhead =
    attentionCount === 0
      ? t('createMode.landing.recentSessions')
      : t('createMode.landing.sessionsAwaitingInput', {
          count: attentionCount,
        });

  return (
    <div className="flex flex-col gap-base">
      <h1 className="flex items-center gap-double text-3xl font-medium tracking-tight text-high mb-12">
        <span className="inline-flex h-[1.5em] w-[1.5em] items-center justify-center rounded-xl bg-neutral-900">
          <img
            src="/logo-white.svg"
            alt=""
            aria-hidden
            className="h-[0.8em] w-auto"
          />
        </span>
        {t('createMode.landing.welcomeBack')}
      </h1>
      {hasRecent ? (
        <>
          <p className="text-sm text-low">{subhead}</p>
          <ul className="flex flex-col gap-[0.375rem]">
            {recentWorkspaces.map((workspace) => {
              const status = getStatusTag(workspace, t);
              return (
                <li key={workspace.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => appNavigation.goToWorkspace(workspace.id)}
                    className="group flex w-full min-w-0 items-center gap-base overflow-hidden rounded-md bg-secondary px-double py-base text-left text-sm text-normal hover:bg-panel"
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
                      <span className="min-w-0 max-w-[10ch] truncate text-xs text-neutral-500">
                        {workspace.branch}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-neutral-500">
                      {formatRelativeTimeShort(workspace.updatedAt, t)}
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
        <p className="text-sm text-low">
          {t('createMode.landing.whatToWorkOn')}
        </p>
      )}
    </div>
  );
}
