import { CreateModeProvider } from '@/features/create-mode/model/CreateModeProvider';
import { ReviewProvider } from '@/shared/hooks/ReviewProvider';
import { ChangesViewProvider } from '@/shared/hooks/ChangesViewProvider';
import { CreateChatBoxContainer } from '@/shared/components/CreateChatBoxContainer';
import type { CreateModeInitialState } from '@/shared/types/createMode';

interface CreateFirstCellSlotProps {
  onWorkspaceCreated: (workspaceId: string) => void;
  /**
   * `key` to pass to the inner `CreateModeProvider` so it remounts when
   * the create-mode seed changes (matches the wrapping done at the page
   * level for the full-screen create form).
   */
  providerKey?: string;
  initialState?: CreateModeInitialState | null;
}

/**
 * Anchor-cell content for create mode. Mounts the same providers CellHost
 * would, minus WorkspaceProvider (no workspaceId yet). The surrounding
 * SessionGrid wraps this in a focus/opacity div + CellDropOverlay.
 */
export function CreateFirstCellSlot({
  onWorkspaceCreated,
  providerKey,
  initialState,
}: CreateFirstCellSlotProps) {
  return (
    <CreateModeProvider key={providerKey} initialState={initialState ?? null}>
      <ReviewProvider workspaceId={undefined}>
        <ChangesViewProvider>
          <CreateChatBoxContainer onWorkspaceCreated={onWorkspaceCreated} />
        </ChangesViewProvider>
      </ReviewProvider>
    </CreateModeProvider>
  );
}
