import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import type {
  Provider,
  CreateProvider,
  UpdateProvider,
  ApiResponse,
} from 'shared/types';

interface FetchedModel {
  id: string;
  owned_by: string | null;
}

interface FetchModelsRequest {
  base_url: string;
  api_key: string;
  models_url?: string | null;
}

interface FetchModelsResponse {
  models: FetchedModel[];
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const res = await makeLocalApiRequest(path, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }
  const body: ApiResponse<T> = await res.json();
  if (!body.success) throw new Error(String(body.message ?? 'API error'));
  return body.data as T;
}

export const PROVIDERS_QUERY_KEY = ['providers'] as const;

export function useProviders() {
  return useQuery({
    queryKey: PROVIDERS_QUERY_KEY,
    queryFn: () => request<Provider[]>('/providers'),
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProvider) =>
      request<Provider>('/providers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY }),
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProvider }) =>
      request<Provider>(`/providers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY }),
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<void>(`/providers/${id}`, { method: 'DELETE' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY }),
  });
}

export function useFetchProviderModels() {
  return useMutation({
    mutationFn: ({
      providerId,
      ...body
    }: FetchModelsRequest & { providerId: string }) =>
      request<FetchModelsResponse>(`/providers/${providerId}/fetch-models`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
