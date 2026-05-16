import { CheckIcon } from '@phosphor-icons/react';
import type { BaseCodingAgent } from 'shared/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vibe/ui/components/Dropdown';
import { AgentIcon, getAgentName } from './AgentIcon';

const agentChipClassName =
  'inline-flex items-center gap-half rounded-md bg-secondary px-base py-half ' +
  'min-h-7 text-sm text-normal hover:bg-panel ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand';

interface AgentChipProps {
  selected: BaseCodingAgent | null;
  options: BaseCodingAgent[];
  onChange: (agent: BaseCodingAgent) => void;
  disabled?: boolean;
}

export function AgentChip({
  selected,
  options,
  onChange,
  disabled,
}: AgentChipProps) {
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={agentChipClassName}
        >
          <AgentIcon agent={selected} className="h-[0.9rem] w-[0.9rem]" />
          <span className="max-w-[140px] truncate">
            {selected ? getAgentName(selected) : 'Agent'}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((agent) => (
          <DropdownMenuItem
            key={agent}
            badge={selected === agent ? <CheckIcon weight="bold" /> : undefined}
            onSelect={() => onChange(agent)}
          >
            <span className="flex items-center gap-2">
              <AgentIcon agent={agent} className="h-[0.9rem] w-[0.9rem]" />
              <span>{getAgentName(agent)}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
