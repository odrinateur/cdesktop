/**
 * Sentinel model id meaning "use the agent's own ambient configuration"
 * (no `--model` flag at spawn). Picked via the virtual "Default Model"
 * entry in `ProviderModelPicker`; only valid on the Default provider —
 * non-Default routing always needs an explicit model since the spawn
 * applier injects a base URL.
 *
 * IMPORTANT: do not change the literal value without auditing every
 * call site of `isAgentDefaultModelId`. The picker's virtual entry,
 * the resolver's kind-gated short-circuit, the trigger-label predicate,
 * the reset-effect carve-out, and both message-send mappings all
 * depend on the empty-string literal — a swap to `null` or a magic
 * string would silently break the trigger label and bounce users out
 * of the selection.
 */
export const AGENT_DEFAULT_MODEL_ID = '' as const;

export type AgentDefaultModelId = typeof AGENT_DEFAULT_MODEL_ID;

/** Did the user pick the "agent default" sentinel? */
export function isAgentDefaultModelId(
  modelId: string | null
): modelId is AgentDefaultModelId {
  return modelId === AGENT_DEFAULT_MODEL_ID;
}
