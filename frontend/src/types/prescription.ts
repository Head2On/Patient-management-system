import type { PatientAppointmentSummary } from "./appointment";
import type { ProviderPublic } from "./provider";

export interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string | null;
}

export interface Vitals {
  blood_pressure?: string | null;
  pulse?: number | null;
  temperature?: string | null;
  weight?: string | null;
  spo2?: number | null;
}

export interface Prescription {
  id: number;
  appointment_id: number;
  patient_id: number;
  provider_id: number;
  diagnosis: string;
  symptoms?: string | null;
  vitals?: Vitals | null;
  medications: MedicationItem[];
  advice?: string | null;
  follow_up_date?: string | null;
  created_at: string;
  updated_at: string;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  patient?: PatientAppointmentSummary | null;
  provider?: ProviderPublic | null;
}

export interface PrescriptionCreateInput {
  appointment_id: number;
  diagnosis: string;
  symptoms?: string | null;
  vitals?: Vitals | null;
  medications: MedicationItem[];
  advice?: string | null;
  follow_up_date?: string | null;
}

export interface PrescriptionUpdateInput {
  diagnosis?: string | null;
  symptoms?: string | null;
  vitals?: Vitals | null;
  medications?: MedicationItem[] | null;
  advice?: string | null;
  follow_up_date?: string | null;
}
