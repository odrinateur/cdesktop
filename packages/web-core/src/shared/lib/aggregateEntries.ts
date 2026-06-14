import type {
  PatchTypeWithKey,
  DisplayEntry,
  AggregatedPatchGroup,
  AggregatedDiffGroup,
  AggregatedTurnGroup,
  ToolAggregationType,
} from '@/shared/hooks/useConversationHistory/types';

/**
 * Checks if a patch entry is a user_message entry.
 */
function isUserMessage(entry: PatchTypeWithKey): boolean {
  if (entry.type !== 'NORMALIZED_ENTRY') return false;
  return entry.content.entry_type.type === 'user_message';
}

/**
 * Checks if a patch entry is a thinking entry.
 */
function isThinkingEntry(entry: PatchTypeWithKey): boolean {
  if (entry.type !== 'NORMALIZED_ENTRY') return false;
  return entry.content.entry_type.type === 'thinking';
}

/**
 * Empty thinking entries (no text content) render as a lone icon with no body —
 * common with Claude's signature-only streaming thinking blocks. Hide them.
 */
function isEmptyThinkingEntry(entry: PatchTypeWithKey): boolean {
  if (!isThinkingEntry(entry)) return false;
  if (entry.type !== 'NORMALIZED_ENTRY') return false;
  return entry.content.content.trim() === '';
}

/**
 * Extracts the file path from a file_edit entry, or null if not a file_edit entry.
 */
function getFileEditPath(entry: PatchTypeWithKey): string | null {
  if (entry.type !== 'NORMALIZED_ENTRY') return null;

  const entryType = entry.content.entry_type;
  if (entryType.type !== 'tool_use') return null;

  const { action_type } = entryType;
  if (action_type.action === 'file_edit') {
    return action_type.path;
  }

  return null;
}

/**
 * Determines if a patch entry can be aggregated and returns its aggregation type.
 * Handles file_read, search, web_fetch, and command_run (categorized by command type).
 */
function getAggregationType(
  entry: PatchTypeWithKey
): ToolAggregationType | null {
  if (entry.type !== 'NORMALIZED_ENTRY') return null;

  const entryType = entry.content.entry_type;
  if (entryType.type !== 'tool_use') return null;

  const { action_type } = entryType;
  if (action_type.action === 'file_read') return 'file_read';
  if (action_type.action === 'search') return 'search';
  if (action_type.action === 'web_fetch') return 'web_fetch';

  if (action_type.action === 'command_run') {
    const category = action_type.category;
    if (
      category === 'read' ||
      category === 'search' ||
      category === 'edit' ||
      category === 'fetch'
    ) {
      return `command_run_${category}`;
    }
  }

  return null;
}

function isAssistantMessage(entry: PatchTypeWithKey): boolean {
  if (entry.type !== 'NORMALIZED_ENTRY') return false;
  return entry.content.entry_type.type === 'assistant_message';
}

/**
 * Trailing entries that don't visually represent a "final answer" from the
 * model — token-usage tallies, hook lifecycle pings, etc. They live at the
 * tail of a turn but shouldn't prevent the assistant_message just before
 * them from being treated as the final message.
 */
function isTailIgnorable(entry: PatchTypeWithKey): boolean {
  if (entry.type !== 'NORMALIZED_ENTRY') return false;
  const t = entry.content.entry_type.type;
  if (t === 'token_usage_info' || t === 'next_action') return true;
  if (
    t === 'system_message' &&
    typeof entry.content.content === 'string' &&
    entry.content.content.startsWith('System: hook_')
  ) {
    return true;
  }
  return false;
}

/**
 * Collapse the body of each turn into an accordion.
 *
 * A "turn" starts at a `user_message` and runs until the next `user_message`
 * (or the end of the stream). Within the turn we identify the **last**
 * `assistant_message` and keep it visible outside the accordion. Everything
 * between the user message and that final assistant message (thinking, tool
 * uses, intermediate assistant text, system/error messages) is wrapped in a
 * single `AggregatedTurnGroup`. If a turn has no assistant message yet (e.g.
 * during streaming), the whole body goes into the accordion.
 *
 * Entries that appear *before* the first user message (script preambles,
 * etc.) are passed through unchanged.
 */
function aggregateTurns(entries: PatchTypeWithKey[]): PatchTypeWithKey[] {
  if (entries.length === 0) return [];

  const userMessageIndices: number[] = [];
  entries.forEach((entry, index) => {
    if (isUserMessage(entry)) userMessageIndices.push(index);
  });

  if (userMessageIndices.length === 0) return entries;

  const result: PatchTypeWithKey[] = [];

  // Pass through anything before the first user message.
  for (let i = 0; i < userMessageIndices[0]; i++) {
    result.push(entries[i]);
  }

  for (let t = 0; t < userMessageIndices.length; t++) {
    const userIdx = userMessageIndices[t];
    const turnEndExclusive =
      t + 1 < userMessageIndices.length
        ? userMessageIndices[t + 1]
        : entries.length;

    const userEntry = entries[userIdx];
    result.push(userEntry);

    // The "final message" tail is the assistant_message that ends this turn,
    // optionally followed only by tail-ignorable entries (token usage, hook
    // pings). If the last meaningful entry of the turn is NOT an
    // assistant_message — e.g. the turn was interrupted while a tool was
    // running, or it ended on an error — there is no tail and the entire
    // body collapses into the accordion.
    let lastMeaningfulIdx = -1;
    for (let i = turnEndExclusive - 1; i > userIdx; i--) {
      if (!isTailIgnorable(entries[i])) {
        lastMeaningfulIdx = i;
        break;
      }
    }
    const lastAssistantIdx =
      lastMeaningfulIdx !== -1 && isAssistantMessage(entries[lastMeaningfulIdx])
        ? lastMeaningfulIdx
        : -1;

    const bodyEnd =
      lastAssistantIdx === -1 ? turnEndExclusive : lastAssistantIdx;
    const body = entries.slice(userIdx + 1, bodyEnd);

    if (body.length > 0) {
      const first = body[0];
      const group: AggregatedTurnGroup = {
        type: 'AGGREGATED_TURN_GROUP',
        entries: body,
        patchKey: `agg-turn:${userEntry.patchKey}`,
        executionProcessId: first.executionProcessId,
      };
      result.push(group as unknown as PatchTypeWithKey);
    }

    if (lastAssistantIdx !== -1) {
      result.push(entries[lastAssistantIdx]);
      // Anything after the final assistant message but before the next user
      // message (rare — e.g. trailing token usage info) passes through.
      for (let i = lastAssistantIdx + 1; i < turnEndExclusive; i++) {
        result.push(entries[i]);
      }
    }
  }

  return result;
}

/**
 * Aggregates consecutive entries of the same aggregatable type (file_read, search, web_fetch)
 * into grouped entries for accordion-style display.
 *
 * Also aggregates consecutive file_edit entries for the same file path.
 * Also aggregates thinking entries in previous conversation turns.
 *
 * Rules:
 * - Only group entries of the same type that follow each other consecutively
 * - For file_edit entries, also group by file path
 * - Thinking entries in previous turns (before the last user message) are collapsed
 * - Preserve the original order of entries
 * - Single entries of an aggregatable type are NOT grouped (returned as-is)
 * - At least 2 consecutive entries of the same type are required to form a group
 */
export function aggregateConsecutiveEntries(
  entries: PatchTypeWithKey[]
): DisplayEntry[] {
  if (entries.length === 0) return [];

  const filteredEntries = entries.filter((e) => !isEmptyThinkingEntry(e));
  if (filteredEntries.length === 0) return [];

  // First pass: collapse each turn's body (between user msg and final
  // assistant msg) into an AggregatedTurnGroup.
  const entriesWithTurnsAggregated = aggregateTurns(filteredEntries);

  const result: DisplayEntry[] = [];

  // State for tool aggregation (file_read, search, web_fetch, command_run_*)
  let currentToolGroup: PatchTypeWithKey[] = [];
  let currentAggregationType: ToolAggregationType | null = null;

  // State for diff aggregation (file_edit by path)
  let currentDiffGroup: PatchTypeWithKey[] = [];
  let currentDiffPath: string | null = null;

  const flushToolGroup = () => {
    if (currentToolGroup.length === 0) return;

    if (currentToolGroup.length === 1) {
      // Single entry - don't aggregate, return as-is
      result.push(currentToolGroup[0]);
    } else {
      // Multiple entries - create an aggregated group
      const firstEntry = currentToolGroup[0];
      const aggregatedGroup: AggregatedPatchGroup = {
        type: 'AGGREGATED_GROUP',
        aggregationType: currentAggregationType!,
        entries: [...currentToolGroup],
        patchKey: `agg:${firstEntry.patchKey}`,
        executionProcessId: firstEntry.executionProcessId,
      };
      result.push(aggregatedGroup);
    }

    currentToolGroup = [];
    currentAggregationType = null;
  };

  const flushDiffGroup = () => {
    if (currentDiffGroup.length === 0) return;

    if (currentDiffGroup.length === 1) {
      // Single entry - don't aggregate, return as-is
      result.push(currentDiffGroup[0]);
    } else {
      // Multiple entries for same file - create an aggregated diff group
      const firstEntry = currentDiffGroup[0];
      const aggregatedDiffGroup: AggregatedDiffGroup = {
        type: 'AGGREGATED_DIFF_GROUP',
        filePath: currentDiffPath!,
        entries: [...currentDiffGroup],
        patchKey: `agg-diff:${firstEntry.patchKey}`,
        executionProcessId: firstEntry.executionProcessId,
      };
      result.push(aggregatedDiffGroup);
    }

    currentDiffGroup = [];
    currentDiffPath = null;
  };

  for (const entry of entriesWithTurnsAggregated) {
    // Check if this is already an aggregated turn group (from first pass)
    if (
      (entry as unknown as AggregatedTurnGroup).type === 'AGGREGATED_TURN_GROUP'
    ) {
      flushToolGroup();
      flushDiffGroup();
      result.push(entry as unknown as DisplayEntry);
      continue;
    }

    const aggregationType = getAggregationType(entry);
    const fileEditPath = getFileEditPath(entry);

    // Handle file_edit entries
    if (fileEditPath !== null) {
      // Flush any pending tool group first
      flushToolGroup();

      if (currentDiffPath === null) {
        // Start a new diff group
        currentDiffPath = fileEditPath;
        currentDiffGroup.push(entry);
      } else if (fileEditPath === currentDiffPath) {
        // Same file - add to current diff group
        currentDiffGroup.push(entry);
      } else {
        // Different file - flush current diff group and start new one
        flushDiffGroup();
        currentDiffPath = fileEditPath;
        currentDiffGroup.push(entry);
      }
    }
    // Handle tool aggregation (file_read, search, web_fetch)
    else if (aggregationType !== null) {
      // Flush any pending diff group first
      flushDiffGroup();

      if (currentAggregationType === null) {
        // Start a new tool group
        currentAggregationType = aggregationType;
        currentToolGroup.push(entry);
      } else if (aggregationType === currentAggregationType) {
        // Same type - add to current group
        currentToolGroup.push(entry);
      } else {
        // Different aggregatable type - flush current group and start new one
        flushToolGroup();
        currentAggregationType = aggregationType;
        currentToolGroup.push(entry);
      }
    }
    // Non-aggregatable entry
    else {
      // Flush any pending groups and add this entry
      flushToolGroup();
      flushDiffGroup();
      result.push(entry);
    }
  }

  // Flush any remaining groups
  flushToolGroup();
  flushDiffGroup();

  return result;
}
