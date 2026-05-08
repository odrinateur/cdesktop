import type { ReactNode } from 'react';
import { ChatDotsIcon } from '@phosphor-icons/react';
import { cn } from '../lib/cn';

export interface ChatThinkingMessageRenderProps {
  content: string;
  workspaceId?: string;
  className?: string;
}

interface ChatThinkingMessageProps {
  content: string;
  className?: string;
  workspaceId?: string;
  renderMarkdown: (props: ChatThinkingMessageRenderProps) => ReactNode;
  onIconClick?: () => void;
}

export function ChatThinkingMessage({
  content,
  className,
  workspaceId,
  renderMarkdown,
  onIconClick,
}: ChatThinkingMessageProps) {
  return (
    <div
      className={cn('flex items-start gap-base text-sm text-low', className)}
    >
      {onIconClick ? (
        <button
          type="button"
          onClick={onIconClick}
          className="shrink-0 pt-0.5 cursor-pointer"
          aria-label="Inspect thinking entry"
        >
          <ChatDotsIcon className="size-icon-base" />
        </button>
      ) : (
        <ChatDotsIcon className="shrink-0 size-icon-base pt-0.5" />
      )}
      {renderMarkdown({
        content,
        workspaceId: workspaceId,
        className: 'text-sm',
      })}
    </div>
  );
}
