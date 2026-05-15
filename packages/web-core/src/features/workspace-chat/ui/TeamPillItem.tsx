/**
 * One status-aware pill in the team row. Subscribes to its session's
 * execution-process stream so the dot reflects live `running` / `errored`
 * state. Visual chrome mirrors the multi-session branch of
 * `@vibe/ui/components/TeamPillRow` so the pure-presentational component
 * can shed its loop.
 */

import { useMemo } from 'react';
import type { MouseEvent } from 'react';
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
  onSelect: () => void;
  onContextMenu?: () => void;
}

export function TeamPillItem({
  sessionId,
  name,
  isLead,
  isActive,
  leadLabel,
  onSelect,
  onContextMenu,
}: TeamPillItemProps) {
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

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={
        onContextMenu
          ? (e: MouseEvent) => {
              e.preventDefault();
              onContextMenu();
            }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs transition-colors',
        isActive
          ? 'bg-brand/15 text-high border border-brand/40'
          : 'bg-secondary/40 text-low border border-border hover:bg-panel hover:text-high'
      )}
      title={name ?? label}
    >
      <StatusDot status={status} />
      <span className="max-w-[160px] truncate">{label}</span>
    </button>
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
