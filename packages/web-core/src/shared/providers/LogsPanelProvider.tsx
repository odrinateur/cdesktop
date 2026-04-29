import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { LogsPanelContent } from '@/shared/types/actions';
import {
  useWorkspacePanelLayout,
  useUiPreferencesStore,
} from '@/shared/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import {
  LogsPanelActionsContext,
  LogsPanelContext,
} from '@/shared/hooks/useLogsPanel';

interface LogsPanelProviderProps {
  children: ReactNode;
}

export function LogsPanelProvider({ children }: LogsPanelProviderProps) {
  const { workspaceId, isCreateMode } = useWorkspaceContext();
  const layoutWorkspaceId = isCreateMode ? undefined : workspaceId;
  const { openPanels } = useWorkspacePanelLayout(layoutWorkspaceId);
  const isLogsOpen = openPanels.has('logs');
  const isLogsOpenRef = useRef(isLogsOpen);
  isLogsOpenRef.current = isLogsOpen;
  const ensureLogsOpen = useCallback(() => {
    if (!layoutWorkspaceId || isLogsOpenRef.current) return;
    useUiPreferencesStore.getState().openPanel(layoutWorkspaceId, 'logs');
  }, [layoutWorkspaceId]);
  const [logsPanelContent, setLogsPanelContent] =
    useState<LogsPanelContent | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logMatchIndices, setLogMatchIndices] = useState<number[]>([]);
  const [logCurrentMatchIdx, setLogCurrentMatchIdx] = useState(0);

  const isTerminalExpanded = logsPanelContent?.type === 'terminal';

  const logContentId =
    logsPanelContent?.type === 'process'
      ? logsPanelContent.processId
      : logsPanelContent?.type === 'tool'
        ? logsPanelContent.toolName
        : null;

  useEffect(() => {
    setLogSearchQuery('');
    setLogCurrentMatchIdx(0);
  }, [logContentId]);

  useEffect(() => {
    setLogCurrentMatchIdx(0);
  }, [logSearchQuery]);

  // Collapse terminal when the Logs panel is closed
  useEffect(() => {
    if (!isLogsOpen && isTerminalExpanded) {
      setLogsPanelContent(null);
    }
  }, [isLogsOpen, isTerminalExpanded]);

  const handleLogPrevMatch = useCallback(() => {
    if (logMatchIndices.length === 0) return;
    setLogCurrentMatchIdx((prev) =>
      prev > 0 ? prev - 1 : logMatchIndices.length - 1
    );
  }, [logMatchIndices.length]);

  const handleLogNextMatch = useCallback(() => {
    if (logMatchIndices.length === 0) return;
    setLogCurrentMatchIdx((prev) =>
      prev < logMatchIndices.length - 1 ? prev + 1 : 0
    );
  }, [logMatchIndices.length]);

  const viewProcessInPanel = useCallback(
    (processId: string) => {
      ensureLogsOpen();
      setLogsPanelContent({ type: 'process', processId });
    },
    [ensureLogsOpen]
  );

  const viewToolContentInPanel = useCallback(
    (toolName: string, content: string, command?: string) => {
      ensureLogsOpen();
      setLogsPanelContent({ type: 'tool', toolName, content, command });
    },
    [ensureLogsOpen]
  );

  const expandTerminal = useCallback(() => {
    ensureLogsOpen();
    setLogsPanelContent({ type: 'terminal' });
  }, [ensureLogsOpen]);

  const collapseTerminal = useCallback(() => {
    setLogsPanelContent(null);
  }, []);

  const actionsValue = useMemo(
    () => ({
      viewProcessInPanel,
      viewToolContentInPanel,
      expandTerminal,
      collapseTerminal,
    }),
    [
      viewProcessInPanel,
      viewToolContentInPanel,
      expandTerminal,
      collapseTerminal,
    ]
  );

  const value = useMemo(
    () => ({
      logsPanelContent,
      logSearchQuery,
      logMatchIndices,
      logCurrentMatchIdx,
      setLogSearchQuery,
      setLogMatchIndices,
      handleLogPrevMatch,
      handleLogNextMatch,
      viewProcessInPanel,
      viewToolContentInPanel,
      expandTerminal,
      collapseTerminal,
      isTerminalExpanded,
    }),
    [
      logsPanelContent,
      logSearchQuery,
      logMatchIndices,
      logCurrentMatchIdx,
      handleLogPrevMatch,
      handleLogNextMatch,
      viewProcessInPanel,
      viewToolContentInPanel,
      expandTerminal,
      collapseTerminal,
      isTerminalExpanded,
    ]
  );

  return (
    <LogsPanelActionsContext.Provider value={actionsValue}>
      <LogsPanelContext.Provider value={value}>
        {children}
      </LogsPanelContext.Provider>
    </LogsPanelActionsContext.Provider>
  );
}
