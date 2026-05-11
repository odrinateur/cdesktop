import { BaseCodingAgent } from 'shared/types';

export const AGENT_PRIORITY: BaseCodingAgent[] = [
  BaseCodingAgent.CLAUDE_CODE,
  BaseCodingAgent.CODEX,
  BaseCodingAgent.OPENCODE,
  BaseCodingAgent.GEMINI,
];

const PRIORITY_SET = new Set<string>(AGENT_PRIORITY);

export function isVisibleAgent(agent: string): boolean {
  return PRIORITY_SET.has(agent);
}

export function filterAndSortAgents<T extends string>(agents: T[]): T[] {
  const ordered: T[] = [];
  for (const priority of AGENT_PRIORITY) {
    if (agents.includes(priority as T)) ordered.push(priority as T);
  }
  return ordered;
}
