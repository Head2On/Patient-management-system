import { apiClient } from "@/lib/api/client";
import type {
  PatientListItem,
  PatientDetail,
  PatientCreateInput,
  PatientUpdateInput,
  PatientDeleteResponse,
} from "@/types/patient";
import type { PagePaginationParams } from "@/types/api";

export interface GetPatientsParams extends PagePaginationParams {
  is_active?: boolean;
}

/**
 * Patient API Service
 * Encapsulates patient HTTP endpoints via the Next.js BFF apiClient.
 */
export async function getPatients(params?: GetPatientsParams): Promise<PatientListItem[]> {
  return apiClient.get<PatientListItem[]>("/patients/", {
    params: {
      page: params?.page,
      limit: params?.limit,
      search: params?.search,
      is_active: params?.is_active,
    },
  });
}

/**
 * Fetch a single patient by their unique patient number.
 *
 * @param patientNumber - The unique patient number (e.g., "PDC-000001").
 * @returns The PatientDetail record including database id and aadhaar.
 */
export async function getPatient(patientNumber: string): Promise<PatientDetail> {
  return apiClient.get<PatientDetail>(`/patients/${encodeURIComponent(patientNumber)}`);
}

/**
 * Register a new patient record.
 *
 * @param data - Patient creation payload.
 * @returns The created PatientListItem record.
 */
export async function createPatient(data: PatientCreateInput): Promise<PatientListItem> {
  return apiClient.post<PatientListItem>("/patients/", data);
}

/**
 * Update an existing patient record.
 *
 * @param patientNumber - The unique patient identifier (e.g. "PDC-000001").
 * @param data - Partial patient fields to update.
 * @returns The updated PatientListItem record.
 */
export async function updatePatient(
  patientNumber: string,
  data: PatientUpdateInput
): Promise<PatientListItem> {
  return apiClient.patch<PatientListItem>(
    `/patients/${encodeURIComponent(patientNumber)}`,
    data
  );
}

/**
 * Soft delete (deactivate) an active patient record.
 * Restricted to Admin and Receptionist roles.
 *
 * @param patientNumber - The unique patient identifier (e.g. "PDC-000001").
 * @returns Confirmation message and status.
 */
export async function deletePatient(
  patientNumber: string
): Promise<PatientDeleteResponse> {
  return apiClient.delete<PatientDeleteResponse>(
    `/patients/${encodeURIComponent(patientNumber)}`
  );
}

/**
 * Alias for deletePatient to align with clinical lifecycle semantics.
 */
export const deactivatePatient = deletePatient;

/**
 * Reactivate a deactivated patient record.
 * Restricted to Admin and Receptionist roles.
 *
 * @param patientNumber - The unique patient identifier (e.g. "PDC-000001").
 * @returns The reactivated PatientListItem record.
 */
export async function reactivatePatient(
  patientNumber: string
): Promise<PatientListItem> {
  return apiClient.patch<PatientListItem>(
    `/patients/${encodeURIComponent(patientNumber)}/reactivate`
  );
}

export const patientsApi = {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  deactivatePatient,
  reactivatePatient,
};
