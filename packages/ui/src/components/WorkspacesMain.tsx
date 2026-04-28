import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon, SpinnerIcon } from '@phosphor-icons/react';
import { cn } from '../lib/cn';

export interface WorkspacesMainWorkspace {
  id: string;
}

interface WorkspacesMainProps {
  workspaceWithSession: WorkspacesMainWorkspace | undefined;
  isLoading: boolean;
  showLoadingOverlay?: boolean;
  containerRef: RefObject<HTMLElement>;
  conversationContent?: ReactNode;
  chatBoxContent: ReactNode;
  contextBarContent?: ReactNode;
  isAtBottom?: boolean;
  isAtTop?: boolean;
  onAtBottomChange?: (atBottom: boolean) => void;
  onScrollToBottom?: (behavior?: 'auto' | 'smooth') => void;
  isMobile?: boolean;
}

export function WorkspacesMain({
  workspaceWithSession,
  isLoading,
  showLoadingOverlay = false,
  containerRef,
  conversationContent,
  chatBoxContent,
  contextBarContent,
  isAtBottom = true,
  isAtTop = true,
  onScrollToBottom,
  isMobile,
}: WorkspacesMainProps) {
  const { t } = useTranslation(['tasks', 'common']);

  // Always render the main structure to prevent chat box flash during workspace transitions
  return (
    <main
      ref={containerRef}
      className={cn(
        'relative flex flex-1 flex-col',
        isMobile ? 'min-h-0' : 'h-full'
      )}
    >
      {/* Conversation content - conditional based on loading/workspace state */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <SpinnerIcon className="size-6 animate-spin text-low" />
        </div>
      ) : !workspaceWithSession ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-low">{t('common:workspaces.selectToStart')}</p>
        </div>
      ) : (
        <>
          {showLoadingOverlay && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary">
              <SpinnerIcon className="size-6 animate-spin text-low" />
            </div>
          )}
          {conversationContent}
          {/* Top fade — mirrors the bottom gradient above the chatbox. */}
          {!isAtTop && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#fdfdfc] to-transparent dark:from-[#0a0a0a]"
            />
          )}
        </>
      )}
      {/* Scroll to bottom button */}
      {workspaceWithSession && !isAtBottom && (
        <div className="flex justify-center pointer-events-none">
          <div className="w-chat max-w-full relative">
            <button
              type="button"
              onClick={() => onScrollToBottom?.('auto')}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 pointer-events-auto flex items-center justify-center size-6 rounded-md bg-secondary/80 backdrop-blur-sm border border-secondary text-low hover:text-normal hover:bg-secondary shadow-md transition-all"
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
            >
              <CaretDownIcon className="size-icon-2xs" weight="bold" />
            </button>
          </div>
        </div>
      )}
      {/* Chat box - always rendered to prevent flash during workspace switch */}
      <div
        className="relative flex justify-center @container pb-[12px]"
        data-chatbox-container="true"
      >
        {workspaceWithSession && !isAtBottom && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-full h-12 bg-gradient-to-t from-[#fdfdfc] to-transparent dark:from-[#0a0a0a]"
          />
        )}
        <div className="w-chat max-w-full px-double">{chatBoxContent}</div>
      </div>
      {/* Context Bar - floating toolbar */}
      {workspaceWithSession ? contextBarContent : null}
    </main>
  );
}
