import { useCallback, useEffect, useState } from 'react';
import type { Provider } from 'shared/types';
import {
  clampEffortToModel,
  inferReasoningOptions,
} from '@/shared/lib/reasoningCapability';

const NEW_KEY = 'cdesktop:picker:new';
const LAST_USED_KEY = 'cdesktop:picker:last-used';
const workspaceKey = (id: string) => `cdesktop:picker:workspace:${id}`;

/** Hardcoded fallback when no last-used choice exists. */
const FALLBACK_MODEL_ID = 'opus[1m]';
const FALLBACK_PREFERRED_EFFORT = 'xhigh';

export interface PickerSelection {
  selectedProviderId: string | null;
  selectedModelId: string | null;
  selectedReasoningId: string | null;
  preferredEffortId: string | null;
}

export interface LastUsedSelection {
  providerId: string;
  modelId: string;
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

function readLastUsed(): LastUsedSelection | null {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastUsedSelection;
  } catch {
    return null;
  }
}

/** Persist the choice that was just used to send a message. */
export function writeLastUsed(selection: LastUsedSelection) {
  try {
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(selection));
  } catch {
    /* silent */
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

/**
 * Resolve a default selection for the new-session composer:
 * last-used choice (if its provider+model still exist & enabled) →
 * Default-provider + opus[1m] + xhigh fallback.
 * Returns null if providers haven't loaded yet or the fallback model isn't available.
 */
export function resolveDefaultSelection(
  providers: Provider[]
): {
  providerId: string;
  modelId: string;
  reasoningId: string | null;
  preferredEffortId: string;
} | null {
  if (providers.length === 0) return null;

  const findEnabledModel = (providerId: string, modelId: string) => {
    const p = providers.find((x) => x.id === providerId);
    if (!p || !p.enabled) return null;
    const m = p.enabledModels?.find((mm) => mm.id === modelId);
    return m ? p : null;
  };

  const last = readLastUsed();
  if (last) {
    const provider = findEnabledModel(last.providerId, last.modelId);
    if (provider) {
      const opts = inferReasoningOptions(last.modelId);
      const reasoning = clampEffortToModel(last.preferredEffortId, opts);
      return {
        providerId: provider.id,
        modelId: last.modelId,
        reasoningId: reasoning,
        preferredEffortId: last.preferredEffortId ?? FALLBACK_PREFERRED_EFFORT,
      };
    }
  }

  const defaultProvider = providers.find(
    (p) => p.kind === 'Default' && p.enabled
  );
  if (defaultProvider) {
    const hasFallback = defaultProvider.enabledModels?.some(
      (m) => m.id === FALLBACK_MODEL_ID
    );
    if (hasFallback) {
      const opts = inferReasoningOptions(FALLBACK_MODEL_ID);
      const reasoning = clampEffortToModel(FALLBACK_PREFERRED_EFFORT, opts);
      return {
        providerId: defaultProvider.id,
        modelId: FALLBACK_MODEL_ID,
        reasoningId: reasoning,
        preferredEffortId: FALLBACK_PREFERRED_EFFORT,
      };
    }
  }

  return null;
}
