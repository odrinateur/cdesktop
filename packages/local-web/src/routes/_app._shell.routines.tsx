import { createFileRoute } from '@tanstack/react-router';
import { RoutinesListContent } from '@/shared/components/routines/RoutinesListContent';

export const Route = createFileRoute('/_app/_shell/routines')({
  component: RoutinesListContent,
});
