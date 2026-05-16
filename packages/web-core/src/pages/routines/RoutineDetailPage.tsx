import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  PencilSimpleIcon,
  PlayIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type {
  Repo,
  Routine,
  RoutineRun,
  RoutineRunStatus,
  UpdateRoutine,
} from 'shared/types';
import { repoApi, routinesApi } from '@/shared/lib/api';
import { Button } from '@vibe/ui/components/Button';
import { Switch } from '@vibe/ui/components/Switch';
import { ConfirmDialog } from '@/shared/dialogs/shared/ConfirmDialog';
import { formatScheduleSummary } from '@/shared/components/routines/scheduleFormat';
import { RoutineFormModal } from '@/shared/components/routines/RoutineFormModal';
import type { RoutineFormValues } from '@/shared/components/routines/RoutineForm';
import { RoutinesLayout } from './RoutinesLayout';

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusLabel(
  status: RoutineRunStatus,
  t: (key: string) => string
): string {
  return t(`routines.status.${status}`);
}

function statusBadgeClass(status: RoutineRunStatus): string {
  switch (status) {
    case 'running':
      return 'bg-blue-500/15 text-blue-500';
    case 'done':
      return 'bg-success/15 text-success';
    case 'failed':
      return 'bg-error/15 text-error';
    case 'skipped':
      return 'bg-low/15 text-low';
    case 'pending':
    default:
      return 'bg-secondary text-low';
  }
}

export function RoutineDetailPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { routineId } = useParams({ strict: false }) as { routineId: string };
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: routine, isLoading } = useQuery<Routine>({
    queryKey: ['routines', routineId],
    queryFn: () => routinesApi.get(routineId),
    enabled: !!routineId,
  });

  const { data: runs = [] } = useQuery<RoutineRun[]>({
    queryKey: ['routines', routineId, 'runs'],
    queryFn: () => routinesApi.listRuns(routineId),
    enabled: !!routineId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: repo } = useQuery<Repo>({
    queryKey: ['repos', routine?.repo_id],
    queryFn: () => repoApi.getById(routine!.repo_id),
    enabled: !!routine?.repo_id,
  });

  const runNowMutation = useMutation({
    mutationFn: () => routinesApi.runNow(routineId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: ['routines', routineId, 'runs'],
      });
      queryClient.invalidateQueries({ queryKey: ['routines', routineId] });
      if (response.workspace_id) {
        navigate({
          to: '/workspaces/$workspaceId',
          params: { workspaceId: response.workspace_id },
        });
      }
    },
  });

  const updateMutation = useMutation<Routine, Error, UpdateRoutine>({
    mutationFn: (payload) => routinesApi.update(routineId, payload),
    onSuccess: (next) => {
      queryClient.setQueryData(['routines', routineId], next);
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => routinesApi.delete(routineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      navigate({ to: '/routines' });
    },
  });

  const folderLabel = useMemo(() => {
    if (!repo) return routine?.repo_id ?? '';
    return repo.display_name || repo.name;
  }, [repo, routine?.repo_id]);

  const handleEditSubmit = (values: RoutineFormValues) => {
    const payload: UpdateRoutine = {
      name: values.name,
      description: values.description,
      instructions: values.instructions,
      use_worktree: values.use_worktree,
      executor_config: values.executor_config,
      schedule_kind: values.schedule_kind,
      schedule_time: values.schedule_time,
      schedule_dow: values.schedule_dow,
      enabled: values.enabled,
    };
    updateMutation.mutate(payload, {
      onSuccess: () => setIsEditOpen(false),
    });
  };

  const handleToggleEnabled = (next: boolean) => {
    updateMutation.mutate({ enabled: next });
  };

  const handleDelete = async () => {
    if (!routine) return;
    const result = await ConfirmDialog.show({
      title: t('routines.deleteConfirmTitle'),
      message: t('routines.deleteConfirm', {
        name: routine.name,
        count: runs.length,
      }),
      confirmText: t('routines.delete'),
      variant: 'destructive',
    });
    if (result === 'confirmed') {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <RoutinesLayout>
        <div className="h-full bg-primary flex items-center justify-center">
          <p className="text-sm text-low">…</p>
        </div>
      </RoutinesLayout>
    );
  }

  if (!routine) {
    return (
      <RoutinesLayout>
        <div className="h-full bg-primary flex items-center justify-center">
          <p className="text-sm text-low">Routine not found.</p>
        </div>
      </RoutinesLayout>
    );
  }

  const nextRunStr = routine.next_run_at
    ? formatTimestamp(routine.next_run_at)
    : t('routines.nextRunNever');

  return (
    <RoutinesLayout>
      <div className="h-full overflow-auto bg-primary">
        <div className="mx-auto w-full max-w-5xl px-double py-double flex flex-col gap-double">
        {/* Header */}
        <header className="flex items-center justify-between gap-base">
          <div className="flex items-center gap-half text-sm text-low min-w-0">
            <button
              type="button"
              onClick={() => navigate({ to: '/routines' })}
              className="hover:text-normal transition-colors"
            >
              {t('routines.title')}
            </button>
            <CaretRightIcon className="size-icon-xs" weight="bold" />
            <span className="text-normal truncate">{routine.name}</span>
          </div>
          <div className="flex items-center gap-half">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
            >
              <PencilSimpleIcon className="size-icon-xs mr-half" />
              {t('routines.edit')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <TrashIcon className="size-icon-xs mr-half" />
              {t('routines.delete')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => runNowMutation.mutate()}
              disabled={runNowMutation.isPending}
            >
              <PlayIcon className="size-icon-xs mr-half" weight="fill" />
              {t('routines.runNow')}
            </Button>
          </div>
        </header>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-double">
          {/* Left column */}
          <div className="flex flex-col gap-double">
            <section>
              <h2 className="text-xs uppercase tracking-wide text-low mb-half">
                {t('routines.sections.description')}
              </h2>
              <p className="text-sm text-normal whitespace-pre-wrap">
                {routine.description}
              </p>
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-wide text-low mb-half">
                {t('routines.sections.status')}
              </h2>
              <div className="flex items-center gap-base">
                <Switch
                  checked={routine.enabled}
                  onCheckedChange={handleToggleEnabled}
                  disabled={updateMutation.isPending}
                />
                <span className="text-sm text-normal">
                  {routine.enabled
                    ? t('routines.enabled')
                    : t('routines.disabled')}
                </span>
              </div>
              <p className="mt-half text-sm text-low">
                {t('routines.nextRun', { when: nextRunStr })}
              </p>
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-wide text-low mb-half">
                {t('routines.sections.folder')}
              </h2>
              <p className="text-sm text-normal">{folderLabel}</p>
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-wide text-low mb-half">
                {t('routines.sections.repeats')}
              </h2>
              <p className="text-sm text-normal">
                {formatScheduleSummary(routine)}
              </p>
            </section>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-double">
            <section>
              <h2 className="text-xs uppercase tracking-wide text-low mb-half">
                {t('routines.sections.instructions')}
              </h2>
              <pre className="rounded-sm border border-border bg-secondary p-base text-sm text-normal whitespace-pre-wrap font-sans">
                {routine.instructions}
              </pre>
            </section>

            <section>
              <div className="flex items-center justify-between mb-half">
                <h2 className="text-xs uppercase tracking-wide text-low">
                  {t('routines.history.title')}
                </h2>
                {runNowMutation.isPending && (
                  <ArrowClockwiseIcon
                    className="size-icon-xs text-low animate-spin"
                    weight="bold"
                  />
                )}
              </div>
              {runs.length === 0 ? (
                <p className="text-sm text-low">
                  {t('routines.history.empty')}
                </p>
              ) : (
                <ul className="flex flex-col gap-half">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <button
                        type="button"
                        disabled={!run.workspace_id}
                        onClick={() => {
                          if (run.workspace_id) {
                            navigate({
                              to: '/workspaces/$workspaceId',
                              params: { workspaceId: run.workspace_id },
                            });
                          }
                        }}
                        className="w-full flex items-center justify-between gap-base rounded-sm border border-border bg-secondary px-base py-half text-left hover:bg-panel transition-colors disabled:cursor-default disabled:hover:bg-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-normal truncate">
                            {formatTimestamp(run.scheduled_at)}
                          </span>
                          {run.skip_reason && (
                            <span className="text-xs text-low">
                              {t(
                                `routines.skipReason.${
                                  run.skip_reason === 'app_offline'
                                    ? 'appOffline'
                                    : run.skip_reason === 'prev_still_running'
                                      ? 'prevStillRunning'
                                      : 'appOffline'
                                }`
                              )}
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-xs px-base py-[2px] rounded-sm ${statusBadgeClass(
                            run.status
                          )}`}
                        >
                          {statusLabel(run.status, t)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <RoutineFormModal
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          initial={routine}
          submitting={updateMutation.isPending}
          onSubmit={handleEditSubmit}
        />
        </div>
      </div>
    </RoutinesLayout>
  );
}
