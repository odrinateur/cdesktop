import { createFileRoute } from '@tanstack/react-router';
import { RoutineCreatePage } from '@/pages/routines/RoutineCreatePage';

export const Route = createFileRoute('/_app/routines/new')({
  component: RoutineCreatePage,
});
