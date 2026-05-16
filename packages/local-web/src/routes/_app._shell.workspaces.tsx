import { createFileRoute, redirect } from '@tanstack/react-router';

// Bare `/workspaces` lands on the create-mode composer. Use beforeLoad so the
// redirect runs before any component mounts — keeps _shell's WorkspacesLayout
// continuously mounted across the redirect step.
export const Route = createFileRoute('/_app/_shell/workspaces')({
  beforeLoad: () => {
    throw redirect({
      to: '/workspaces/$workspaceId',
      params: { workspaceId: 'create' },
      replace: true,
    });
  },
});
