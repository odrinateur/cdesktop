import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretRightIcon } from '@phosphor-icons/react';
import type { CreateRoutine, Routine } from 'shared/types';
import { routinesApi } from '@/shared/lib/api';
import { RoutineForm, type RoutineFormValues } from './RoutineForm';

/**
 * Inner routines-create view, mounted inside SessionGrid's anchor cell.
 */
export function RoutineCreateContent() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation<Routine, Error, CreateRoutine>({
    mutationFn: (payload) => routinesApi.create(payload),
    onSuccess: (routine) => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      navigate({
        to: '/routines/$routineId',
        params: { routineId: routine.id },
      });
    },
  });

  const handleSubmit = (values: RoutineFormValues) => {
    const payload: CreateRoutine = {
      name: values.name,
      description: values.description,
      instructions: values.instructions,
      repo_id: values.repo_id,
      use_worktree: values.use_worktree,
      executor_config: values.executor_config,
      schedule_kind: values.schedule_kind,
      schedule_time: values.schedule_time,
      schedule_dow: values.schedule_dow,
      enabled: values.enabled,
      // target_branch left undefined → backend resolves repo HEAD at run time
    };
    createMutation.mutate(payload);
  };

  return (
    <div className="h-full overflow-auto bg-primary">
      <div className="mx-auto w-full max-w-3xl px-double py-double flex flex-col gap-double">
        <header className="flex items-center gap-half text-sm text-low">
          <button
            type="button"
            onClick={() => navigate({ to: '/routines' })}
            className="hover:text-normal transition-colors"
          >
            {t('routines.title')}
          </button>
          <CaretRightIcon className="size-icon-xs" weight="bold" />
          <span className="text-normal">{t('routines.newPageTitle')}</span>
        </header>

        <RoutineForm
          submitLabel={t('routines.form.submitCreate')}
          submitting={createMutation.isPending}
          onSubmit={handleSubmit}
          onCancel={() => navigate({ to: '/routines' })}
        />

        {createMutation.isError && (
          <p className="text-sm text-error">
            {createMutation.error?.message ?? 'Failed to create routine'}
          </p>
        )}
      </div>
    </div>
  );
}
