import { useQuery } from '@tanstack/react-query';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';

export interface TurnSelection {
  execution_process_id: string;
  model_id: string;
  provider_id: string;
}

export function useTurnSelections(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['sessions', sessionId, 'turn-selections'],
    queryFn: async () => {
      if (!sessionId) return [];
      const res = await makeLocalApiRequest(
        `/api/sessions/${sessionId}/turn-selections`
      );
      if (!res.ok) return [];
      const body = await res.json();
      return (body.data ?? []) as TurnSelection[];
    },
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

/** Given a list of turn selections ordered by creation time, build a map from
 *  execution_process_id to a switch marker string, if the model/provider changed
 *  from the previous turn. */
export function buildSwitchMarkers(
  selections: TurnSelection[],
  providers: Map<string, string>, // provider_id -> display name
  format: (modelId: string, providerName: string) => string
): Map<string, string> {
  const markers = new Map<string, string>();
  for (let i = 1; i < selections.length; i++) {
    const prev = selections[i - 1];
    const curr = selections[i];
    if (
      curr.model_id !== prev.model_id ||
      curr.provider_id !== prev.provider_id
    ) {
      const providerName = providers.get(curr.provider_id) ?? curr.provider_id;
      markers.set(curr.execution_process_id, format(curr.model_id, providerName));
    }
  }
  return markers;
}
