import {
  ExecutionProcess,
  ExecutionProcessStatus,
  PatchType,
} from 'shared/types';
import { useExecutionProcessesContext } from '@/shared/hooks/useExecutionProcessesContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamJsonPatchEntries } from '@/shared/lib/streamJsonPatchEntries';
import type {
  AddEntryType,
  ConversationTimelineSource,
  ExecutionProcessStateStore,
  PatchTypeWithKey,
  UseConversationHistoryParams,
} from '@/shared/hooks/useConversationHistory/types';

// Result type for the new UI's conversation history hook
export interface UseConversationHistoryResult {
  /** Whether the conversation only has a single coding agent turn (no follow-ups) */
  isFirstTurn: boolean;
  /** Whether background batches are still loading older history entries */
  isLoadingHistory: boolean;
}
import {
  MIN_INITIAL_ENTRIES,
  REMAINING_BATCH_SIZE,
} from '@/shared/hooks/useConversationHistory/constants';
import { HISTORIC_FETCH_CONCURRENCY, runBounded } from '../runBounded';
import {
  clearCachedEntries,
  getCachedEntries,
  setCachedEntries,
} from '../executionProcessEntriesCache';
import { getSessionSnapshot } from '../sessionSnapshotCache';

const HISTORY_PROCESS_RUN_REASONS = new Set([
  'setupscript',
  'cleanupscript',
  'archivescript',
  'codingagent',
]);

const parseSessionIdFromScopeKey = (scopeKey: string): string | undefined => {
  // Robust to extra colons in either segment — split on the LAST colon.
  const idx = scopeKey.lastIndexOf(':');
  if (idx < 0) return undefined;
  const id = scopeKey.slice(idx + 1);
  return id === 'new' || id === '' ? undefined : id;
};

export const useConversationHistory = ({
  onTimelineUpdated,
  scopeKey,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const {
    executionProcessesVisible: executionProcessesRaw,
    isLoading,
    isConnected,
  } = useExecutionProcessesContext();
  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const emittedEmptyInitialRef = useRef(false);
  const streamingProcessIdsRef = useRef<Set<string>>(new Set());
  const onTimelineUpdatedRef = useRef<
    UseConversationHistoryParams['onTimelineUpdated'] | null
  >(null);
  const previousStatusMapRef = useRef<Map<string, ExecutionProcessStatus>>(
    new Map()
  );
  const seededFromSnapshotRef = useRef(false);
  // Bumped on every scope-reset; async work tags the gen it started under
  // and drops its result if the user has switched sessions mid-fetch.
  const generationRef = useRef(0);
  const [isLoadingHistoryState, setIsLoadingHistory] = useState(false);

  // Derive whether this is the first turn (no follow-up processes exist)
  const isFirstTurn = useMemo(() => {
    const codingAgentProcessCount = executionProcessesRaw.filter(
      (ep) =>
        ep.executor_action.typ.type === 'CodingAgentInitialRequest' ||
        ep.executor_action.typ.type === 'CodingAgentFollowUpRequest'
    ).length;
    return codingAgentProcessCount <= 1;
  }, [executionProcessesRaw]);

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current;
    mutator(state);
  };

  // The hook owns transport, loading, and reconciliation.
  // It emits a source model that later derivation layers can transform further.

  const buildTimelineSource = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore
    ): ConversationTimelineSource => ({
      executionProcessState,
      liveExecutionProcesses: executionProcesses.current,
    }),
    []
  );

  useEffect(() => {
    onTimelineUpdatedRef.current = onTimelineUpdated;
  }, [onTimelineUpdated]);

  // Keep executionProcesses up to date
  useEffect(() => {
    executionProcesses.current = executionProcessesRaw.filter(
      (ep) =>
        ep.run_reason === 'setupscript' ||
        ep.run_reason === 'cleanupscript' ||
        ep.run_reason === 'archivescript' ||
        ep.run_reason === 'codingagent'
    );
  }, [executionProcessesRaw]);

  const loadEntriesForHistoricExecutionProcess = (
    executionProcess: ExecutionProcess
  ): Promise<PatchType[]> => {
    const cached = getCachedEntries(executionProcess.id);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    let url = '';
    if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
      url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
    } else {
      url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
    }

    return new Promise<PatchType[]>((resolve) => {
      const controller = streamJsonPatchEntries<PatchType>(url, {
        onFinished: (allEntries) => {
          setCachedEntries(executionProcess.id, allEntries);
          controller.close();
          resolve(allEntries);
        },
        onError: (err) => {
          console.warn(
            `Error loading entries for historic execution process ${executionProcess.id}`,
            err
          );
          controller.close();
          resolve([]);
        },
      });
    });
  };

  const patchWithKey = (
    patch: PatchType,
    executionProcessId: string,
    index: number
  ) => {
    return {
      ...patch,
      patchKey: `${executionProcessId}:${index}`,
      executionProcessId,
    };
  };

  const flattenEntries = (
    executionProcessState: ExecutionProcessStateStore
  ): PatchTypeWithKey[] => {
    return Object.values(executionProcessState)
      .filter(
        (p) =>
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentFollowUpRequest' ||
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentInitialRequest' ||
          p.executionProcess.executor_action.typ.type === 'ReviewRequest'
      )
      .sort(
        (a, b) =>
          new Date(
            a.executionProcess.created_at as unknown as string
          ).getTime() -
          new Date(b.executionProcess.created_at as unknown as string).getTime()
      )
      .flatMap((p) => p.entries);
  };

  const getActiveAgentProcesses = (): ExecutionProcess[] => {
    return (
      executionProcesses?.current.filter(
        (p) =>
          p.status === ExecutionProcessStatus.running &&
          p.run_reason !== 'devserver'
      ) ?? []
    );
  };

  const emitEntries = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      loading: boolean
    ) => {
      const timelineSource = buildTimelineSource(executionProcessState);
      let modifiedAddEntryType = addEntryType;

      const latestEntry = Object.values(executionProcessState)
        .sort(
          (a, b) =>
            new Date(
              a.executionProcess.created_at as unknown as string
            ).getTime() -
            new Date(
              b.executionProcess.created_at as unknown as string
            ).getTime()
        )
        .flatMap((processState) => processState.entries)
        .at(-1);

      if (
        latestEntry?.type === 'NORMALIZED_ENTRY' &&
        latestEntry.content.entry_type.type === 'tool_use' &&
        latestEntry.content.entry_type.tool_name === 'ExitPlanMode'
      ) {
        modifiedAddEntryType = 'plan';
      }

      onTimelineUpdatedRef.current?.(
        timelineSource,
        modifiedAddEntryType,
        loading
      );
    },
    [buildTimelineSource]
  );

  // This emits its own events as they are streamed
  const loadRunningAndEmit = useCallback(
    (executionProcess: ExecutionProcess): Promise<void> => {
      return new Promise((resolve, reject) => {
        let url = '';
        if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
          url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
        } else {
          url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
        }
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries(entries) {
            const patchesWithKey = entries.map((entry, index) =>
              patchWithKey(entry, executionProcess.id, index)
            );
            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: patchesWithKey,
              };
            });
            emitEntries(displayedExecutionProcesses.current, 'running', false);
          },
          onFinished: () => {
            emitEntries(displayedExecutionProcesses.current, 'running', false);
            controller.close();
            resolve();
          },
          onError: () => {
            controller.close();
            reject();
          },
        });
      });
    },
    [emitEntries]
  );

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  const loadRunningAndEmitWithBackoff = useCallback(
    async (executionProcess: ExecutionProcess) => {
      for (let i = 0; i < 20; i++) {
        try {
          await loadRunningAndEmit(executionProcess);
          break;
        } catch (_) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    },
    [loadRunningAndEmit]
  );

  const loadHistoricEntries = useCallback(
    async (maxEntries?: number): Promise<ExecutionProcessStateStore> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};

      if (!executionProcesses?.current) return localDisplayedExecutionProcesses;

      const pending = [...executionProcesses.current]
        .reverse()
        .filter((ep) => ep.status !== ExecutionProcessStatus.running);

      for (let i = 0; i < pending.length; i += HISTORIC_FETCH_CONCURRENCY) {
        const batch = pending.slice(i, i + HISTORIC_FETCH_CONCURRENCY);
        const batchResults = await runBounded(
          batch,
          HISTORIC_FETCH_CONCURRENCY,
          loadEntriesForHistoricExecutionProcess
        );

        batch.forEach((executionProcess, idx) => {
          const entriesWithKey = batchResults[idx].map((e, eIdx) =>
            patchWithKey(e, executionProcess.id, eIdx)
          );
          localDisplayedExecutionProcesses[executionProcess.id] = {
            executionProcess,
            entries: entriesWithKey,
          };
        });

        if (
          maxEntries != null &&
          flattenEntries(localDisplayedExecutionProcesses).length > maxEntries
        ) {
          break;
        }
      }

      return localDisplayedExecutionProcesses;
    },
    [executionProcesses]
  );

  const loadRemainingEntriesInBatches = useCallback(
    async (batchSize: number): Promise<boolean> => {
      if (!executionProcesses?.current) return false;

      const current = displayedExecutionProcesses.current;
      const pending = [...executionProcesses.current]
        .reverse()
        .filter(
          (ep) =>
            !current[ep.id] && ep.status !== ExecutionProcessStatus.running
        );

      let anyUpdated = false;
      for (let i = 0; i < pending.length; i += HISTORIC_FETCH_CONCURRENCY) {
        const batch = pending.slice(i, i + HISTORIC_FETCH_CONCURRENCY);
        const batchResults = await runBounded(
          batch,
          HISTORIC_FETCH_CONCURRENCY,
          loadEntriesForHistoricExecutionProcess
        );

        mergeIntoDisplayed((state) => {
          batch.forEach((executionProcess, idx) => {
            const entriesWithKey = batchResults[idx].map((e, eIdx) =>
              patchWithKey(e, executionProcess.id, eIdx)
            );
            state[executionProcess.id] = {
              executionProcess,
              entries: entriesWithKey,
            };
          });
        });
        anyUpdated = true;

        if (
          flattenEntries(displayedExecutionProcesses.current).length > batchSize
        ) {
          break;
        }
      }
      return anyUpdated;
    },
    [executionProcesses]
  );

  const ensureProcessVisible = useCallback((p: ExecutionProcess) => {
    mergeIntoDisplayed((state) => {
      if (!state[p.id]) {
        state[p.id] = {
          executionProcess: {
            id: p.id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            executor_action: p.executor_action,
          },
          entries: [],
        };
      }
    });
  }, []);

  const idListKey = useMemo(
    () => executionProcessesRaw?.map((p) => p.id).join(','),
    [executionProcessesRaw]
  );

  const idStatusKey = useMemo(
    () => executionProcessesRaw?.map((p) => `${p.id}:${p.status}`).join(','),
    [executionProcessesRaw]
  );

  // Clean up entries for processes that have been removed (e.g., after reset)
  useEffect(() => {
    if (isLoading || !isConnected) return;
    const visibleProcessIds = new Set(executionProcessesRaw.map((p) => p.id));
    const displayedIds = Object.keys(displayedExecutionProcesses.current);
    let changed = false;

    for (const id of displayedIds) {
      if (!visibleProcessIds.has(id)) {
        delete displayedExecutionProcesses.current[id];
        changed = true;
      }
    }

    if (changed) {
      emitEntries(displayedExecutionProcesses.current, 'historic', false);
    }
  }, [idListKey, executionProcessesRaw, emitEntries, isLoading, isConnected]);

  useEffect(() => {
    displayedExecutionProcesses.current = {};
    loadedInitialEntries.current = false;
    emittedEmptyInitialRef.current = false;
    streamingProcessIdsRef.current.clear();
    previousStatusMapRef.current.clear();
    seededFromSnapshotRef.current = false;
    generationRef.current += 1;

    // Layer 2 cache consult: if we have a snapshot for this session, seed
    // executionProcesses.current synchronously so the load effect below can
    // start cache-hitting per-process entries before the session-list WS
    // arrives. Also seed previousStatusMapRef so the running→finished
    // refetch effect fires correctly when the WS reconciles.
    const sessionId = parseSessionIdFromScopeKey(scopeKey);
    const snapshot = sessionId ? getSessionSnapshot(sessionId) : undefined;
    if (snapshot && snapshot.length > 0) {
      const filtered = snapshot.filter(
        (ep) => !ep.dropped && HISTORY_PROCESS_RUN_REASONS.has(ep.run_reason)
      );
      if (filtered.length > 0) {
        executionProcesses.current = filtered;
        for (const p of filtered) {
          previousStatusMapRef.current.set(p.id, p.status);
        }
        seededFromSnapshotRef.current = true;

        // Synchronously hydrate displayed entries from Layer 1 cache for
        // every process whose entries we already have, regardless of
        // status. Running processes whose entries the follower captured
        // paint synchronously alongside the finished ones — no
        // half-rendered ghost where the running turn would otherwise be
        // missing until raw WS arrives.
        let allHydrated = true;
        for (const p of filtered) {
          const cached = getCachedEntries(p.id);
          if (cached !== undefined) {
            displayedExecutionProcesses.current[p.id] = {
              executionProcess: p,
              entries: cached.map((e, idx) => patchWithKey(e, p.id, idx)),
            };
          } else {
            allHydrated = false;
          }
        }

        if (allHydrated) {
          // Full cache hit: bypass the load effect entirely. Setting
          // loadedInitialEntries.current=true short-circuits its async
          // path; setIsLoadingHistory(false) keeps the loading flag
          // from flipping true→false in a later commit (skeleton flash).
          loadedInitialEntries.current = true;
          setIsLoadingHistory(false);
          emitEntries(displayedExecutionProcesses.current, 'initial', false);
          return;
        }
      }
    }

    // Must stay declared before the load effect below — the load effect may flip
    // this false in the empty-processes branch, and React runs effects in
    // declaration order within a commit.
    setIsLoadingHistory(true);
    emitEntries(displayedExecutionProcesses.current, 'initial', true);
  }, [scopeKey, emitEntries]);

  useEffect(() => {
    let cancelled = false;
    const gen = generationRef.current;
    (async () => {
      if (loadedInitialEntries.current) return;

      // Allow proceeding without a fresh WS payload if we seeded from the
      // snapshot cache — otherwise we'd block the instant-render path on
      // the WS handshake we're trying to skip.
      if (isLoading && !seededFromSnapshotRef.current) return;

      if (executionProcesses.current.length === 0) {
        if (emittedEmptyInitialRef.current) return;
        emittedEmptyInitialRef.current = true;
        setIsLoadingHistory(false);
        emitEntries(displayedExecutionProcesses.current, 'initial', false);
        return;
      }

      emittedEmptyInitialRef.current = false;

      const allInitialEntries = await loadHistoricEntries(MIN_INITIAL_ENTRIES);
      if (cancelled || gen !== generationRef.current) return;
      loadedInitialEntries.current = true;
      mergeIntoDisplayed((state) => {
        Object.assign(state, allInitialEntries);
      });
      emitEntries(displayedExecutionProcesses.current, 'initial', false);

      while (
        !cancelled &&
        gen === generationRef.current &&
        (await loadRemainingEntriesInBatches(REMAINING_BATCH_SIZE))
      ) {
        if (cancelled || gen !== generationRef.current) return;
        emitEntries(displayedExecutionProcesses.current, 'historic', false);
      }
      if (!cancelled && gen === generationRef.current)
        setIsLoadingHistory(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    scopeKey,
    idListKey,
    isLoading,
    loadHistoricEntries,
    loadRemainingEntriesInBatches,
    emitEntries,
  ]); // include idListKey so new processes trigger reload

  useEffect(() => {
    const activeProcesses = getActiveAgentProcesses();
    if (activeProcesses.length === 0) return;

    for (const activeProcess of activeProcesses) {
      if (!displayedExecutionProcesses.current[activeProcess.id]) {
        const runningOrInitial =
          Object.keys(displayedExecutionProcesses.current).length > 1
            ? 'running'
            : 'initial';
        ensureProcessVisible(activeProcess);
        emitEntries(
          displayedExecutionProcesses.current,
          runningOrInitial,
          false
        );
      }

      if (
        activeProcess.status === ExecutionProcessStatus.running &&
        !streamingProcessIdsRef.current.has(activeProcess.id)
      ) {
        streamingProcessIdsRef.current.add(activeProcess.id);
        loadRunningAndEmitWithBackoff(activeProcess).finally(() => {
          streamingProcessIdsRef.current.delete(activeProcess.id);
        });
      }
    }
  }, [
    scopeKey,
    idStatusKey,
    emitEntries,
    ensureProcessVisible,
    loadRunningAndEmitWithBackoff,
  ]);

  // Reconciliation pass: once initial entries are loaded, the load effect
  // above is gated by `loadedInitialEntries.current` and won't pick up new
  // processes that appear later (e.g. when raw WS arrives after a snapshot
  // seed and reveals processes the snapshot didn't have). Drive
  // loadRemainingEntriesInBatches directly here.
  useEffect(() => {
    if (!loadedInitialEntries.current) return;
    if (isLoading) return;
    let cancelled = false;
    const gen = generationRef.current;
    (async () => {
      let touched = false;
      while (
        !cancelled &&
        gen === generationRef.current &&
        (await loadRemainingEntriesInBatches(REMAINING_BATCH_SIZE))
      ) {
        if (cancelled || gen !== generationRef.current) return;
        touched = true;
        emitEntries(displayedExecutionProcesses.current, 'historic', false);
      }
      if (touched && !cancelled && gen === generationRef.current) {
        setIsLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idListKey, isLoading, loadRemainingEntriesInBatches, emitEntries]);

  useEffect(() => {
    if (!executionProcessesRaw) return;

    const processesToReload: ExecutionProcess[] = [];

    for (const process of executionProcessesRaw) {
      const previousStatus = previousStatusMapRef.current.get(process.id);
      const currentStatus = process.status;

      if (
        previousStatus === ExecutionProcessStatus.running &&
        currentStatus !== ExecutionProcessStatus.running &&
        displayedExecutionProcesses.current[process.id]
      ) {
        processesToReload.push(process);
      }

      previousStatusMapRef.current.set(process.id, currentStatus);
    }

    if (processesToReload.length === 0) return;

    (async () => {
      let anyUpdated = false;

      for (const process of processesToReload) {
        // Invalidate any incremental cache entry the follower may have
        // written for this still-running process so we re-fetch the
        // canonical post-finished payload from the server.
        clearCachedEntries(process.id);
        const entries = await loadEntriesForHistoricExecutionProcess(process);
        if (entries.length === 0) continue;

        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, process.id, idx)
        );

        mergeIntoDisplayed((state) => {
          state[process.id] = {
            executionProcess: process,
            entries: entriesWithKey,
          };
        });
        anyUpdated = true;
      }

      if (anyUpdated) {
        emitEntries(displayedExecutionProcesses.current, 'running', false);
      }
    })();
  }, [idStatusKey, executionProcessesRaw, emitEntries]);

  // If an execution process is removed, remove it from the state.
  //
  // Guarded by isLoading because raw is an empty []-during-WS-handshake
  // until the session-list WS delivers its first payload. Without the
  // guard, this effect would delete every entry the snapshot fast-path
  // synchronously hydrated into `displayedExecutionProcesses` during the
  // scope-reset commit (raw is empty AND `idListKey` changed). The
  // sibling cleanup at the top of the file is similarly guarded.
  useEffect(() => {
    if (isLoading) return;
    if (!executionProcessesRaw) return;

    const removedProcessIds = Object.keys(
      displayedExecutionProcesses.current
    ).filter((id) => !executionProcessesRaw.some((p) => p.id === id));

    if (removedProcessIds.length > 0) {
      mergeIntoDisplayed((state) => {
        removedProcessIds.forEach((id) => {
          delete state[id];
        });
      });
    }
  }, [scopeKey, idListKey, executionProcessesRaw, isLoading]);

  return { isFirstTurn, isLoadingHistory: isLoadingHistoryState };
};
