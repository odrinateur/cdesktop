import { BaseCodingAgent } from 'shared/types';
import { isVisibleAgent } from '@/shared/lib/agentOrder';

const KEY = 'cdt:lastUsedAgent';

export function readLastUsedAgent(): BaseCodingAgent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return isVisibleAgent(raw) ? (raw as BaseCodingAgent) : null;
  } catch {
    return null;
  }
}

export function writeLastUsedAgent(agent: BaseCodingAgent): void {
  try {
    localStorage.setItem(KEY, agent);
  } catch {
    /* quota / private mode — silent */
  }
}
