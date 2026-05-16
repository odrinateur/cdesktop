import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CreateModeInitialState } from '@/shared/types/createMode';
import {
  consumeCreateModeSeedState,
  getCreateModeSeedVersion,
  subscribeCreateModeSeedState,
} from './createModeSeedStore';

interface UseCreateModeSeedResult {
  providerKey: string;
  initialState: CreateModeInitialState | null;
}

/**
 * Read the synchronous create-mode seed bridge once per version and produce a
 * stable provider key + initialState. Used to re-mount CreateModeProvider when
 * a new seed lands (e.g. an action pre-populates the composer before
 * navigating).
 */
export function useCreateModeSeed(): UseCreateModeSeedResult {
  const seedVersion = useSyncExternalStore(
    subscribeCreateModeSeedState,
    getCreateModeSeedVersion,
    getCreateModeSeedVersion
  );
  const consumedRef = useRef(0);
  const [seed, setSeed] = useState<{
    version: number;
    state: CreateModeInitialState | null;
  }>({ version: 0, state: null });

  useEffect(() => {
    if (seedVersion === 0 || seedVersion === consumedRef.current) return;
    consumedRef.current = seedVersion;
    setSeed({ version: seedVersion, state: consumeCreateModeSeedState() });
  }, [seedVersion]);

  const providerKey =
    seed.version > 0
      ? `create-mode-seed-${seed.version}`
      : 'create-mode-seed-default';

  return { providerKey, initialState: seed.state };
}
