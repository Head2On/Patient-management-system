import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProviders,
  getProvider,
  createProvider,
  updateProvider,
  deactivateProvider,
  reactivateProvider,
  type GetProvidersParams,
} from "@/features/providers/api/providers-api";
import type {
  Provider,
  ProviderCreateInput,
  ProviderUpdateInput,
} from "@/types/provider";
import type { ApiClientError } from "@/lib/api/errors";

/**
 * Centralized Provider Query Key Factory
 */
export const providerKeys = {
  all: ["providers"] as const,
  lists: () => [...providerKeys.all, "list"] as const,
  list: (params?: GetProvidersParams) => [...providerKeys.lists(), params ?? {}] as const,
  details: () => [...providerKeys.all, "detail"] as const,
  detail: (docNumber: string) => [...providerKeys.details(), docNumber] as const,
};

/**
 * React Query hook to fetch a list of providers with optional pagination.
 *
 * @param params - Optional skip and limit pagination parameters.
 * @returns TanStack Query result containing Provider[] array and request states.
 */
export function useProviders(params?: GetProvidersParams) {
  return useQuery<Provider[], Error>({
    queryKey: providerKeys.list(params),
    queryFn: () => getProviders(params),
  });
}

/**
 * React Query hook to fetch a single provider by doc_number.
 *
 * @param docNumber - Unique provider doctor number (e.g., "AS3210").
 * @param options - Optional configuration such as enabling/disabling the query.
 * @returns TanStack Query result containing Provider record.
 */
export function useProvider(
  docNumber: string,
  options?: { enabled?: boolean }
) {
  return useQuery<Provider, Error>({
    queryKey: providerKeys.detail(docNumber),
    queryFn: () => getProvider(docNumber),
    enabled: options?.enabled ?? Boolean(docNumber),
  });
}

/**
 * React Query mutation hook to register a new provider.
 * Restricted to Administrator role.
 *
 * Features:
 * - Automatically invalidates provider lists on success.
 * - Does not perform UI navigation, leaving routing to the calling component.
 * - Naturally propagates ApiClientError.
 *
 * @returns TanStack Mutation result for provider creation.
 */
export function useCreateProvider() {
  const queryClient = useQueryClient();

  return useMutation<Provider, ApiClientError, ProviderCreateInput>({
    mutationFn: (data: ProviderCreateInput) => createProvider(data),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: providerKeys.lists(),
      });
    },
  });
}

export interface UpdateProviderVariables {
  docNumber: string;
  data: ProviderUpdateInput;
}

/**
 * React Query mutation hook to update an existing provider record.
 * Restricted to Administrator role.
 *
 * Features:
 * - Invalidates both the specific provider detail query and directory lists on success.
 * - Naturally propagates ApiClientError.
 *
 * @returns TanStack Mutation result for provider update.
 */
export function useUpdateProvider() {
  const queryClient = useQueryClient();

  return useMutation<Provider, ApiClientError, UpdateProviderVariables>({
    mutationFn: ({ docNumber, data }: UpdateProviderVariables) =>
      updateProvider(docNumber, data),
    onSuccess: (_updatedProvider, { docNumber }) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: providerKeys.detail(docNumber),
        }),
        queryClient.invalidateQueries({
          queryKey: providerKeys.lists(),
        }),
      ]);
    },
  });
}

/**
 * React Query mutation hook to deactivate a provider record.
 * Restricted to Administrator role.
 *
 * Features:
 * - Invalidates both the specific provider detail query and directory lists on success.
 * - Naturally propagates ApiClientError (including 403 Forbidden).
 *
 * @returns TanStack Mutation result for provider deactivation.
 */
export function useDeactivateProvider() {
  const queryClient = useQueryClient();

  return useMutation<Provider, ApiClientError, string>({
    mutationFn: (docNumber: string) => deactivateProvider(docNumber),
    onSuccess: (_response, docNumber) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: providerKeys.detail(docNumber),
        }),
        queryClient.invalidateQueries({
          queryKey: providerKeys.lists(),
        }),
      ]);
    },
  });
}

/**
 * React Query mutation hook to reactivate a deactivated provider record.
 * Restricted to Administrator role.
 *
 * Features:
 * - Invalidates both the specific provider detail query and directory lists on success.
 * - Naturally propagates ApiClientError (including 403 Forbidden).
 *
 * @returns TanStack Mutation result for provider reactivation.
 */
export function useReactivateProvider() {
  const queryClient = useQueryClient();

  return useMutation<Provider, ApiClientError, string>({
    mutationFn: (docNumber: string) => reactivateProvider(docNumber),
    onSuccess: (_response, docNumber) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: providerKeys.detail(docNumber),
        }),
        queryClient.invalidateQueries({
          queryKey: providerKeys.lists(),
        }),
      ]);
    },
  });
}
