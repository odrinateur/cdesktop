import { useCallback, useMemo } from 'react';
import { useExecutionProcessesContext } from '@/shared/hooks/useExecutionProcessesContext';
import { useBranchStatus } from '@/shared/hooks/useBranchStatus';
import { isCodingAgent } from '@/shared/constants/processes';
import { useMessageEditContext } from '../contexts/MessageEditContext';
import { useResetProcessMutation } from './useResetProcessMutation';

export interface UseResetProcessResult {
  /**
   * Reset the session to the given process. `content` is the text of the
   * message being reset; on success it is restored into the chat input so the
   * user can tweak and resend it.
   */
  resetProcess: (executionProcessId: string, content: string) => void;
  canResetProcess: (executionProcessId: string) => boolean;
  isResetPending: boolean;
}

/**
 * @param workspaceId - passed explicitly to avoid subscribing to WorkspaceContext
 * @param selectedSessionId - passed explicitly to avoid subscribing to WorkspaceContext
 */
export function useResetProcess(
  workspaceId: string | undefined,
  selectedSessionId: string | undefined
): UseResetProcessResult {
  const { data: branchStatus } = useBranchStatus(workspaceId);
  const { executionProcessesAll: processes } = useExecutionProcessesContext();
  const { restoreToInput } = useMessageEditContext();

  const resetMutation = useResetProcessMutation(selectedSessionId ?? '');
  const isResetPending = resetMutation.isPending;

  const hasCodingProcess = useMemo(
    () =>
      processes.some(
        (process) => !process.dropped && isCodingAgent(process.run_reason)
      ),
    [processes]
  );

  const canResetProcess = useCallback(
    (executionProcessId: string) => hasCodingProcess && !!executionProcessId,
    [hasCodingProcess]
  );

  const resetProcess = useCallback(
    (executionProcessId: string, content: string) => {
      if (!selectedSessionId) return;
      resetMutation.mutate(
        {
          executionProcessId,
          branchStatus,
          processes,
        },
        {
          // Only fires on a confirmed reset; a cancelled dialog rejects and
          // lands in onError instead, leaving the input untouched.
          onSuccess: () => restoreToInput(content),
        }
      );
    },
    [branchStatus, processes, resetMutation, restoreToInput, selectedSessionId]
  );

  return useMemo(
    () => ({
      resetProcess,
      canResetProcess,
      isResetPending,
    }),
    [resetProcess, canResetProcess, isResetPending]
  );
}
