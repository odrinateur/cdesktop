import { createFileRoute } from '@tanstack/react-router';
import { RoutineDetailPage } from '@/pages/routines/RoutineDetailPage';

export const Route = createFileRoute('/_app/routines_/$routineId')({
  component: RoutineDetailPage,
});
