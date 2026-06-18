import { useEffect, useRef } from 'react';
import type { Session } from 'shared/types';

interface UseSessionCycleShortcutParams {
  /** Sessions of the cell's workspace (any order). */
  sessions: Session[];
  /** Currently displayed session in this cell. */
  selectedSessionId: string | undefined;
  selectSession: (sessionId: string) => void;
  /** Only the focused cell should react to the shortcut. */
  enabled: boolean;
}

/**
 * Ctrl+Tab / Ctrl+Shift+Tab cycles between the sessions (chats) of the
 * focused cell, matching the team-pill order (oldest = lead first, i.e.
 * `created_at` ASC). Ctrl+Tab moves forward, Ctrl+Shift+Tab backward; both
 * wrap around.
 *
 * Registered on `window` in the capture phase so it fires even while the
 * Lexical composer is focused — otherwise the editor's Tab handling (and the
 * browser's default focus traversal) would swallow the key. We deliberately
 * require `ctrlKey` only (no meta/alt) so it does not collide with macOS
 * text-navigation shortcuts.
 */
export function useSessionCycleShortcut({
  sessions,
  selectedSessionId,
  selectSession,
  enabled,
}: UseSessionCycleShortcutParams) {
  // Keep the latest values in a ref so the listener stays bound once.
  const stateRef = useRef({
    sessions,
    selectedSessionId,
    selectSession,
    enabled,
  });
  stateRef.current = { sessions, selectedSessionId, selectSession, enabled };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key !== 'Tab' ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const { sessions, selectedSessionId, selectSession, enabled } =
        stateRef.current;
      if (!enabled || sessions.length < 2) return;

      event.preventDefault();
      event.stopPropagation();

      // Same order as the pill row: oldest (lead) first.
      const ordered = [...sessions].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      const currentIndex = ordered.findIndex(
        (s) => s.id === selectedSessionId
      );
      const base = currentIndex === -1 ? 0 : currentIndex;
      const delta = event.shiftKey ? -1 : 1;
      const nextIndex = (base + delta + ordered.length) % ordered.length;
      const next = ordered[nextIndex];
      if (next && next.id !== selectedSessionId) {
        selectSession(next.id);
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () =>
      window.removeEventListener('keydown', handler, { capture: true });
  }, []);
}
