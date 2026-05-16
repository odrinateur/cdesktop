import { createFileRoute, Outlet } from '@tanstack/react-router';
import { WorkspacesLayout } from '@/pages/workspaces/WorkspacesLayout';

// Pathless layout route. All workspace + routines pages live under this so
// WorkspacesLayout (and its SessionGrid + cells) stay mounted across leaf
// transitions like /routines ↔ /workspaces/$id. Without this shared parent,
// each leaf would mount its own WorkspacesLayout instance and every cell
// would tear down on every nav.
export const Route = createFileRoute('/_app/_shell')({
  component: ShellRoute,
});

function ShellRoute() {
  // WorkspacesLayout renders <Outlet /> internally as its firstCellSlot when
  // on routines paths. For workspace detail paths Outlet's leaf returns null
  // and the anchor cell falls back to showing the workspace from the store.
  return <WorkspacesLayout />;
}

// Re-export so leaves don't need to import Outlet themselves if convenient.
export { Outlet };
