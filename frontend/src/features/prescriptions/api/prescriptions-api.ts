import { apiClient } from "@/lib/api/client";
import type {
  Prescription,
  PrescriptionCreateInput,
  PrescriptionUpdateInput,
} from "@/types/prescription";

/**
 * Prescription API Service
 * Encapsulates clinical prescription HTTP endpoints via the Next.js BFF apiClient.
 */

export async function createPrescription(
  data: PrescriptionCreateInput
): Promise<Prescription> {
  return apiClient.post<Prescription>("/prescriptions/", data);
}

export async function getPrescription(
  prescriptionId: number
): Promise<Prescription> {
  return apiClient.get<Prescription>(`/prescriptions/${prescriptionId}`);
}

export async function getAppointmentPrescription(
  appointmentId: number
): Promise<Prescription | null> {
  return apiClient.get<Prescription | null>(
    `/prescriptions/appointment/${appointmentId}`
  );
}

export async function getPatientPrescriptions(
  patientId: number
): Promise<Prescription[]> {
  return apiClient.get<Prescription[]>(`/prescriptions/patient/${patientId}`);
}

export async function updatePrescription(
  prescriptionId: number,
  data: PrescriptionUpdateInput
): Promise<Prescription> {
  return apiClient.patch<Prescription>(
    `/prescriptions/${prescriptionId}`,
    data
  );
}

export async function deletePrescription(
  prescriptionId: number
): Promise<{ message: string }> {
  return apiClient.delete<{ message: string }>(
    `/prescriptions/${prescriptionId}`
  );
}
