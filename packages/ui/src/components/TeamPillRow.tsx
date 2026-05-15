/**
 * Team pill row — renders above the composer input.
 *
 * Layouts:
 * - Single-session workspace: `[+ teammate]` text button only.
 * - Multi-session: pills sorted by `created_at` ASC (oldest = lead), each
 *   click switches the transcript to that session. A compact `[+]` icon
 *   button at the end opens the spawn modal.
 *
 * Lead pill label is the literal "main" (i18n: `team.main`); teammate
 * pill labels use the session's `name` truncated to MAX_LABEL_CHARS.
 *
 * Presentational only. Container fetches sessions and wires callbacks.
 */

import { PlusIcon } from '@phosphor-icons/react';
import type { MouseEvent } from 'react';
import { cn } from '../lib/cn';

export interface TeamPillSession {
  id: string;
  name: string | null;
  /** Lead-pill detection is done by the caller; we just render. */
  isLead: boolean;
  /** Backend status label, mapped to a coloured dot. */
  status: 'running' | 'idle' | 'errored' | 'awaiting_approval';
}

const MAX_LABEL_CHARS = 16;

export interface TeamPillRowProps {
  sessions: TeamPillSession[];
  /** Currently-displayed session in the composer. */
  currentSessionId: string | undefined;
  onSelectSession: (sessionId: string) => void;
  onSpawnTeammate: () => void;
  /** Right-click context menu — Rename. Optional. */
  onRequestRename?: (sessionId: string) => void;
  /** Literal label for the lead pill ("main" in English). */
  leadLabel: string;
  /** Text on the lone "+ teammate" button (single-session mode). */
  addTeammateLabel: string;
  /** ARIA label for the compact `[+]` icon (multi-session mode). */
  addTeammateAriaLabel: string;
}

export function TeamPillRow({
  sessions,
  currentSessionId,
  onSelectSession,
  onSpawnTeammate,
  onRequestRename,
  leadLabel,
  addTeammateLabel,
  addTeammateAriaLabel,
}: TeamPillRowProps) {
  // Single-session workspace: render only the "+ teammate" text button.
  // Adding the first teammate promotes the row to the multi-pill layout
  // on the next render.
  if (sessions.length <= 1) {
    return (
      <button
        type="button"
        onClick={onSpawnTeammate}
        className={cn(
          'inline-flex items-center gap-1 rounded-full',
          'border border-border bg-secondary/40 px-3 py-0.5 text-xs',
          'text-low hover:bg-panel hover:text-high transition-colors'
        )}
      >
        <PlusIcon className="size-icon-xs" weight="bold" />
        {addTeammateLabel}
      </button>
    );
  }

  return (
    <>
      {sessions.map((s) => {
        const isActive = s.id === currentSessionId;
        const label = s.isLead
          ? leadLabel
          : truncate(s.name ?? '', MAX_LABEL_CHARS);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelectSession(s.id)}
            onContextMenu={
              onRequestRename
                ? (e: MouseEvent) => {
                    e.preventDefault();
                    onRequestRename(s.id);
                  }
                : undefined
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs transition-colors',
              isActive
                ? 'bg-brand/15 text-high border border-brand/40'
                : 'bg-secondary/40 text-low border border-border hover:bg-panel hover:text-high'
            )}
            title={s.name ?? label}
          >
            <StatusDot status={s.status} />
            <span className="max-w-[160px] truncate">{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onSpawnTeammate}
        aria-label={addTeammateAriaLabel}
        title={addTeammateAriaLabel}
        className={cn(
          'inline-flex items-center justify-center rounded-full',
          'border border-border bg-secondary/40 size-6',
          'text-low hover:bg-panel hover:text-high transition-colors'
        )}
      >
        <PlusIcon className="size-icon-xs" weight="bold" />
      </button>
    </>
  );
}

function StatusDot({ status }: { status: TeamPillSession['status'] }) {
  const color =
    status === 'running'
      ? 'bg-brand'
      : status === 'errored'
        ? 'bg-error'
        : status === 'awaiting_approval'
          ? 'bg-warning'
          : 'bg-low/50';
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-1.5 shrink-0 rounded-full', color)}
    />
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
