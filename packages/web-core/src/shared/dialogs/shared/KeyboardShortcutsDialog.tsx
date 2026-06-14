import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { XIcon } from '@phosphor-icons/react';
import { create, useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/shared/lib/modals';

import { cn } from '@/shared/lib/utils';
import { ShortcutsList } from '@/shared/keyboard/ShortcutsList';

const KeyboardShortcutsDialogImpl = create<NoProps>(() => {
  const { t } = useTranslation('common');
  const modal = useModal();

  const handleClose = useCallback(() => {
    modal.hide();
    modal.resolve();
    modal.remove();
  }, [modal]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return createPortal(
    <>
      {/* Overlay */}
      <div
        data-tauri-drag-region
        className="fixed inset-0 z-[9998] bg-black/50 animate-in fade-in-0 duration-200"
        onClick={handleClose}
      />
      {/* Dialog wrapper - handles positioning */}
      <div className="fixed z-[9999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {/* Dialog content - handles animation */}
        <div
          className={cn(
            'w-[700px] max-h-[80vh]',
            'bg-panel/95 backdrop-blur-sm rounded-sm border border-border/50 shadow-lg',
            'animate-in fade-in-0 slide-in-from-bottom-4 duration-200',
            'flex flex-col overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-high">
              {t('shortcuts.title')}
            </h2>
            <button
              onClick={handleClose}
              className="p-1 rounded-sm hover:bg-secondary text-low hover:text-normal"
            >
              <XIcon className="size-icon-sm" weight="bold" />
            </button>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <ShortcutsList />
            {/* Footer hint */}
            <div className="mt-4 pt-4 border-t border-border text-center">
              <p className="text-xs text-low">
                {t('shortcuts.sequentialHint')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
});

export const KeyboardShortcutsDialog = defineModal<void, void>(
  KeyboardShortcutsDialogImpl
);
