/**
 * One status-aware pill in the team row. Subscribes to its session's
 * execution-process stream so the dot reflects live `running` / `errored`
 * state. Visual chrome mirrors the multi-session branch of
 * `@vibe/ui/components/TeamPillRow` so the pure-presentational component
 * can shed its loop.
 */

import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vibe/ui/components/Dropdown';
import { useExecutionProcesses } from '@/shared/hooks/useExecutionProcesses';
import { getSessionSnapshot } from '@/features/workspace-chat/model/sessionSnapshotCache';
import { cn } from '@vibe/ui/lib/cn';
import type { ExecutionProcess } from 'shared/types';

const MAX_LABEL_CHARS = 16;

type Status = 'running' | 'idle' | 'errored' | 'awaiting_approval';

export interface TeamPillItemProps {
  sessionId: string;
  /** Pill label fallback when `isLead` is false (session.name). */
  name: string | null;
  isLead: boolean;
  isActive: boolean;
  /** Literal label for the lead pill ("main" in English). */
  leadLabel: string;
  /** Localized menu labels. */
  renameLabel: string;
  deleteLabel: string;
  onSelect: () => void;
  onRequestRename?: () => void;
  /** Omit to hide the Delete item (e.g. for the lead pill). */
  onRequestDelete?: () => void;
}

export function TeamPillItem({
  sessionId,
  name,
  isLead,
  isActive,
  leadLabel,
  renameLabel,
  deleteLabel,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: TeamPillItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { executionProcesses, isLoading } = useExecutionProcesses(sessionId);

  // Session-switch remounts this component (EntriesProvider is keyed by
  // sessionId), which closes the per-session WS and reopens it. Reconnect
  // takes ~1s during which `isLoading` is true and `executionProcesses`
  // is empty, flashing the dot gray for a still-running session. Fall back
  // to `sessionSnapshotCache` (populated by ExecutionProcessesProvider
  // whenever a session was viewed) until the WS catches up.
  const effective: ExecutionProcess[] =
    !isLoading || executionProcesses.length > 0
      ? executionProcesses
      : (getSessionSnapshot(sessionId) ?? []);

  const status: Status = useMemo(() => {
    const isRunning = effective.some(
      (p) =>
        (p.run_reason === 'codingagent' ||
          p.run_reason === 'cleanupscript' ||
          p.run_reason === 'archivescript') &&
        p.status === 'running' &&
        !p.dropped
    );
    if (isRunning) return 'running';
    const latest = effective
      .filter(
        (p) =>
          p.run_reason === 'codingagent' ||
          p.run_reason === 'cleanupscript' ||
          p.run_reason === 'archivescript'
      )
      .at(-1);
    if (!latest) return 'idle';
    if (latest.status === 'failed' || latest.status === 'killed')
      return 'errored';
    return 'idle';
  }, [effective]);

  const label = isLead ? leadLabel : truncate(name ?? '', MAX_LABEL_CHARS);
  const hasMenu = !!onRequestRename || !!onRequestDelete;

  const pill = (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={
        hasMenu
          ? (e: MouseEvent) => {
              e.preventDefault();
              setMenuOpen(true);
            }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-half rounded-sm px-base py-half text-sm transition-colors',
        isActive
          ? 'bg-panel font-semibold text-high'
          : 'bg-secondary text-low hover:bg-panel hover:text-high'
      )}
      title={name ?? label}
    >
      <StatusDot status={status} />
      <span className="max-w-[160px] truncate">{label}</span>
    </button>
  );

  if (!hasMenu) return pill;

  // The DropdownMenuTrigger is a hidden, non-interactive anchor that
  // overlays the pill purely for positioning the menu. The pill itself
  // owns click (select) + right-click (open menu via state) — left click
  // must NOT open the menu.
  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <span className="relative inline-block">
        {pill}
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none absolute inset-0"
          />
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {onRequestRename && (
          <DropdownMenuItem onSelect={() => onRequestRename()}>
            {renameLabel}
          </DropdownMenuItem>
        )}
        {onRequestDelete && (
          <DropdownMenuItem
            onSelect={() => onRequestDelete()}
            className="text-error focus:text-error"
          >
            {deleteLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusDot({ status }: { status: Status }) {
  const color =
    status === 'running'
      ? 'bg-brand animate-pulse'
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
