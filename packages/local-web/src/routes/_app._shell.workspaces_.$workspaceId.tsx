import { useCallback } from 'react';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { CreateFirstCellSlot } from '@/pages/workspaces/cells/CreateFirstCellSlot';
import { useCreateModeSeed } from '@/features/create-mode/model/useCreateModeSeed';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

export const Route = createFileRoute('/_app/_shell/workspaces_/$workspaceId')({
  component: WorkspaceLeaf,
});

function WorkspaceLeaf() {
  const { workspaceId } = useParams({
    from: '/_app/_shell/workspaces_/$workspaceId',
  });
  if (workspaceId === 'create') {
    return <CreateLeaf />;
  }
  // For real workspace ids the anchor cell falls back to showing the
  // workspace from the session-grid store. Nothing renders into Outlet.
  return null;
}

function CreateLeaf() {
  const { providerKey, initialState } = useCreateModeSeed();
  const appNavigation = useAppNavigation();
  const handleWorkspaceCreated = useCallback(
    (id: string) => appNavigation.goToWorkspace(id),
    [appNavigation]
  );
  return (
    <CreateFirstCellSlot
      onWorkspaceCreated={handleWorkspaceCreated}
      providerKey={providerKey}
      initialState={initialState}
    />
  );
}
