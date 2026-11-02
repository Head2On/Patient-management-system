import { apiClient } from "@/lib/api/client";
import type {
  Appointment,
  AppointmentCreateInput,
  AppointmentUpdateInput,
  AppointmentStatus,
} from "@/types/appointment";
import type { SkipLimitPaginationParams } from "@/types/api";

export type GetAppointmentsParams = SkipLimitPaginationParams;

export interface GetPatientAppointmentsParams {
  status?: AppointmentStatus;
}

/**
 * Appointment API Service
 * Encapsulates appointment HTTP endpoints via the Next.js BFF apiClient.
 */

/**
 * Fetch a list of appointments with optional skip/limit pagination.
 *
 * @param params - Optional skip and limit parameters.
 * @returns Array of Appointment records.
 */
export async function getAppointments(
  params?: GetAppointmentsParams
): Promise<Appointment[]> {
  return apiClient.get<Appointment[]>("/appointments/", {
    params: {
      skip: params?.skip,
      limit: params?.limit,
    },
  });
}

/**
 * Fetch a single appointment by its database integer ID.
 *
 * @param appointmentId - The internal database ID of the appointment.
 * @returns The Appointment record.
 */
export async function getAppointment(
  appointmentId: number
): Promise<Appointment> {
  return apiClient.get<Appointment>(
    `/appointments/${encodeURIComponent(appointmentId)}`
  );
}

/**
 * Fetch all appointments for a specific patient.
 *
 * @param patientId - The internal database ID of the patient.
 * @param params - Optional parameters (e.g. status filter).
 * @returns Array of Appointment records for the patient.
 */
export async function getPatientAppointments(
  patientId: number,
  params?: GetPatientAppointmentsParams
): Promise<Appointment[]> {
  return apiClient.get<Appointment[]>(
    `/appointments/patient/${encodeURIComponent(patientId)}/appointments`,
    {
      params: {
        status: params?.status,
      },
    }
  );
}

/**
 * Book / create a new clinic appointment.
 * Restricted to Administrator and Receptionist roles.
 *
 * @param data - The appointment creation payload (requires integer patient_id and string provider_id/doc_number).
 * @returns The created Appointment record.
 */
export async function createAppointment(
  data: AppointmentCreateInput
): Promise<Appointment> {
  return apiClient.post<Appointment>("/appointments/", data);
}

/**
 * Update an existing appointment record.
 * Allowed for all authenticated clinic staff.
 *
 * @param appointmentId - The internal database ID of the appointment.
 * @param data - The fields to update (strictly respects FastAPI extra='forbid' constraint).
 * @returns The updated Appointment record.
 */
export async function updateAppointment(
  appointmentId: number,
  data: AppointmentUpdateInput
): Promise<Appointment> {
  return apiClient.patch<Appointment>(
    `/appointments/${encodeURIComponent(appointmentId)}`,
    data
  );
}
