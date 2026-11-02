import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAppointments,
  getAppointment,
  getPatientAppointments,
  createAppointment,
  updateAppointment,
  type GetAppointmentsParams,
  type GetPatientAppointmentsParams,
} from "@/features/appointments/api/appointments-api";
import type {
  Appointment,
  AppointmentCreateInput,
  AppointmentUpdateInput,
} from "@/types/appointment";
import type { ApiClientError } from "@/lib/api/errors";

/**
 * Centralized Appointment Query Key Factory
 *
 * Establishes consistent, structured cache keys for queries and invalidations:
 * - appointmentKeys.all: Root key for all appointment-related queries
 * - appointmentKeys.lists(): Base key for all appointment listing queries
 * - appointmentKeys.list(params): Specific cache key for a parameter combination
 * - appointmentKeys.details(): Base key for appointment detail queries
 * - appointmentKeys.detail(id): Specific cache key for a single appointment
 * - appointmentKeys.patientAll(): Base key for all patient appointment queries
 * - appointmentKeys.patientList(patientId): Cache key prefix for a specific patient's appointments
 * - appointmentKeys.patientAppointments(patientId, params): Specific cache key for a patient's appointments with filters
 */
export const appointmentKeys = {
  all: ["appointments"] as const,
  lists: () => [...appointmentKeys.all, "list"] as const,
  list: (params?: GetAppointmentsParams) =>
    [...appointmentKeys.lists(), params ?? {}] as const,
  details: () => [...appointmentKeys.all, "detail"] as const,
  detail: (id: number) => [...appointmentKeys.details(), id] as const,
  patientAll: () => [...appointmentKeys.all, "patient"] as const,
  patientList: (patientId: number) =>
    [...appointmentKeys.patientAll(), patientId] as const,
  patientAppointments: (
    patientId: number,
    params?: GetPatientAppointmentsParams
  ) => [...appointmentKeys.patientList(patientId), params ?? {}] as const,
};

/**
 * React Query hook to fetch a list of clinic appointments with optional skip/limit pagination.
 *
 * @param params - Optional skip and limit pagination parameters.
 * @returns TanStack Query result containing Appointment[] array and request states.
 */
export function useAppointments(params?: GetAppointmentsParams) {
  return useQuery<Appointment[], ApiClientError>({
    queryKey: appointmentKeys.list(params),
    queryFn: () => getAppointments(params),
  });
}

/**
 * React Query hook to fetch a single appointment by its database integer ID.
 *
 * @param appointmentId - The internal database integer ID of the appointment.
 * @param options - Optional configuration such as enabling/disabling the query.
 * @returns TanStack Query result containing the Appointment record.
 */
export function useAppointment(
  appointmentId: number,
  options?: { enabled?: boolean }
) {
  return useQuery<Appointment, ApiClientError>({
    queryKey: appointmentKeys.detail(appointmentId),
    queryFn: () => getAppointment(appointmentId),
    enabled:
      (options?.enabled ?? true) &&
      Number.isInteger(appointmentId) &&
      appointmentId > 0,
  });
}

/**
 * React Query hook to fetch appointments for a specific patient.
 *
 * @param patientId - The internal database integer ID of the patient.
 * @param params - Optional filter parameters (e.g. status).
 * @param options - Optional configuration such as enabling/disabling the query.
 * @returns TanStack Query result containing Appointment[] array for the patient.
 */
export function usePatientAppointments(
  patientId: number,
  params?: GetPatientAppointmentsParams,
  options?: { enabled?: boolean }
) {
  return useQuery<Appointment[], ApiClientError>({
    queryKey: appointmentKeys.patientAppointments(patientId, params),
    queryFn: () => getPatientAppointments(patientId, params),
    enabled:
      (options?.enabled ?? true) &&
      Number.isInteger(patientId) &&
      patientId > 0,
  });
}

/**
 * React Query mutation hook to book/create a new appointment.
 * Restricted to Administrator and Receptionist roles.
 *
 * Features:
 * - Automatically invalidates appointment directory lists.
 * - Invalidates patient-specific appointment histories for the booked patient.
 * - Naturally propagates ApiClientError (e.g., 403 Forbidden, 400 overlap conflicts, 422 validation errors).
 *
 * @returns TanStack Mutation result for appointment creation.
 */
export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation<Appointment, ApiClientError, AppointmentCreateInput>({
    mutationFn: (data: AppointmentCreateInput) => createAppointment(data),
    onSuccess: (createdAppointment, variables) => {
      const patientId = createdAppointment?.patient_id ?? variables.patient_id;
      const promises: Promise<unknown>[] = [
        queryClient.invalidateQueries({
          queryKey: appointmentKeys.lists(),
        }),
      ];

      if (patientId) {
        promises.push(
          queryClient.invalidateQueries({
            queryKey: appointmentKeys.patientList(patientId),
          })
        );
      }

      return Promise.all(promises);
    },
  });
}

export interface UpdateAppointmentVariables {
  appointmentId: number;
  data: AppointmentUpdateInput;
}

/**
 * React Query mutation hook to update an existing appointment record.
 * Allowed for all authenticated clinic staff.
 *
 * Features:
 * - Invalidates the specific appointment detail cache.
 * - Invalidates appointment directory lists.
 * - Invalidates patient appointment history cache for the relevant patient.
 * - Naturally propagates ApiClientError.
 *
 * @returns TanStack Mutation result for appointment update.
 */
export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation<Appointment, ApiClientError, UpdateAppointmentVariables>({
    mutationFn: ({ appointmentId, data }: UpdateAppointmentVariables) =>
      updateAppointment(appointmentId, data),
    onSuccess: (updatedAppointment, variables) => {
      const patientId = updatedAppointment?.patient_id;
      const promises: Promise<unknown>[] = [
        queryClient.invalidateQueries({
          queryKey: appointmentKeys.detail(variables.appointmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: appointmentKeys.lists(),
        }),
      ];

      if (patientId) {
        promises.push(
          queryClient.invalidateQueries({
            queryKey: appointmentKeys.patientList(patientId),
          })
        );
      } else {
        promises.push(
          queryClient.invalidateQueries({
            queryKey: appointmentKeys.patientAll(),
          })
        );
      }

      return Promise.all(promises);
    },
  });
}
