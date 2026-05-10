import { useCallback, useEffect, useState } from 'react';
import type { EnabledModel, Provider } from 'shared/types';
import {
  clampEffortToModel,
  inferReasoningOptions,
} from '@/shared/lib/reasoningCapability';
import { isAgentDefaultModelId } from '@/shared/lib/agentDefaultModel';

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
 * Default-provider + agent's first canonical model (or opus[1m]) + xhigh fallback.
 *
 * When `agentDefaultModels` is provided, Default-provider validation and the
 * fallback model use the active agent's canonical list instead of the
 * DB-synthesized (Claude-only) `enabledModels`. Pass it whenever the resolver
 * runs in an agent-aware context.
 */
export function resolveDefaultSelection(
  providers: Provider[],
  agentDefaultModels?: EnabledModel[]
): {
  providerId: string;
  modelId: string;
  reasoningId: string | null;
  preferredEffortId: string;
} | null {
  if (providers.length === 0) return null;

  const modelsFor = (p: Provider): EnabledModel[] => {
    if (
      p.kind === 'Default' &&
      agentDefaultModels &&
      agentDefaultModels.length > 0
    ) {
      return agentDefaultModels;
    }
    return p.enabledModels ?? [];
  };

  const findEnabledModel = (providerId: string, modelId: string) => {
    const p = providers.find((x) => x.id === providerId);
    if (!p || !p.enabled) return null;
    // The "agent default" sentinel is only valid on the Default provider —
    // non-Default routing always needs an explicit model since the
    // applier injects a base URL.
    if (isAgentDefaultModelId(modelId)) {
      return p.kind === 'Default' ? p : null;
    }
    const m = modelsFor(p).find((mm) => mm.id === modelId);
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
    // Agent-aware path: pick the agent's first canonical model.
    if (agentDefaultModels && agentDefaultModels.length > 0) {
      const firstId = agentDefaultModels[0].id;
      const opts = inferReasoningOptions(firstId);
      const reasoning = clampEffortToModel(FALLBACK_PREFERRED_EFFORT, opts);
      return {
        providerId: defaultProvider.id,
        modelId: firstId,
        reasoningId: reasoning,
        preferredEffortId: FALLBACK_PREFERRED_EFFORT,
      };
    }
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
