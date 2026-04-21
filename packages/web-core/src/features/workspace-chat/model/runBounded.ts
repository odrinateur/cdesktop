export const HISTORIC_FETCH_CONCURRENCY = 5;

export async function runBounded<I, O>(
  items: I[],
  limit: number,
  worker: (item: I) => Promise<O>
): Promise<O[]> {
  if (items.length === 0) return [];

  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results: O[] = new Array(items.length);
  let nextIndex = 0;

  const runOne = async (): Promise<void> => {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  };

  await Promise.all(Array.from({ length: effectiveLimit }, runOne));
  return results;
}
