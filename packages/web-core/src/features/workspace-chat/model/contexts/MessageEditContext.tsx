import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';
import { useEntries } from './EntriesContext';

interface EditState {
  entryKey: string;
  processId: string;
  originalMessage: string;
}

/**
 * Request to populate the chat input with some text. The monotonically
 * increasing `seq` lets the chat box re-apply the same text more than once
 * (e.g. resetting two messages with identical content).
 */
interface InputRestoreRequest {
  text: string;
  seq: number;
}

interface MessageEditContextType {
  activeEdit: EditState | null;
  startEdit: (
    entryKey: string,
    processId: string,
    originalMessage: string
  ) => void;
  cancelEdit: () => void;
  isEntryGreyed: (entryKey: string) => boolean;
  isInEditMode: boolean;
  /** Latest request to populate the chat input (e.g. after a reset). */
  inputRestoreRequest: InputRestoreRequest | null;
  /** Populate the chat input with the given text. */
  restoreToInput: (text: string) => void;
}

const MessageEditContext = createHmrContext<MessageEditContextType | null>(
  'MessageEditContext',
  null
);

const EMPTY_ORDER: Record<string, number> = {};
const NOOP_IS_GREYED = () => false;

export function MessageEditProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeEdit, setActiveEdit] = useState<EditState | null>(null);
  const { entries } = useEntries();

  // Build entry order map only when actively editing.
  // When inactive, return a stable empty reference to prevent
  // downstream useMemo/useCallback deps from changing on every
  // streaming entries update.
  const entryOrder = useMemo(() => {
    if (!activeEdit) return EMPTY_ORDER;
    const order: Record<string, number> = {};
    entries.forEach((entry, idx) => {
      order[entry.patchKey] = idx;
    });
    return order;
  }, [entries, activeEdit]);

  const startEdit = useCallback(
    (entryKey: string, processId: string, originalMessage: string) => {
      setActiveEdit({ entryKey, processId, originalMessage });
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setActiveEdit(null);
  }, []);

  // Channel for pushing text into the chat input from elsewhere in the
  // conversation (e.g. the reset action restores the message into the input).
  const [inputRestoreRequest, setInputRestoreRequest] =
    useState<InputRestoreRequest | null>(null);
  const restoreSeqRef = useRef(0);

  const restoreToInput = useCallback((text: string) => {
    restoreSeqRef.current += 1;
    setInputRestoreRequest({ text, seq: restoreSeqRef.current });
  }, []);

  // When not editing, return a stable no-op to avoid context value churn.
  // The entryOrder dep would otherwise create a new callback reference
  // on every entries update even though it always returns false.
  const isEntryGreyed = useCallback(
    (entryKey: string) => {
      if (!activeEdit) return false;
      const activeOrder = entryOrder[activeEdit.entryKey];
      const thisOrder = entryOrder[entryKey];
      return thisOrder > activeOrder;
    },
    [activeEdit, entryOrder]
  );

  const stableIsEntryGreyed = activeEdit ? isEntryGreyed : NOOP_IS_GREYED;
  const isInEditMode = activeEdit !== null;

  const value = useMemo(
    () => ({
      activeEdit,
      startEdit,
      cancelEdit,
      isEntryGreyed: stableIsEntryGreyed,
      isInEditMode,
      inputRestoreRequest,
      restoreToInput,
    }),
    [
      activeEdit,
      startEdit,
      cancelEdit,
      stableIsEntryGreyed,
      isInEditMode,
      inputRestoreRequest,
      restoreToInput,
    ]
  );

  return (
    <MessageEditContext.Provider value={value}>
      {children}
    </MessageEditContext.Provider>
  );
}

export function useMessageEditContext() {
  const ctx = useContext(MessageEditContext);
  if (!ctx) {
    return {
      activeEdit: null,
      startEdit: () => {},
      cancelEdit: () => {},
      isEntryGreyed: () => false,
      isInEditMode: false,
      inputRestoreRequest: null,
      restoreToInput: () => {},
    } as MessageEditContextType;
  }
  return ctx;
}
