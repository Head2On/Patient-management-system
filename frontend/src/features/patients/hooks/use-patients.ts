import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deactivatePatient,
  reactivatePatient,
  type GetPatientsParams,
} from "@/features/patients/api/patients-api";
import type {
  PatientListItem,
  PatientDetail,
  PatientCreateInput,
  PatientUpdateInput,
  PatientDeleteResponse,
} from "@/types/patient";
import type { ApiClientError } from "@/lib/api/errors";

/**
 * Centralized Patient Query Key Factory
 *
 * Establishes consistent, structured cache keys for queries and invalidations:
 * - patientKeys.all: Root key for all patient-related queries
 * - patientKeys.lists(): Base key for all patient listing queries
 * - patientKeys.list(params): Specific cache key for a parameter combination
 * - patientKeys.details(): Base key for patient detail queries
 * - patientKeys.detail(id): Specific cache key for a single patient
 */
export const patientKeys = {
  all: ["patients"] as const,
  lists: () => [...patientKeys.all, "list"] as const,
  list: (params?: GetPatientsParams) => [...patientKeys.lists(), params ?? {}] as const,
  details: () => [...patientKeys.all, "detail"] as const,
  detail: (patientNumber: string) => [...patientKeys.details(), patientNumber] as const,
};

/**
 * React Query hook to fetch a paginated list of patients with optional search.
 *
 * @param params - Optional page, limit, and search query parameters.
 * @returns TanStack Query result containing PatientListItem[] array and request states.
 */
export function usePatients(params?: GetPatientsParams, options?: { enabled?: boolean }) {
  return useQuery<PatientListItem[], ApiClientError>({
    queryKey: patientKeys.list(params),
    queryFn: () => getPatients(params),
    enabled: options?.enabled ?? true,
  });
}

/**
 * React Query hook to fetch a single patient by their patient number.
 *
 * @param patientNumber - The unique patient number (e.g., "PDC-000001").
 * @param options - Optional configuration such as enabling/disabling the query.
 * @returns TanStack Query result containing the PatientDetail object.
 */
export function usePatient(
  patientNumber: string,
  options?: { enabled?: boolean }
) {
  return useQuery<PatientDetail, Error>({
    queryKey: patientKeys.detail(patientNumber),
    queryFn: () => getPatient(patientNumber),
    enabled: options?.enabled ?? Boolean(patientNumber),
  });
}

/**
 * React Query mutation hook to create a new patient.
 *
 * Features:
 * - Invalidates patient directory lists on success so tables refresh automatically.
 * - Does not perform UI navigation, leaving routing to the calling component.
 * - Naturally propagates ApiClientError (including 422 validationErrors).
 *
 * @returns TanStack Mutation result for patient creation.
 */
export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation<PatientListItem, ApiClientError, PatientCreateInput>({
    mutationFn: (data: PatientCreateInput) => createPatient(data),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: patientKeys.lists(),
      });
    },
  });
}

export interface UpdatePatientVariables {
  patientNumber: string;
  data: PatientUpdateInput;
}

/**
 * React Query mutation hook to update an existing patient record.
 *
 * Features:
 * - Invalidates both the specific patient's detail query and directory lists on success.
 * - Does not perform UI navigation, leaving routing to the calling component.
 * - Naturally propagates ApiClientError (including 422 validationErrors).
 *
 * @returns TanStack Mutation result for patient update.
 */
export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation<PatientListItem, ApiClientError, UpdatePatientVariables>({
    mutationFn: ({ patientNumber, data }: UpdatePatientVariables) =>
      updatePatient(patientNumber, data),
    onSuccess: (_updatedPatient, { patientNumber }) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: patientKeys.detail(patientNumber),
        }),
        queryClient.invalidateQueries({
          queryKey: patientKeys.lists(),
        }),
      ]);
    },
  });
}

/**
 * React Query mutation hook to soft-delete (deactivate) an active patient record.
 * Restricted to Admin and Receptionist roles.
 *
 * Features:
 * - Invalidates both the specific patient's detail query and directory lists on success.
 * - Does not perform UI navigation, leaving routing to the calling component.
 * - Naturally propagates ApiClientError (including 403 Forbidden).
 *
 * @returns TanStack Mutation result for patient deactivation.
 */
export function useDeactivatePatient() {
  const queryClient = useQueryClient();

  return useMutation<PatientDeleteResponse, ApiClientError, string>({
    mutationFn: (patientNumber: string) => deactivatePatient(patientNumber),
    onSuccess: (_response, patientNumber) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: patientKeys.detail(patientNumber),
        }),
        queryClient.invalidateQueries({
          queryKey: patientKeys.lists(),
        }),
      ]);
    },
  });
}

/**
 * Backwards-compatible alias for useDeactivatePatient.
 */
export const useDeletePatient = useDeactivatePatient;

/**
 * React Query mutation hook to reactivate a deactivated patient record.
 * Restricted to Admin and Receptionist roles.
 *
 * Features:
 * - Invalidates both the specific patient's detail query and directory lists on success.
 * - Does not perform UI navigation, leaving routing to the calling component.
 * - Naturally propagates ApiClientError (including 403 Forbidden).
 *
 * @returns TanStack Mutation result for patient reactivation.
 */
export function useReactivatePatient() {
  const queryClient = useQueryClient();

  return useMutation<PatientListItem, ApiClientError, string>({
    mutationFn: (patientNumber: string) => reactivatePatient(patientNumber),
    onSuccess: (_response, patientNumber) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: patientKeys.detail(patientNumber),
        }),
        queryClient.invalidateQueries({
          queryKey: patientKeys.lists(),
        }),
      ]);
    },
  });
}
