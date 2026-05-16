import { createFileRoute } from '@tanstack/react-router';
import { RoutineCreateContent } from '@/shared/components/routines/RoutineCreateContent';

export const Route = createFileRoute('/_app/_shell/routines_/new')({
  component: RoutineCreateContent,
});
