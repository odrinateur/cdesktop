import { createFileRoute } from '@tanstack/react-router';
import { WorkspacesLayout } from '@/pages/workspaces/WorkspacesLayout';

export const Route = createFileRoute('/_app/routines')({
  component: WorkspacesLayout,
});
