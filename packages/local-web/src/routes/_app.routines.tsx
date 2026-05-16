import { createFileRoute } from '@tanstack/react-router';
import { RoutinesListPage } from '@/pages/routines/RoutinesListPage';

export const Route = createFileRoute('/_app/routines')({
  component: RoutinesListPage,
});
