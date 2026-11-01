import { apiClient } from "@/lib/api/client";
import type {
  Provider,
  ProviderCreateInput,
  ProviderUpdateInput,
} from "@/types/provider";
import type { SkipLimitPaginationParams } from "@/types/api";

export type GetProvidersParams = SkipLimitPaginationParams;

/**
 * Provider API Service
 * Encapsulates provider HTTP endpoints via the Next.js BFF apiClient.
 */

/**
 * Fetch a list of medical providers with optional skip/limit pagination.
 *
 * @param params - Optional skip and limit parameters.
 * @returns Array of Provider records.
 */
export async function getProviders(
  params?: GetProvidersParams
): Promise<Provider[]> {
  return apiClient.get<Provider[]>("/providers/", {
    params: {
      skip: params?.skip,
      limit: params?.limit,
    },
  });
}

/**
 * Fetch a single provider by their unique doc_number.
 *
 * @param docNumber - The provider identifier (e.g. "AS3210").
 * @returns The Provider record.
 */
export async function getProvider(docNumber: string): Promise<Provider> {
  return apiClient.get<Provider>(`/providers/${encodeURIComponent(docNumber)}`);
}

/**
 * Register a new medical provider.
 * Restricted to Administrator role.
 *
 * @param data - Provider creation payload.
 * @returns The created Provider record.
 */
export async function createProvider(
  data: ProviderCreateInput
): Promise<Provider> {
  return apiClient.post<Provider>("/providers/", data);
}

/**
 * Update an existing provider record.
 * Restricted to Administrator role.
 *
 * @param docNumber - The provider identifier (e.g. "AS3210").
 * @param data - Provider fields to update.
 * @returns The updated Provider record.
 */
export async function updateProvider(
  docNumber: string,
  data: ProviderUpdateInput
): Promise<Provider> {
  return apiClient.put<Provider>(
    `/providers/${encodeURIComponent(docNumber)}`,
    data
  );
}

/**
 * Deactivate a provider record (soft-delete).
 * Restricted to Administrator role.
 *
 * @param docNumber - The provider identifier (e.g. "AS3210").
 * @returns The deactivated Provider record.
 */
export async function deactivateProvider(docNumber: string): Promise<Provider> {
  return apiClient.delete<Provider>(
    `/providers/${encodeURIComponent(docNumber)}`
  );
}

/**
 * Reactivate a deactivated provider record.
 * Restricted to Administrator role.
 *
 * @param docNumber - The provider identifier (e.g. "AS3210").
 * @returns The reactivated Provider record.
 */
export async function reactivateProvider(docNumber: string): Promise<Provider> {
  return apiClient.patch<Provider>(
    `/providers/${encodeURIComponent(docNumber)}/reactivate`
  );
}

export const providersApi = {
  getProviders,
  getProvider,
  createProvider,
  updateProvider,
  deactivateProvider,
  reactivateProvider,
};
