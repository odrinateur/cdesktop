import { useCallback, useEffect, useState } from 'react';

const NEW_KEY = 'cdesktop:picker:new';
const workspaceKey = (id: string) => `cdesktop:picker:workspace:${id}`;

export interface PickerSelection {
  selectedProviderId: string | null;
  selectedModelId: string | null;
  selectedReasoningId: string | null;
  preferredEffortId: string | null;
}

const EMPTY: PickerSelection = {
  selectedProviderId: null,
  selectedModelId: null,
  selectedReasoningId: null,
  preferredEffortId: null,
};

function readPersisted(key: string): PickerSelection | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PickerSelection;
  } catch {
    return null;
  }
}

function writePersisted(key: string, value: PickerSelection) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — silent */
  }
}

/**
 * Per-cell picker state. Uses local React state so multiple cells holding
 * different workspaces don't share. Hydrates from and writes to a workspace-
 * scoped localStorage key (or a `:new` key for the new-session composer).
 */
export function useWorkspacePickerSelection(workspaceId: string | undefined) {
  const key = workspaceId ? workspaceKey(workspaceId) : NEW_KEY;

  const [state, setState] = useState<PickerSelection>(
    () => readPersisted(key) ?? EMPTY
  );

  // Re-hydrate when the key changes (e.g. cell switched to a different workspace).
  useEffect(() => {
    setState(readPersisted(key) ?? EMPTY);
  }, [key]);

  // Persist on every change.
  useEffect(() => {
    writePersisted(key, state);
  }, [key, state]);

  const setSelection = useCallback(
    (
      providerId: string | null,
      modelId: string | null,
      reasoningId: string | null
    ) =>
      setState((s) => ({
        ...s,
        selectedProviderId: providerId,
        selectedModelId: modelId,
        selectedReasoningId: reasoningId,
      })),
    []
  );

  const setPreferredEffort = useCallback(
    (effortId: string | null) =>
      setState((s) => ({ ...s, preferredEffortId: effortId })),
    []
  );

  return {
    ...state,
    setSelection,
    setPreferredEffort,
  };
}

/**
 * Copy the new-session composer's last pick into a freshly created
 * workspace's storage key so the user doesn't have to re-pick on the
 * very first visit to the new session.
 */
export function seedWorkspacePicker(workspaceId: string) {
  const data = readPersisted(NEW_KEY);
  if (data) writePersisted(workspaceKey(workspaceId), data);
}
