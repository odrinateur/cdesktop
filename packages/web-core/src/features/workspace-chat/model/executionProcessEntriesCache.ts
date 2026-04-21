import type { PatchType } from 'shared/types';

const cache = new Map<string, PatchType[]>();

export function getCachedEntries(id: string): PatchType[] | undefined {
  return cache.get(id);
}

export function setCachedEntries(id: string, entries: PatchType[]): void {
  cache.set(id, entries);
}
