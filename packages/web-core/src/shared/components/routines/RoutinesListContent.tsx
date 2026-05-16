import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react';
import type { Routine } from 'shared/types';
import { routinesApi } from '@/shared/lib/api';
import { Button } from '@vibe/ui/components/Button';
import { formatScheduleSummary } from './scheduleFormat';

function formatNextRun(nextRunAt: string | null): string | null {
  if (!nextRunAt) return null;
  const date = new Date(nextRunAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Inner routines-list view, intended to be mounted inside SessionGrid's
 * anchor cell. The outer cell shell (sidebar, focus/opacity) is provided by
 * WorkspacesLayout + SessionGrid.
 */
export function RoutinesListContent() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  const { data: routines = [], isLoading } = useQuery<Routine[]>({
    queryKey: ['routines'],
    queryFn: () => routinesApi.list(),
    refetchOnWindowFocus: true,
  });

  return (
    <div className="flex-1 min-w-0 h-full overflow-auto bg-primary flex justify-center">
      <div className="w-chat max-w-full px-[35px] py-double flex flex-col gap-double">
        <header className="flex items-start justify-between gap-base">
          <div className="flex flex-col gap-half">
            <h1 className="text-2xl font-semibold text-high">
              {t('routines.title')}
            </h1>
            <p className="text-sm text-low">{t('routines.subtitle')}</p>
          </div>
          <Button type="button" onClick={() => navigate({ to: '/routines/new' })}>
            <PlusIcon className="size-icon-xs mr-half" weight="bold" />
            {t('routines.newButton')}
          </Button>
        </header>

        <div className="rounded-sm border border-border bg-secondary px-base py-half text-sm text-low">
          {t('routines.banner')}
        </div>

        {isLoading ? (
          <p className="text-sm text-low">…</p>
        ) : routines.length === 0 ? (
          <div className="rounded-sm border border-border bg-secondary p-double text-sm text-low text-center">
            {t('routines.empty')}
          </div>
        ) : (
          <ul className="flex flex-col gap-base">
            {routines.map((routine) => {
              const nextRun = formatNextRun(routine.next_run_at);
              return (
                <li key={routine.id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: '/routines/$routineId',
                        params: { routineId: routine.id },
                      })
                    }
                    className="w-full text-left rounded-sm border border-border bg-secondary hover:bg-panel px-double py-base transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                  >
                    <div className="flex items-start justify-between gap-base">
                      <div className="min-w-0 flex flex-col gap-half">
                        <span className="font-medium text-high truncate">
                          {routine.name}
                        </span>
                        <span className="text-sm text-low">
                          {formatScheduleSummary(routine, t)}
                        </span>
                      </div>
                      <div className="shrink-0 text-xs text-low">
                        {nextRun
                          ? t('routines.nextRun', { when: nextRun })
                          : t('routines.nextRunNever')}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
