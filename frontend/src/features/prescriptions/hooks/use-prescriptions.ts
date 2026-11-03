import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPrescription,
  getPrescription,
  getAppointmentPrescription,
  getPatientPrescriptions,
  updatePrescription,
  deletePrescription,
} from "@/features/prescriptions/api/prescriptions-api";
import type {
  Prescription,
  PrescriptionCreateInput,
  PrescriptionUpdateInput,
} from "@/types/prescription";
import type { ApiClientError } from "@/lib/api/errors";

export const prescriptionKeys = {
  all: ["prescriptions"] as const,
  detail: (id: number) => [...prescriptionKeys.all, "detail", id] as const,
  byAppointment: (appointmentId: number) =>
    [...prescriptionKeys.all, "appointment", appointmentId] as const,
  byPatient: (patientId: number) =>
    [...prescriptionKeys.all, "patient", patientId] as const,
};

export function useAppointmentPrescription(
  appointmentId: number,
  options?: { enabled?: boolean }
) {
  return useQuery<Prescription | null, ApiClientError>({
    queryKey: prescriptionKeys.byAppointment(appointmentId),
    queryFn: () => getAppointmentPrescription(appointmentId),
    enabled: options?.enabled ?? Boolean(appointmentId),
  });
}

export function usePrescription(
  prescriptionId: number,
  options?: { enabled?: boolean }
) {
  return useQuery<Prescription, ApiClientError>({
    queryKey: prescriptionKeys.detail(prescriptionId),
    queryFn: () => getPrescription(prescriptionId),
    enabled: options?.enabled ?? Boolean(prescriptionId),
  });
}

export function usePatientPrescriptions(
  patientId: number,
  options?: { enabled?: boolean }
) {
  return useQuery<Prescription[], ApiClientError>({
    queryKey: prescriptionKeys.byPatient(patientId),
    queryFn: () => getPatientPrescriptions(patientId),
    enabled: options?.enabled ?? Boolean(patientId),
  });
}

export function useCreatePrescription() {
  const queryClient = useQueryClient();

  return useMutation<Prescription, ApiClientError, PrescriptionCreateInput>({
    mutationFn: (data: PrescriptionCreateInput) => createPrescription(data),
    onSuccess: (prescription) => {
      queryClient.invalidateQueries({
        queryKey: prescriptionKeys.byAppointment(prescription.appointment_id),
      });
      queryClient.invalidateQueries({
        queryKey: prescriptionKeys.byPatient(prescription.patient_id),
      });
      queryClient.invalidateQueries({
        queryKey: prescriptionKeys.all,
      });
    },
  });
}

export interface UpdatePrescriptionVariables {
  prescriptionId: number;
  data: PrescriptionUpdateInput;
}

export function useUpdatePrescription() {
  const queryClient = useQueryClient();

  return useMutation<Prescription, ApiClientError, UpdatePrescriptionVariables>({
    mutationFn: ({ prescriptionId, data }: UpdatePrescriptionVariables) =>
      updatePrescription(prescriptionId, data),
    onSuccess: (prescription) => {
      queryClient.invalidateQueries({
        queryKey: prescriptionKeys.detail(prescription.id),
      });
      queryClient.invalidateQueries({
        queryKey: prescriptionKeys.byAppointment(prescription.appointment_id),
      });
      queryClient.invalidateQueries({
        queryKey: prescriptionKeys.byPatient(prescription.patient_id),
      });
    },
  });
}

export function useDeletePrescription() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, ApiClientError, number>({
    mutationFn: (prescriptionId: number) => deletePrescription(prescriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: prescriptionKeys.all,
      });
    },
  });
}
