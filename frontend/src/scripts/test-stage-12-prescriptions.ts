/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * STAGE 12: CLINICAL PRESCRIPTIONS & RX GENERATION TEST SUITE
 * 
 * Verifies end-to-end clinical workflow:
 * 1. Authentication (Admin, Receptionist, Doctor).
 * 2. Patient Registration & Consultation Scheduling.
 * 3. Status Transition to in_progress.
 * 4. Validation boundaries (missing diagnosis, empty medications).
 * 5. RBAC boundaries (Receptionist cannot create/update prescriptions; Doctor can).
 * 6. Doctor issues Prescription with structured vitals and medications list.
 * 7. Duplicate collision prevention (unique appointment_id constraint -> 409 Conflict).
 * 8. Querying prescriptions by Appointment ID and Patient ID.
 * 9. Doctor updates Prescription (modifies dosage, adds medication).
 * 10. Consultation Completion & Direct Database Audit Verification.
 */

import { execSync } from "child_process";
import path from "path";

interface HttpResponse {
  status: number;
  headers: Headers;
  data: any;
  text: string;
}

async function request(url: string, options: RequestInit = {}): Promise<HttpResponse> {
  const res = await fetch(url, options);
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return {
    status: res.status,
    headers: res.headers,
    data,
    text,
  };
}

function parseCookies(headers: Headers): Map<string, { value: string; flags: string[] }> {
  const cookieMap = new Map<string, { value: string; flags: string[] }>();
  const getSetCookie = (headers as any).getSetCookie?.bind(headers);
  const rawCookies: string[] = getSetCookie ? getSetCookie() : [headers.get("set-cookie") || ""];

  for (const raw of rawCookies.filter(Boolean)) {
    const parts = raw.split(";").map((p) => p.trim());
    const [nameVal, ...flags] = parts;
    const eqIdx = nameVal.indexOf("=");
    if (eqIdx !== -1) {
      const name = nameVal.substring(0, eqIdx);
      const value = nameVal.substring(eqIdx + 1);
      cookieMap.set(name, { value, flags });
    }
  }
  return cookieMap;
}

interface UserSession {
  role: string;
  phone: string;
  userId: number;
  providerId: number | null;
  cookieHeader: string;
}

async function loginUser(
  baseUrl: string,
  phone: string,
  password: string,
  expectedRole: string
): Promise<UserSession> {
  const res = await request(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ phone, password }),
  });

  if (res.status !== 200 || !res.data?.user) {
    throw new Error(
      `Failed to log in as ${expectedRole} (${phone}): HTTP ${res.status} - ${res.text}`
    );
  }

  const cookies = parseCookies(res.headers);
  const token = cookies.get("caredesk_token")?.value;
  const userCookie = cookies.get("caredesk_user")?.value;

  if (!token) {
    throw new Error(
      `Login succeeded for ${expectedRole} but caredesk_token cookie was not set.`
    );
  }

  const cookieHeader = `caredesk_token=${token}${userCookie ? `; caredesk_user=${userCookie}` : ""}`;
  return {
    role: res.data.user.role,
    phone: res.data.user.phone,
    userId: res.data.user.id,
    providerId: res.data.user.provider_id,
    cookieHeader,
  };
}

async function verifyPrescriptionInDb(prescriptionId: number): Promise<any> {
  const projectRoot = path.resolve(__dirname, "../../../");
  const pythonScript = `
import json, sys
from app.db.database import SessionLocal
from app.models.prescription import Prescription
from app.models.patient import Patient
from app.models.provider import Provider

db = SessionLocal()
try:
    rx = db.query(Prescription).filter(Prescription.id == ${prescriptionId}).first()
    if not rx:
        print(json.dumps(None))
        sys.exit(0)
    
    patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
    provider = db.query(Provider).filter(Provider.id == rx.provider_id).first()
    
    result = {
        "id": rx.id,
        "appointment_id": rx.appointment_id,
        "patient_id": rx.patient_id,
        "patient_name": patient.name if patient else None,
        "provider_id": rx.provider_id,
        "provider_name": provider.name if provider else None,
        "diagnosis": rx.diagnosis,
        "symptoms": rx.symptoms,
        "vitals": rx.vitals,
        "medications": rx.medications,
        "advice": rx.advice,
        "follow_up_date": rx.follow_up_date.isoformat() if rx.follow_up_date else None,
        "created_by_id": rx.created_by_id,
        "updated_by_id": rx.updated_by_id
    }
    print(json.dumps(result))
finally:
    db.close()
`;

  const output = execSync("python", {
    input: pythonScript,
    cwd: projectRoot,
    encoding: "utf-8",
  });
  return JSON.parse(output.trim());
}

async function runStage12PrescriptionsVerification() {
  console.log("================================================================================");
  console.log("STAGE 12: CLINICAL PRESCRIPTIONS & RX GENERATION VERIFICATION");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(message);
    }
    console.log(`✓ PASSED: ${message}`);
    passed++;
  }

  const BASE_URL = "http://localhost:3000";

  // 1. Authenticate Actors
  console.log("--- 1. AUTHENTICATING CLINICAL STAFF ---");
  const admin = await loginUser(BASE_URL, "9999999999", "AdminPass123", "ADMIN");
  assert(admin.role === "ADMIN", `Admin authenticated (ID: ${admin.userId})`);

  const receptionist = await loginUser(BASE_URL, "8888888888", "ReceptionistPass123", "RECEPTIONIST");
  assert(receptionist.role === "RECEPTIONIST", `Receptionist authenticated (ID: ${receptionist.userId})`);

  const doctor = await loginUser(BASE_URL, "7777777777", "DoctorPass123", "DOCTOR");
  assert(doctor.role === "DOCTOR", `Doctor authenticated (ID: ${doctor.userId}, Provider ID: ${doctor.providerId})`);

  const adminHeaders = { Origin: BASE_URL, cookie: admin.cookieHeader, "Content-Type": "application/json" };
  const receptionistHeaders = { Origin: BASE_URL, cookie: receptionist.cookieHeader, "Content-Type": "application/json" };
  const doctorHeaders = { Origin: BASE_URL, cookie: doctor.cookieHeader, "Content-Type": "application/json" };

  // 2. Fetch Doctor's provider profile to get doc_number
  console.log("\n--- 2. RESOLVING DOCTOR PROVIDER PROFILE ---");
  const providersRes = await request(`${BASE_URL}/api/providers/?limit=1000`, {
    method: "GET",
    headers: doctorHeaders,
  });
  assert(providersRes.status === 200, "Providers list retrieved successfully");
  const providersList = Array.isArray(providersRes.data)
    ? providersRes.data
    : providersRes.data?.items || [];
  let docProfile = providersList.find((p: any) => p.id === doctor.providerId);
  if (!docProfile && doctor.providerId === 1) {
    const p1Res = await request(`${BASE_URL}/api/providers/RS5956`, {
      method: "GET",
      headers: doctorHeaders,
    });
    if (p1Res.status === 200 && p1Res.data) {
      docProfile = p1Res.data;
    }
  }
  assert(Boolean(docProfile), `Found Doctor provider profile (${docProfile?.name}, Doc#: ${docProfile?.doc_number})`);
  const doctorDocNumber = docProfile.doc_number;

  // 3. Register a new patient
  console.log("\n--- 3. REGISTERING PATIENT ---");
  const randSuffix = Math.floor(10000 + Math.random() * 90000);
  const patientRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: `Prescription Test Patient ${randSuffix}`,
      phone: `91888${randSuffix}`,
      dob: "1988-04-12",
      gender: "Male",
      address: "44 Clinical Health Enclave",
      chief_complaint: "High fever and persistent wet cough",
    }),
  });
  assert(patientRes.status === 201, `Patient registered (Patient #: ${patientRes.data.patient_number})`);
  const patientNumber = patientRes.data.patient_number;

  const patientDetailRes = await request(`${BASE_URL}/api/patients/${patientNumber}`, {
    method: "GET",
    headers: receptionistHeaders,
  });
  assert(patientDetailRes.status === 200, `Patient details retrieved with integer ID`);
  const patientId = patientDetailRes.data.id;

  // 4. Schedule consultation appointment with the Doctor
  console.log("\n--- 4. SCHEDULING CONSULTATION APPOINTMENT ---");
  // Set start time 10 days in the future to avoid colliding with existing tests
  const apptStart = new Date(Date.now() + (10 * 24 * 3600 * 1000) + (randSuffix * 1000));
  const apptEnd = new Date(apptStart.getTime() + 30 * 60 * 1000);

  const apptRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientId,
      provider_id: doctorDocNumber,
      start_time: apptStart.toISOString(),
      end_time: apptEnd.toISOString(),
      reason_for_visit: "Acute bronchial symptoms and high temperature",
      internal_notes: "Patient reported chills starting yesterday",
    }),
  });
  assert(apptRes.status === 201, `Consultation scheduled (Appt ID: ${apptRes.data.id}, Status: ${apptRes.data.status})`);
  const appointmentId = apptRes.data.id;

  // 5. Verify cannot prescribe while status is scheduled
  console.log("\n--- 5. VERIFYING PRE-CONSULTATION STATUS RESTRICTIONS ---");
  const earlyRxRes = await request(`${BASE_URL}/api/prescriptions/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify({
      appointment_id: appointmentId,
      diagnosis: "Acute Bronchitis",
      medications: [{ name: "Amoxicillin 500mg", dosage: "1 tab", frequency: "BD", duration: "5 days" }],
    }),
  });
  assert(
    earlyRxRes.status === 400,
    `Prescription rejected when appointment status is 'scheduled' (HTTP ${earlyRxRes.status} - ${earlyRxRes.data?.detail})`
  );

  // 6. Transition status: scheduled -> confirmed -> checked_in -> in_progress
  console.log("\n--- 6. ADVANCING APPOINTMENT TO IN_PROGRESS ---");
  await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "confirmed" }),
  });
  await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "checked_in" }),
  });
  const inProgressRes = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert(inProgressRes.status === 200 && inProgressRes.data.status === "in_progress", "Appointment transitioned to in_progress");

  // 7. Test RBAC: Receptionist attempting to issue prescription must fail
  console.log("\n--- 7. TESTING RBAC PRIVILEGES (RECEPTIONIST IS BLOCKED) ---");
  const recepRxRes = await request(`${BASE_URL}/api/prescriptions/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      appointment_id: appointmentId,
      diagnosis: "Attempted by Receptionist",
      medications: [{ name: "Paracetamol", dosage: "1 tab", frequency: "OD", duration: "1 day" }],
    }),
  });
  assert(
    recepRxRes.status === 403,
    `Receptionist blocked from issuing prescription with 403 Forbidden (HTTP ${recepRxRes.status})`
  );

  // 8. Test Schema Validation: Empty diagnosis or empty medications fails
  console.log("\n--- 8. TESTING VALIDATION DEFENSES ---");
  const emptyDiagRes = await request(`${BASE_URL}/api/prescriptions/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify({
      appointment_id: appointmentId,
      diagnosis: "",
      medications: [{ name: "Paracetamol", dosage: "1 tab", frequency: "OD", duration: "1 day" }],
    }),
  });
  assert(emptyDiagRes.status === 422, `Empty diagnosis rejected with 422 Unprocessable Entity (HTTP ${emptyDiagRes.status})`);

  const emptyMedsRes = await request(`${BASE_URL}/api/prescriptions/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify({
      appointment_id: appointmentId,
      diagnosis: "Acute Bronchitis",
      medications: [],
    }),
  });
  assert(emptyMedsRes.status === 422, `Empty medications array rejected with 422 Unprocessable Entity (HTTP ${emptyMedsRes.status})`);

  // 9. Doctor issues Prescription with full details
  console.log("\n--- 9. DOCTOR ISSUES CLINICAL PRESCRIPTION ---");
  const rxPayload = {
    appointment_id: appointmentId,
    diagnosis: "Acute Purulent Bronchitis with Rhinopharyngitis",
    symptoms: "Fever 101.4 F, productive green cough, throat pain, fatigue",
    vitals: {
      blood_pressure: "128/84",
      pulse: 82,
      temperature: "101.4 F",
      weight: "74 kg",
      spo2: 97,
    },
    medications: [
      {
        name: "Amoxicillin and Potassium Clavulanate 625mg",
        dosage: "1 Tablet",
        frequency: "Twice daily (BD)",
        duration: "7 days",
        instructions: "Take with water immediately after food",
      },
      {
        name: "Paracetamol 650mg",
        dosage: "1 Tablet",
        frequency: "Thrice daily as needed (TID SOS)",
        duration: "3 days",
        instructions: "For temperature above 100 F, max 3 tabs daily",
      },
      {
        name: "Levocetirizine 5mg",
        dosage: "1 Tablet",
        frequency: "Once daily at bedtime (HS)",
        duration: "5 days",
        instructions: "May cause drowsiness; avoid driving",
      },
    ],
    advice: "Warm saline gargles 3 times daily. Increase fluid intake to 3L/day. Strictly avoid cold air and iced beverages.",
    follow_up_date: "2026-11-15",
  };

  const createRxRes = await request(`${BASE_URL}/api/prescriptions/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify(rxPayload),
  });

  assert(createRxRes.status === 201, `Prescription issued successfully (Rx ID: ${createRxRes.data?.id})`);
  const prescriptionId = createRxRes.data.id;
  assert(createRxRes.data.medications.length === 3, "All 3 medications recorded accurately in response");
  assert(createRxRes.data.vitals.blood_pressure === "128/84", "BP vitals recorded accurately");
  assert(createRxRes.data.created_by_id === doctor.userId, "Audit created_by_id tracks Doctor user ID");

  // 10. Verify duplicate creation prevention on same appointment (409 Conflict)
  console.log("\n--- 10. TESTING DUPLICATE PRESCRIPTION PREVENTION ---");
  const dupRxRes = await request(`${BASE_URL}/api/prescriptions/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify(rxPayload),
  });
  assert(
    dupRxRes.status === 409,
    `Duplicate prescription prevented with 409 Conflict (HTTP ${dupRxRes.status} - ${dupRxRes.data?.detail})`
  );

  // 11. Querying Prescriptions: Staff can view and print
  console.log("\n--- 11. QUERYING PRESCRIPTION BY APPOINTMENT & PATIENT ---");
  const byApptRes = await request(`${BASE_URL}/api/prescriptions/appointment/${appointmentId}`, {
    method: "GET",
    headers: receptionistHeaders,
  });
  assert(byApptRes.status === 200, "Receptionist queried prescription by appointment ID successfully");
  assert(byApptRes.data.id === prescriptionId, `Correct Rx ID ${prescriptionId} matched appointment #${appointmentId}`);
  assert(byApptRes.data.patient.id === patientId, "Embedded patient summary verified");
  assert(byApptRes.data.provider.doc_number === doctorDocNumber, "Embedded provider summary verified");

  const byPatientRes = await request(`${BASE_URL}/api/prescriptions/patient/${patientId}`, {
    method: "GET",
    headers: receptionistHeaders,
  });
  assert(byPatientRes.status === 200, "Receptionist queried patient prescription history successfully");
  assert(
    Array.isArray(byPatientRes.data) && byPatientRes.data.some((r: any) => r.id === prescriptionId),
    "Prescription found in patient prescription ledger"
  );

  const adminQueryRes = await request(`${BASE_URL}/api/prescriptions/${prescriptionId}`, {
    method: "GET",
    headers: adminHeaders,
  });
  assert(adminQueryRes.status === 200, "Admin queried prescription with full audit privileges");

  // 12. Doctor updates the Prescription (modifies dosage & adds medication)
  console.log("\n--- 12. DOCTOR UPDATES PRESCRIPTION ---");
  const updatePayload = {
    medications: [
      ...rxPayload.medications,
      {
        name: "Dextromethorphan Hydrobromide Syrup",
        dosage: "10 ml",
        frequency: "Twice daily (BD)",
        duration: "5 days",
        instructions: "Take after food for dry cough relief",
      },
    ],
    advice: "Updated advice: Continue warm saline gargles. Report back if fever persists beyond 48 hours.",
  };

  const updateRxRes = await request(`${BASE_URL}/api/prescriptions/${prescriptionId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify(updatePayload),
  });

  assert(updateRxRes.status === 200, `Prescription updated successfully (HTTP ${updateRxRes.status})`);
  assert(updateRxRes.data.medications.length === 4, "Updated prescription contains 4 medications");
  assert(updateRxRes.data.updated_by_id === doctor.userId, "Audit updated_by_id tracks Doctor user ID");

  // 13. Receptionist attempting to update prescription is blocked
  console.log("\n--- 13. RBAC: RECEPTIONIST CANNOT UPDATE PRESCRIPTION ---");
  const recepUpdateRes = await request(`${BASE_URL}/api/prescriptions/${prescriptionId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ advice: "Unauthorized update" }),
  });
  assert(recepUpdateRes.status === 403, `Receptionist blocked from updating Rx with 403 Forbidden (HTTP ${recepUpdateRes.status})`);

  // 14. Complete Consultation
  console.log("\n--- 14. COMPLETING CONSULTATION ---");
  const completeRes = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "completed" }),
  });
  assert(completeRes.status === 200 && completeRes.data.status === "completed", "Appointment transitioned to completed");

  // 15. Verify Database Records directly in PostgreSQL
  console.log("\n--- 15. DIRECT POSTGRESQL DATABASE VERIFICATION ---");
  const dbRecord = await verifyPrescriptionInDb(prescriptionId);
  assert(Boolean(dbRecord), "Prescription verified in PostgreSQL database");
  assert(dbRecord.appointment_id === appointmentId, `DB appointment_id strictly matches (${dbRecord.appointment_id})`);
  assert(dbRecord.patient_id === patientId, `DB patient_id strictly matches (${dbRecord.patient_id})`);
  assert(dbRecord.provider_id === doctor.providerId, `DB provider_id strictly matches (${dbRecord.provider_id})`);
  assert(dbRecord.medications.length === 4, `DB medications JSON contains 4 items`);
  assert(dbRecord.vitals.spo2 === 97, `DB vitals JSON contains SpO2 97%`);
  assert(dbRecord.created_by_id === doctor.userId, `DB audit created_by_id matches Doctor ID (${doctor.userId})`);
  assert(dbRecord.updated_by_id === doctor.userId, `DB audit updated_by_id matches Doctor ID (${doctor.userId})`);

  console.log("\n================================================================================");
  console.log(`STAGE 12 VERIFICATION COMPLETED: ${passed}/${total} ASSERTIONS PASSED ✅`);
  console.log("================================================================================\n");
}

runStage12PrescriptionsVerification().catch((err) => {
  console.error("FATAL ERROR IN STAGE 12 TEST SUITE:", err);
  process.exit(1);
});
