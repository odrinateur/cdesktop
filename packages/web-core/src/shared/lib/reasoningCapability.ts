const FIVE = ['low', 'medium', 'high', 'xhigh', 'max'];
const FOUR = FIVE.slice(0, 4);
const THREE = FIVE.slice(0, 3);

/**
 * Heuristic: which effort levels to surface for a given model id.
 * Returns ordered effort ids; consumers translate labels via i18n.
 * - haiku → none
 * - opus | sonnet | deepseek-v4 → 5 levels (low → max)
 * - gpt-5* → 4 levels (low → xhigh)
 * - everything else → 3 levels (low/med/high)
 */
export function inferReasoningOptions(modelId: string): string[] {
  const id = modelId.toLowerCase();
  if (id.includes('haiku')) return [];
  if (id.includes('opus') || id.includes('sonnet')) return FIVE;
  if (id.includes('deepseek-v4')) return FIVE;
  if (id.includes('gpt-5')) return FOUR;
  return THREE;
}

const ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];

export const DEFAULT_EFFORT = 'high';

/**
 * Clamp a remembered effort preference to what a given model offers.
 * Falls back to DEFAULT_EFFORT when no preference is set.
 */
export function clampEffortToModel(
  preferred: string | null,
  options: string[]
): string | null {
  if (options.length === 0) return null;
  const target = preferred ?? DEFAULT_EFFORT;
  if (options.includes(target)) return target;
  const targetRank = ORDER.indexOf(target);
  if (targetRank === -1) return options[0];
  let bestRank = -1;
  let best: string | null = null;
  for (const id of options) {
    const r = ORDER.indexOf(id);
    if (r <= targetRank && r > bestRank) {
      bestRank = r;
      best = id;
    }
  }
  return best ?? options[0];
}
