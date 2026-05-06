// streamJsonPatchObject.ts — vanilla WebSocket JSON-patch helper for
// object-shaped payloads (e.g. { execution_processes: Record<id, EP> }).
//
// Sibling of streamJsonPatchEntries.ts, which handles array-shaped
// `{ entries: E[] }` payloads. They share a transport but differ in
// payload shape and termination semantics.
//
// Mirrors the lifecycle of useJsonPatchWsStream (open / Ready / JsonPatch
// / finished, with exponential-backoff reconnect on unexpected close)
// without React, so non-React subscribers (e.g. liveSessionFollower)
// can use it.
import { produce } from 'immer';
import type { Operation } from 'rfc6902';
import { applyUpsertPatch } from '@/shared/lib/jsonPatch';
import { openLocalApiWebSocket } from '@/shared/lib/localApiTransport';

export interface ObjectStreamOptions<T extends object> {
  /** Initial container state (must NOT be mutated by callers) */
  initial: () => T;
  /** Called after each successful patch application */
  onPatch?: (data: T) => void;
  /** Called once when the server's initial snapshot is fully delivered */
  onReady?: (data: T) => void;
  /** Called when the server signals `finished:true` (terminal, no reconnect) */
  onFinished?: (data: T) => void;
  /** Called on transient transport errors */
  onError?: (err: unknown) => void;
}

export interface ObjectStreamController<T extends object> {
  /** Current snapshot (immutable; structurally shared via immer) */
  getSnapshot(): T;
  /** Best-effort connection state */
  isConnected(): boolean;
  /** Close the stream permanently (no reconnect) */
  close(): void;
}

const MAX_BACKOFF_MS = 8000;

export function streamJsonPatchObject<T extends object>(
  url: string,
  opts: ObjectStreamOptions<T>
): ObjectStreamController<T> {
  let snapshot: T = opts.initial();
  let connected = false;
  let closed = false;
  let finished = false;
  let ws: WebSocket | null = null;
  let retryAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = () => {
    if (closed || finished || retryTimer) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, retryAttempts));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);

      if ('JsonPatch' in msg) {
        const patches: Operation[] = msg.JsonPatch;
        if (patches.length === 0) return;
        snapshot = produce(snapshot, (draft) => {
          applyUpsertPatch(draft as object, patches);
        });
        opts.onPatch?.(snapshot);
        return;
      }

      if ('Ready' in msg) {
        opts.onReady?.(snapshot);
        return;
      }

      if ('finished' in msg) {
        finished = true;
        opts.onFinished?.(snapshot);
        ws?.close(1000, 'finished');
      }
    } catch (err) {
      opts.onError?.(err);
    }
  };

  const connect = async () => {
    if (closed || finished) return;
    try {
      const opened = await openLocalApiWebSocket(url);
      if (closed || finished) {
        opened.close();
        return;
      }
      ws = opened;

      ws.onopen = () => {
        connected = true;
        retryAttempts = 0;
      };
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        // onclose handles retry; setting an error eagerly would race with
        // already-applied patches.
      };
      ws.onclose = (evt) => {
        connected = false;
        ws = null;
        if (closed || finished) return;
        if (evt?.code === 1000 && evt?.wasClean) return;
        retryAttempts += 1;
        scheduleReconnect();
      };
    } catch (err) {
      if (closed || finished) return;
      opts.onError?.(err);
      retryAttempts += 1;
      scheduleReconnect();
    }
  };

  void connect();

  return {
    getSnapshot: () => snapshot,
    isConnected: () => connected,
    close: () => {
      closed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      connected = false;
    },
  };
}
