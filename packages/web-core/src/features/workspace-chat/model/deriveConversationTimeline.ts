import { aggregateConsecutiveEntries } from '@/shared/lib/aggregateEntries';
import type {
  DisplayEntry,
  PatchTypeWithKey,
} from '@/shared/hooks/useConversationHistory/types';

import {
  buildConversationRowsIncremental,
  type ConversationRow,
} from './conversation-row-model';

export interface DerivedConversationTimeline {
  readonly displayEntries: DisplayEntry[];
  readonly rows: ConversationRow[];
}

function isRenderableConversationEntry(entry: DisplayEntry): boolean {
  if (
    entry.type === 'NORMALIZED_ENTRY' &&
    typeof entry.content !== 'string' &&
    'entry_type' in entry.content
  ) {
    const entryType = entry.content.entry_type.type;
    if (entryType === 'next_action' || entryType === 'token_usage_info') {
      return false;
    }
    // Hide hook lifecycle entries injected by Claude Code hook plugins
    // (e.g. "System: hook_started", "System: hook_completed"). Filter
    // here so the row never enters the virtualizer and occupies no space.
    if (
      entryType === 'system_message' &&
      typeof entry.content.content === 'string' &&
      entry.content.content.startsWith('System: hook_')
    ) {
      return false;
    }
    return true;
  }

  return (
    entry.type === 'NORMALIZED_ENTRY' ||
    entry.type === 'STDOUT' ||
    entry.type === 'STDERR' ||
    entry.type === 'AGGREGATED_GROUP' ||
    entry.type === 'AGGREGATED_DIFF_GROUP' ||
    entry.type === 'AGGREGATED_THINKING_GROUP'
  );
}

// Final UI-facing timeline step: aggregate display entries and build stable rows
// for virtualization, navigation, and scroll orchestration.

export function deriveConversationTimeline(
  entries: PatchTypeWithKey[],
  previousDisplayEntries: DisplayEntry[],
  previousRows: ConversationRow[]
): DerivedConversationTimeline {
  const displayEntries = aggregateConsecutiveEntries(entries).filter(
    isRenderableConversationEntry
  );

  const rows = buildConversationRowsIncremental(
    displayEntries,
    previousDisplayEntries,
    previousRows
  );

  return {
    displayEntries,
    rows,
  };
}
