/**
 * Patient domain types
 * Derived from FastAPI OpenAPI schema and live endpoint contracts
 */

/**
 * Exact fields returned by GET /api/v1/patients/ (list endpoint)
 */
export interface PatientListItem {
  patient_number: string;
  name: string;
  phone: string;
  dob: string;
  gender: string;
  address: string;
  chief_complaint: string;
  is_active: boolean;
  created_by_id?: number | null;
  updated_by_id?: number | null;
}

/**
 * Detail fields returned by GET /api/v1/patients/{patient_number}
 * Extends the list representation and includes required database `id` and `aadhaar`.
 */
export interface PatientDetail extends PatientListItem {
  id: number;
  aadhaar: string | null;
}

export interface PatientShort {
  id: number;
  patient_number: string;
  name: string;
  phone: string;
  gender: string;
  dob: string;
}

/**
 * Alias for PatientListItem to maintain backwards compatibility
 */
export type Patient = PatientListItem;

export interface PatientCreateInput {
  name: string;
  phone: string;
  dob: string;
  gender: string;
  address: string;
  chief_complaint: string;
  aadhaar?: string | null;
}

export interface PatientUpdateInput {
  name?: string | null;
  phone?: string | null;
  dob?: string | null;
  gender?: string | null;
  address?: string | null;
  chief_complaint?: string | null;
}

export interface PatientDeleteResponse {
  message: string;
  patient_number: string;
  status: string;
}
