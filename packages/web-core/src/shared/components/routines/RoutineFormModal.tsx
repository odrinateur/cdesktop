import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/Dialog';
import type { Routine } from 'shared/types';
import { RoutineForm, type RoutineFormValues } from './RoutineForm';

interface RoutineFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Routine;
  submitting?: boolean;
  onSubmit: (values: RoutineFormValues) => void;
}

export function RoutineFormModal({
  open,
  onOpenChange,
  initial,
  submitting,
  onSubmit,
}: RoutineFormModalProps) {
  const { t } = useTranslation('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-base">
          <DialogTitle>
            {initial ? t('routines.edit') : t('routines.newButton')}
          </DialogTitle>
        </DialogHeader>
        <RoutineForm
          initial={initial}
          submitting={submitting}
          submitLabel={
            initial
              ? t('routines.form.submitSave')
              : t('routines.form.submitCreate')
          }
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
