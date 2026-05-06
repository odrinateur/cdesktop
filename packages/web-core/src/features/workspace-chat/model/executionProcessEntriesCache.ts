// Per-execution-process entries cache (Layer 1).
//
// Three writers under an explicit ordering rule:
//
//   1. Active view's historic-fetch path (loadEntriesForHistoricExecutionProcess)
//      — writes on `onFinished` only. Canonical writer for finished
//      processes that the user has loaded in the chat.
//
//   2. Active view's running→finished refetch path (useConversationHistory's
//      previousStatus effect) — writes via path #1 after invalidating
//      first. Canonical writer for the just-finished case.
//
//   3. liveSessionFollower's per-process watcher — writes incrementally
//      for *running* processes it is actively observing. Stops writing
//      once it sees `finished:true`.
//
// Convergence is guaranteed by JsonPatch idempotence: every writer writes
// the same patch sequence applied to the same initial state, so the
// stored array converges to the same final value regardless of write
// order. The "follower stops on finished" rule prevents a late follower
// write from stomping on path #1's canonical write.
import type { PatchType } from 'shared/types';

const cache = new Map<string, PatchType[]>();

export function getCachedEntries(id: string): PatchType[] | undefined {
  return cache.get(id);
}

export function setCachedEntries(id: string, entries: PatchType[]): void {
  cache.set(id, entries);
}

export function clearCachedEntries(id: string): void {
  cache.delete(id);
}
