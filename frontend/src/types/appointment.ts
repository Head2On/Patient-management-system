/**
 * Appointment domain types
 * Derived from FastAPI OpenAPI schema
 */

import type { ProviderPublic } from "./provider";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface PatientAppointmentSummary {
  id: number;
  patient_number: string;
  name: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  patient: PatientAppointmentSummary;
  provider: ProviderPublic;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  reason_for_visit: string;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by_id?: number | null;
  updated_by_id?: number | null;
}

export interface AppointmentCreateInput {
  patient_id: number;
  provider_id: string; // Accepts doctor's doc_number e.g. "AS3210"
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  reason_for_visit: string;
  internal_notes?: string | null;
}

export interface AppointmentUpdateInput {
  status?: AppointmentStatus | null;
  provider_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason_for_visit?: string | null;
  internal_notes?: string | null;
}
