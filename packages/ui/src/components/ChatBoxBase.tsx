import { type ReactNode } from 'react';
import { ArrowBendDownLeftIcon, ImageIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { Toolbar } from './Toolbar';

export enum VisualVariant {
  NORMAL = 'NORMAL',
  FEEDBACK = 'FEEDBACK',
  EDIT = 'EDIT',
  PLAN = 'PLAN',
}

export interface DropzoneProps {
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  isDragActive: boolean;
}

interface ChatBoxBaseProps {
  // Editor node (provided by frontend)
  editor: ReactNode;

  // Error display
  error?: string | null;

  // Header content (right side - session/executor dropdown)
  headerRight?: ReactNode;

  // Header content (left side - stats)
  headerLeft?: ReactNode;

  // Chip row rendered above the editor, below the header. Used by the
  // new-session composer for its folder/branch/worktree/+ chip row.
  chipRow?: ReactNode;

  // Footer left content (additional toolbar items like attach button)
  footerLeft?: ReactNode;

  // Footer right content (action buttons)
  footerRight: ReactNode;

  // Model selector node (rendered with footer controls)
  modelSelector?: ReactNode;

  // Banner content (queued message indicator, feedback mode indicator)
  banner?: ReactNode;

  // visualVariant
  visualVariant: VisualVariant;

  // Whether the workspace is running (shows animated border)
  isRunning?: boolean;

  // Dropzone props for drag-and-drop image uploads
  dropzone?: DropzoneProps;
}

/**
 * Base chat box layout component.
 *
 * Layout is "unboxed": the outer wrapper has no border/background. Only the
 * textarea sits in a rounded, bordered card; the optional chip row, header,
 * and footer float unbordered above/below it. Visual-variant tinting (brand
 * border/bg for FEEDBACK/EDIT/PLAN) applies to the textarea card.
 */
export function ChatBoxBase({
  editor,
  error,
  headerRight,
  headerLeft,
  chipRow,
  footerLeft,
  footerRight,
  modelSelector,
  banner,
  visualVariant,
  isRunning,
  dropzone,
}: ChatBoxBaseProps) {
  const { t } = useTranslation(['common', 'tasks']);

  const isDragActive = dropzone?.isDragActive ?? false;
  const hasHeaderContent = Boolean(headerLeft) || Boolean(headerRight);
  const isAccent =
    visualVariant === VisualVariant.FEEDBACK ||
    visualVariant === VisualVariant.EDIT ||
    visualVariant === VisualVariant.PLAN;

  return (
    <div
      {...(dropzone?.getRootProps() ?? {})}
      className="relative flex w-chat max-w-full flex-col gap-half"
    >
      {dropzone && <input {...dropzone.getInputProps()} />}

      {isDragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-md border-2 border-dashed border-brand bg-primary/80 backdrop-blur-sm pointer-events-none animate-in fade-in-0 duration-150">
          <div className="text-center">
            <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-brand" />
            </div>
            <p className="text-sm font-medium text-high">
              {t('tasks:dropzone.dropImagesHere')}
            </p>
            <p className="text-xs text-low mt-0.5">
              {t('tasks:dropzone.supportedFormats')}
            </p>
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="rounded-md bg-error/10 px-double py-base">
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      {/* Banner content (queued indicator, feedback mode, etc.) */}
      {banner}

      {/* Header - Stats and selector. Hidden when empty to avoid an empty row. */}
      {visualVariant === VisualVariant.NORMAL && hasHeaderContent && (
        <div className="flex items-center gap-base py-half">
          <div className="flex flex-1 items-center gap-base text-sm min-w-0 overflow-hidden">
            {headerLeft}
          </div>
          <Toolbar className="gap-[9px]">{headerRight}</Toolbar>
        </div>
      )}

      {/* Chip row (new-session composer: folder / branch / worktree / +) */}
      {chipRow && (
        <div className="flex flex-wrap items-center gap-half py-half">
          {chipRow}
        </div>
      )}

      {/* Textarea — the only bordered element */}
      <div
        className={cn(
          'relative rounded-md border bg-secondary pl-base pr-double py-base',
          isAccent ? 'border-brand bg-brand/10' : 'border-border',
          isRunning && 'chat-box-running'
        )}
      >
        {editor}
        <ArrowBendDownLeftIcon
          weight="bold"
          className="pointer-events-none absolute right-base bottom-base size-icon-xs text-low"
          aria-hidden="true"
        />
      </div>

      {/* Footer — floats unbordered below the textarea. Toolbar triggers
          (config, model selector, permissions, etc.) render as ghost
          buttons: no bg/border. Send button (in footerRight) is outside
          the Toolbar so its PrimaryButton styling is untouched. */}
      <div className="flex items-end justify-between gap-base py-half">
        <Toolbar
          className={cn(
            'flex-1 min-w-0 flex-wrap !gap-half',
            '[&_button]:!bg-transparent [&_button]:!border-transparent',
            '[&_button:hover]:!bg-panel'
          )}
        >
          {modelSelector}
          {footerLeft}
        </Toolbar>
        <div className="flex shrink-0 gap-base">{footerRight}</div>
      </div>
    </div>
  );
}
