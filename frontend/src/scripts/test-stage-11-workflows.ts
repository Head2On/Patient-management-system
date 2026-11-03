/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * STAGE 11.3: CROSS-DOMAIN WORKFLOW VERIFICATION
 * Sub-stage 11.3.1: Patient Registration to Consultation Completion
 * Sub-stage 11.3.2: Provider and Doctor Account Integration
 * Sub-stage 11.3.3: Patient Lifecycle Integration (Deactivation, Archiving, Restoration)
 * Sub-stage 11.3.4: Staff Lifecycle & Credential Recovery
 * Sub-stage 11.3.5: Cross-Domain Failure Scenarios & Boundary Defense
 * 
 * Verifies the complete operational lifecycle across:
 * Next.js Frontend BFF -> FastAPI Backend -> PostgreSQL Database
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
  cookieHeader: string;
}

async function loginUser(baseUrl: string, phone: string, password: string, expectedRole: string): Promise<UserSession> {
  const res = await request(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ phone, password }),
  });

  if (res.status !== 200 || !res.data?.user) {
    throw new Error(`Failed to log in as ${expectedRole} (${phone}): HTTP ${res.status} - ${res.text}`);
  }

  const cookies = parseCookies(res.headers);
  const token = cookies.get("caredesk_token")?.value;
  const userCookie = cookies.get("caredesk_user")?.value;

  if (!token) {
    throw new Error(`Login succeeded for ${expectedRole} but caredesk_token cookie was not set.`);
  }

  const cookieHeader = `caredesk_token=${token}${userCookie ? `; caredesk_user=${userCookie}` : ""}`;
  return {
    role: res.data.user.role,
    phone: res.data.user.phone,
    userId: res.data.user.id,
    cookieHeader,
  };
}

async function verifyDatabaseRecord(patientId: number, appointmentId: number): Promise<any> {
  const projectRoot = path.resolve(__dirname, "../../../");
  const pythonScript = `
import json, sys
from app.db.database import SessionLocal
from app.models.patient import Patient
from app.models.appointment import Appointment
from app.models.provider import Provider

db = SessionLocal()
try:
    patient = db.query(Patient).filter(Patient.id == ${patientId}).first()
    appt = db.query(Appointment).filter(Appointment.id == ${appointmentId}).first()
    provider = db.query(Provider).filter(Provider.id == appt.provider_id).first() if appt else None

    result = {
        "patient": {
            "id": patient.id,
            "patient_number": patient.patient_number,
            "name": patient.name,
            "phone": patient.phone,
            "is_active": patient.is_active,
            "created_by_id": patient.created_by_id
        } if patient else None,
        "appointment": {
            "id": appt.id,
            "patient_id": appt.patient_id,
            "provider_id": appt.provider_id,
            "provider_doc_number": provider.doc_number if provider else None,
            "status": appt.status,
            "reason_for_visit": appt.reason_for_visit,
            "internal_notes": appt.internal_notes,
            "created_by_id": appt.created_by_id,
            "updated_by_id": appt.updated_by_id
        } if appt else None
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

async function verifyPatientDatabaseRecord(patientId: number): Promise<any> {
  const projectRoot = path.resolve(__dirname, "../../../");
  const pythonScript = `
import json, sys
from app.db.database import SessionLocal
from app.models.patient import Patient
from app.models.appointment import Appointment

db = SessionLocal()
try:
    patient = db.query(Patient).filter(Patient.id == ${patientId}).first()
    appts = db.query(Appointment).filter(Appointment.patient_id == ${patientId}).all()
    result = {
        "patient": {
            "id": patient.id,
            "patient_number": patient.patient_number,
            "name": patient.name,
            "phone": patient.phone,
            "is_active": patient.is_active,
            "created_by_id": patient.created_by_id,
            "updated_by_id": patient.updated_by_id
        } if patient else None,
        "appointment_count": len(appts),
        "appointment_ids": [a.id for a in appts]
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

async function verifyUserDatabaseRecord(userId: number): Promise<any> {
  const projectRoot = path.resolve(__dirname, "../../../");
  const pythonScript = `
import json, sys
from app.db.database import SessionLocal
from app.models.user import User

db = SessionLocal()
try:
    user = db.query(User).filter(User.id == ${userId}).first()
    result = {
        "user": {
            "id": user.id,
            "phone": user.phone,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "is_active": user.is_active,
            "provider_id": user.provider_id
        } if user else None
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

async function runStage11Workflows() {
  console.log("================================================================================");
  console.log("STAGE 11.3: CROSS-DOMAIN WORKFLOW VERIFICATION (11.3.1 - 11.3.5)");
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

  console.log("--- 0. AUTHENTICATING WORKFLOW ACTORS ---");
  const adminSession = await loginUser(BASE_URL, "9999999999", "AdminPass123", "ADMIN");
  assert(adminSession.role === "ADMIN", `Admin authenticated (User ID: ${adminSession.userId})`);

  const receptionistSession = await loginUser(BASE_URL, "8888888888", "ReceptionistPass123", "RECEPTIONIST");
  assert(receptionistSession.role === "RECEPTIONIST", `Receptionist authenticated (User ID: ${receptionistSession.userId})`);

  const doctorSession = await loginUser(BASE_URL, "7777777777", "DoctorPass123", "DOCTOR");
  assert(doctorSession.role === "DOCTOR", `Doctor authenticated (User ID: ${doctorSession.userId})`);

  const adminHeaders = { Origin: BASE_URL, cookie: adminSession.cookieHeader, "Content-Type": "application/json" };
  const receptionistHeaders = { Origin: BASE_URL, cookie: receptionistSession.cookieHeader, "Content-Type": "application/json" };
  const doctorHeaders = { Origin: BASE_URL, cookie: doctorSession.cookieHeader, "Content-Type": "application/json" };

  // ================================================================================
  // SUB-STAGE 11.3.1: PATIENT REGISTRATION TO CONSULTATION COMPLETION
  // ================================================================================
  console.log("\n================================================================================");
  console.log("SUB-STAGE 11.3.1: PATIENT REGISTRATION TO CONSULTATION COMPLETION");
  console.log("================================================================================");

  // STEP 1: REGISTER A NEW PATIENT AS RECEPTIONIST
  console.log("\n--- STEP 1: REGISTER PATIENT AS RECEPTIONIST ---");
  const patientPhone = `61234${Math.floor(10000 + Math.random() * 90000)}`;
  const regPatientRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Debashis Banerjee",
      phone: patientPhone,
      gender: "Male",
      dob: "1982-04-18",
      address: "88 Southern Avenue, Kolkata",
      chief_complaint: "Acute lower back pain after lifting luggage",
    }),
  });

  assert(regPatientRes.status === 201, `Patient registered successfully with HTTP 201`);
  assert(
    typeof regPatientRes.data?.patient_number === "string" && /^PDC-\d{6}$/.test(regPatientRes.data.patient_number),
    `Patient assigned project format patient_number: '${regPatientRes.data?.patient_number}'`
  );
  assert(
    regPatientRes.data?.created_by_id === receptionistSession.userId,
    `Audit trail records created_by_id = ${receptionistSession.userId} (Receptionist)`
  );
  const patientNumber = regPatientRes.data.patient_number;

  // STEP 2: FIND PATIENT IN ACTIVE DIRECTORY
  console.log("\n--- STEP 2: FIND PATIENT IN ACTIVE DIRECTORY ---");
  const searchRes = await request(`${BASE_URL}/api/patients/?search=${patientPhone}&is_active=true`, {
    headers: receptionistHeaders,
  });
  assert(searchRes.status === 200 && Array.isArray(searchRes.data), `Active patient directory returned HTTP 200`);
  const foundInDir = searchRes.data.find((p: any) => p.patient_number === patientNumber);
  assert(Boolean(foundInDir), `Patient ${patientNumber} found in active directory search`);
  assert(
    foundInDir && !("id" in foundInDir),
    `Critical contract separation: Patient directory listing correctly omits internal integer DB 'id'`
  );

  // STEP 3: RETRIEVE PATIENT DETAILS & OBTAIN INTERNAL INTEGER ID
  console.log("\n--- STEP 3: RETRIEVE PATIENT DETAILS & RESOLVE INTEGER DB ID ---");
  const detailRes = await request(`${BASE_URL}/api/patients/${patientNumber}`, {
    headers: receptionistHeaders,
  });
  assert(detailRes.status === 200, `Patient detail endpoint returned HTTP 200`);
  assert(
    Number.isInteger(detailRes.data?.id) && detailRes.data.id > 0,
    `Resolved internal database integer ID: ${detailRes.data?.id} (type: ${typeof detailRes.data?.id})`
  );
  const patientDbId: number = detailRes.data.id;

  // Critical assertion: verify patient_number cannot be passed as patient_id
  const invalidIdAttempt = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientNumber as any,
      provider_id: "RS5956",
      start_time: new Date(Date.now() + 86400000).toISOString(),
      end_time: new Date(Date.now() + 86400000 + 1800000).toISOString(),
      reason_for_visit: "Test invalid patient_id type",
    }),
  });
  assert(
    invalidIdAttempt.status === 422,
    `Type safety assertion: Passing string patient_number ('${patientNumber}') as patient_id rejected with HTTP 422 Unprocessable Entity`
  );

  // STEP 4: BOOK AN APPOINTMENT WITH ACTIVE PROVIDER (RS5956)
  console.log("\n--- STEP 4: BOOK APPOINTMENT WITH ACTIVE PROVIDER ---");
  const apptStart = new Date(Date.now() + 86400000 * 8).toISOString().replace(/\.\d{3}Z$/, "Z");
  const apptEnd = new Date(Date.now() + 86400000 * 8 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const bookRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: "RS5956",
      start_time: apptStart,
      end_time: apptEnd,
      reason_for_visit: "Spinal evaluation and pain management consultation",
    }),
  });
  assert(bookRes.status === 201, `Appointment successfully created with HTTP 201`);
  assert(Number.isInteger(bookRes.data?.id), `Created appointment ID: ${bookRes.data?.id}`);
  assert(bookRes.data?.patient_id === patientDbId, `Appointment correctly bound to patient_id = ${patientDbId}`);
  assert(bookRes.data?.provider?.doc_number === "RS5956", `Appointment correctly bound to provider doc_number = 'RS5956'`);
  assert(bookRes.data?.status === "scheduled", `Initial appointment status defaults to 'scheduled'`);
  const appointmentId: number = bookRes.data.id;

  // STEP 5: RETRIEVE APPOINTMENT & VERIFY RELATIONSHIPS (INCLUDING ENRICHED PATIENT DATA)
  console.log("\n--- STEP 5: RETRIEVE APPOINTMENT & VERIFY RELATIONSHIPS ---");
  const getApptRes = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    headers: doctorHeaders,
  });
  assert(getApptRes.status === 200, `Doctor retrieved appointment with HTTP 200`);
  assert(getApptRes.data?.patient_id === patientDbId, `Verified patient relationship: patient_id = ${patientDbId}`);
  assert(getApptRes.data?.patient?.name === "Debashis Banerjee", `Verified patient name enriched in appointment: 'Debashis Banerjee'`);
  assert(getApptRes.data?.patient?.patient_number === patientNumber, `Verified patient number enriched in appointment: '${patientNumber}'`);
  assert(getApptRes.data?.provider?.doc_number === "RS5956", `Verified provider relationship: doc_number = 'RS5956'`);
  assert(getApptRes.data?.provider?.name === "Dr. Rahul sharma", `Verified provider name = 'Dr. Rahul sharma'`);

  // STEP 6: ADVANCE CONSULTATION THROUGH VALID LIFECYCLE
  console.log("\n--- STEP 6: ADVANCE CONSULTATION LIFECYCLE ---");
  const confirmRes = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "confirmed" }),
  });
  assert(confirmRes.status === 200 && confirmRes.data?.status === "confirmed", "Transition 1: 'scheduled' -> 'confirmed' succeeded");

  const checkInRes = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "checked_in" }),
  });
  assert(checkInRes.status === 200 && checkInRes.data?.status === "checked_in", "Transition 2: 'confirmed' -> 'checked_in' succeeded");

  const clinicalNote = "Lumbosacral strain confirmed on physical examination. Prescribed Aceclofenac + Paracetamol, physical therapy referral.";
  const inProgressRes = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({
      status: "in_progress",
      internal_notes: clinicalNote,
    }),
  });
  assert(inProgressRes.status === 200 && inProgressRes.data?.status === "in_progress", "Transition 3: 'checked_in' -> 'in_progress' succeeded");
  assert(
    inProgressRes.data?.internal_notes === clinicalNote,
    "Clinical internal notes saved securely on consultation record"
  );

  const completeRes = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "completed" }),
  });
  assert(completeRes.status === 200 && completeRes.data?.status === "completed", "Transition 4: 'in_progress' -> 'completed' succeeded");

  // STEP 7: RETRIEVE PATIENT APPOINTMENT HISTORY
  console.log("\n--- STEP 7: RETRIEVE PATIENT APPOINTMENT HISTORY ---");
  const historyRes = await request(`${BASE_URL}/api/appointments/patient/${patientDbId}/appointments`, {
    headers: receptionistHeaders,
  });
  assert(historyRes.status === 200 && Array.isArray(historyRes.data), `Patient history endpoint returned HTTP 200`);
  const historicalAppt = historyRes.data.find((a: any) => a.id === appointmentId);
  assert(Boolean(historicalAppt), `Completed consultation ${appointmentId} present in patient's historical appointment ledger`);
  assert(historicalAppt?.status === "completed", `Historical consultation status confirmed as 'completed'`);
  assert(historicalAppt?.provider?.doc_number === "RS5956", `Historical consultation provider confirmed as 'RS5956'`);
  assert(
    historyRes.data.every((a: any) => a.patient_id === patientDbId),
    `Isolation assertion: All historical appointments strictly belong to patient_id = ${patientDbId}`
  );

  // STEP 8: DIRECT DATABASE RELATIONSHIP & INTEGRITY VERIFICATION
  console.log("\n--- STEP 8: DIRECT DATABASE STATE & RELATIONSHIP VERIFICATION ---");
  const dbData = await verifyDatabaseRecord(patientDbId, appointmentId);

  assert(dbData.patient !== null, `Database record exists in 'patients' table (ID: ${patientDbId})`);
  assert(dbData.patient?.patient_number === patientNumber, `DB patient_number matches '${patientNumber}'`);
  assert(dbData.patient?.is_active === true, `DB patient is_active = True`);
  assert(dbData.patient?.created_by_id === receptionistSession.userId, `DB patient created_by_id = ${receptionistSession.userId}`);

  assert(dbData.appointment !== null, `Database record exists in 'appointments' table (ID: ${appointmentId})`);
  assert(dbData.appointment?.patient_id === patientDbId, `DB foreign key appointment.patient_id correctly references patient.id`);
  assert(dbData.appointment?.provider_doc_number === "RS5956", `DB appointment provider references doctor 'RS5956'`);
  assert(dbData.appointment?.status === "completed", `DB appointment status permanently stored as 'completed'`);
  assert(dbData.appointment?.internal_notes === clinicalNote, `DB internal_notes preserved accurately`);
  assert(dbData.appointment?.created_by_id === receptionistSession.userId, `DB appointment created_by_id = ${receptionistSession.userId} (Receptionist)`);
  assert(dbData.appointment?.updated_by_id === doctorSession.userId, `DB appointment updated_by_id = ${doctorSession.userId} (Doctor who completed it)`);

  // ================================================================================
  // SUB-STAGE 11.3.2: PROVIDER AND DOCTOR ACCOUNT INTEGRATION
  // ================================================================================
  console.log("\n================================================================================");
  console.log("SUB-STAGE 11.3.2: PROVIDER AND DOCTOR ACCOUNT INTEGRATION");
  console.log("================================================================================");

  // STEP 9: ADMIN CREATES A PROVIDER
  console.log("\n--- STEP 9: ADMIN CREATES PROVIDER 1 ---");
  const provPhone1 = `47777${Math.floor(10000 + Math.random() * 90000)}`;
  const createProv1Res = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Vikram Seth",
      specialization: "Cardiology",
      phone: provPhone1,
      email: "vikram.seth@caredesk.com",
      post: "MD",
    }),
  });
  assert(createProv1Res.status === 201 && createProv1Res.data?.id, `Admin created Provider 1 (ID: ${createProv1Res.data?.id}, Doc: ${createProv1Res.data?.doc_number})`);
  const prov1Id = createProv1Res.data.id;
  const prov1DocNumber = createProv1Res.data.doc_number;

  // STEP 10: ADMIN PROVISIONS DOCTOR USER ACCOUNT LINKED TO PROVIDER 1
  console.log("\n--- STEP 10: ADMIN PROVISIONS DOCTOR ACCOUNT LINKED TO PROVIDER 1 ---");
  const docUserPhone = `74444${Math.floor(10000 + Math.random() * 90000)}`;
  const createDocUserRes = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      phone: docUserPhone,
      password: "VikramDoctorPass123",
      role: "DOCTOR",
      email: "vikram.seth@caredesk.com",
      provider_id: prov1Id,
    }),
  });
  assert(createDocUserRes.status === 201, `Admin created DOCTOR user account (HTTP 201)`);
  assert(createDocUserRes.data?.provider_id === prov1Id, `User response correctly reflects provider_id = ${prov1Id}`);
  assert(createDocUserRes.data?.role === "DOCTOR", `User role is DOCTOR`);
  const docUserId = createDocUserRes.data.id;

  // STEP 11: DOCTOR AUTHENTICATION & PROFILE VERIFICATION
  console.log("\n--- STEP 11: DOCTOR AUTHENTICATION & PROFILE VERIFICATION ---");
  const vikramSession = await loginUser(BASE_URL, docUserPhone, "VikramDoctorPass123", "DOCTOR");
  assert(vikramSession.role === "DOCTOR", `Doctor Vikram logged in successfully (User ID: ${vikramSession.userId})`);

  const vikramMeRes = await request(`${BASE_URL}/api/auth/me`, {
    headers: { Origin: BASE_URL, cookie: vikramSession.cookieHeader },
  });
  assert(vikramMeRes.status === 200, `/api/auth/me returned HTTP 200`);
  assert(vikramMeRes.data?.provider_id === prov1Id, `Doctor profile metadata returns provider_id = ${prov1Id}`);

  // STEP 12: RECEPTIONIST BOOKS APPOINTMENT WITH PROVIDER 1
  console.log("\n--- STEP 12: BOOK APPOINTMENT WITH PROVIDER 1 ---");
  const prov1ApptStart = new Date(Date.now() + 86400000 * 9).toISOString().replace(/\.\d{3}Z$/, "Z");
  const prov1ApptEnd = new Date(Date.now() + 86400000 * 9 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const bookProv1ApptRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: prov1DocNumber,
      start_time: prov1ApptStart,
      end_time: prov1ApptEnd,
      reason_for_visit: "Cardiac checkup and ECG reading",
    }),
  });
  assert(bookProv1ApptRes.status === 201, `Appointment booked with Provider 1 (HTTP 201, ID: ${bookProv1ApptRes.data?.id})`);
  assert(bookProv1ApptRes.data?.provider?.doc_number === prov1DocNumber, `Appointment response identifies correct provider: ${prov1DocNumber}`);
  assert(bookProv1ApptRes.data?.provider?.name === "Dr. Vikram Seth", `Appointment response identifies doctor name: 'Dr. Vikram Seth'`);
  assert(bookProv1ApptRes.data?.patient?.name === "Debashis Banerjee", `Appointment response enriches patient name: 'Debashis Banerjee'`);
  const apptProv1Id = bookProv1ApptRes.data.id;

  // STEP 13: ADMIN CREATES PROVIDER 2 AND UPDATES DOCTOR LINKAGE
  console.log("\n--- STEP 13: ADMIN REASSIGNS DOCTOR LINKAGE TO PROVIDER 2 ---");
  const provPhone2 = `46666${Math.floor(10000 + Math.random() * 90000)}`;
  const createProv2Res = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Vikram Seth (Advanced Cardiac)",
      specialization: "Interventional Cardiology",
      phone: provPhone2,
      email: "vikram.advanced@caredesk.com",
      post: "MS",
    }),
  });
  assert(createProv2Res.status === 201 && createProv2Res.data?.id, `Admin created Provider 2 (ID: ${createProv2Res.data?.id}, Doc: ${createProv2Res.data?.doc_number})`);
  const prov2Id = createProv2Res.data.id;
  const prov2DocNumber = createProv2Res.data.doc_number;

  // Reassign Doctor account to Provider 2
  const reassignRes = await request(`${BASE_URL}/api/users/${docUserId}/provider`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ provider_id: prov2Id }),
  });
  assert(reassignRes.status === 200, `Admin reassigned doctor to Provider 2 with HTTP 200`);
  assert(reassignRes.data?.provider_id === prov2Id, `Doctor user response reflects new provider_id = ${prov2Id}`);

  // Doctor session profile reflects the new provider_id
  const docProfileAfterSwitch = await request(`${BASE_URL}/api/users/${docUserId}`, {
    headers: adminHeaders,
  });
  assert(docProfileAfterSwitch.data?.provider_id === prov2Id, `Verified updated doctor record has provider_id = ${prov2Id}`);

  // STEP 14: BOOK CONSULTATION WITH NEW PROVIDER 2
  console.log("\n--- STEP 14: BOOK CONSULTATION WITH NEW PROVIDER 2 ---");
  const prov2ApptStart = new Date(Date.now() + 86400000 * 10).toISOString().replace(/\.\d{3}Z$/, "Z");
  const prov2ApptEnd = new Date(Date.now() + 86400000 * 10 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const bookProv2ApptRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: prov2DocNumber,
      start_time: prov2ApptStart,
      end_time: prov2ApptEnd,
      reason_for_visit: "Angiography review consultation",
    }),
  });
  assert(bookProv2ApptRes.status === 201, `Appointment booked with Provider 2 (HTTP 201, ID: ${bookProv2ApptRes.data?.id})`);
  assert(bookProv2ApptRes.data?.provider?.doc_number === prov2DocNumber, `New appointment correctly bound to Provider 2 (${prov2DocNumber})`);
  assert(bookProv2ApptRes.data?.provider?.name === "Dr. Vikram Seth (Advanced Cardiac)", `New appointment reflects updated provider name`);

  // STEP 15: VERIFY HISTORICAL APPOINTMENT RETAINS OLD PROVIDER
  console.log("\n--- STEP 15: VERIFY HISTORICAL AUDIT CONTINUITY ---");
  const checkOldAppt = await request(`${BASE_URL}/api/appointments/${apptProv1Id}`, {
    headers: adminHeaders,
  });
  assert(
    checkOldAppt.data?.provider?.doc_number === prov1DocNumber,
    `Historical appointment ${apptProv1Id} permanently retains Provider 1 (${prov1DocNumber}) without stale mutation`
  );

  // STEP 16: INACTIVE PROVIDER EDGE CASE
  console.log("\n--- STEP 16: INACTIVE PROVIDER EDGE CASE ---");
  // Deactivate Provider 1
  const deactProv1Res = await request(`${BASE_URL}/api/providers/${prov1DocNumber}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert(deactProv1Res.status === 200 && deactProv1Res.data?.is_active === false, `Provider 1 (${prov1DocNumber}) deactivated`);

  // Attempting to book a new appointment with inactive Provider 1 must fail
  const blockedProvBooking = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: prov1DocNumber,
      start_time: new Date(Date.now() + 86400000 * 11).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 11 + 1800000).toISOString(),
      reason_for_visit: "Attempted consultation with inactive provider",
    }),
  });
  assert(
    blockedProvBooking.status === 404 && blockedProvBooking.data?.detail?.toLowerCase().includes("inactive"),
    `Booking blocked on inactive provider with HTTP 404 ("${blockedProvBooking.data?.detail}")`
  );

  // Reactivate Provider 1
  const reactProv1Res = await request(`${BASE_URL}/api/providers/${prov1DocNumber}/reactivate`, {
    method: "PATCH",
    headers: adminHeaders,
  });
  assert(reactProv1Res.status === 200 && reactProv1Res.data?.is_active === true, `Provider 1 (${prov1DocNumber}) reactivated`);

  // Booking with reactivated provider now succeeds
  const restoredProvBooking = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: prov1DocNumber,
      start_time: new Date(Date.now() + 86400000 * 11).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 11 + 1800000).toISOString(),
      reason_for_visit: "Restored consultation with reactivated provider",
    }),
  });
  assert(restoredProvBooking.status === 201 && restoredProvBooking.data?.id, `Appointment booking successfully restored for reactivated provider`);

  // ================================================================================
  // SUB-STAGE 11.3.3: PATIENT LIFECYCLE INTEGRATION (DEACTIVATION, ARCHIVING, RESTORATION)
  // ================================================================================
  console.log("\n================================================================================");
  console.log("SUB-STAGE 11.3.3: PATIENT LIFECYCLE INTEGRATION");
  console.log("================================================================================");

  // STEP 17: REGISTER A NEW PATIENT FOR LIFECYCLE VERIFICATION
  console.log("\n--- STEP 17: REGISTER PATIENT FOR LIFECYCLE TESTS ---");
  const lcPatientPhone = `63333${Math.floor(10000 + Math.random() * 90000)}`;
  const regLcPatientRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Kalyani Mukherjee",
      phone: lcPatientPhone,
      gender: "Female",
      dob: "1975-08-14",
      address: "15 Ballygunge Circular Road, Kolkata",
      chief_complaint: "Routine cardiac and blood pressure evaluation",
    }),
  });
  assert(regLcPatientRes.status === 201, `Receptionist registered patient (HTTP 201, Number: ${regLcPatientRes.data?.patient_number})`);
  const lcPatientNumber = regLcPatientRes.data.patient_number;

  const lcDetailRes = await request(`${BASE_URL}/api/patients/${lcPatientNumber}`, { headers: receptionistHeaders });
  assert(lcDetailRes.status === 200 && lcDetailRes.data?.id, `Resolved patient integer DB ID: ${lcDetailRes.data?.id}`);
  const lcPatientDbId: number = lcDetailRes.data.id;

  // STEP 18: BOOK AND COMPLETE CONSULTATION 1 PRIOR TO DEACTIVATION
  console.log("\n--- STEP 18: BOOK AND COMPLETE CONSULTATION 1 ---");
  const randOffset1 = 86400000 * (40 + Math.floor(Math.random() * 20)) + Math.floor(Math.random() * 3600000);
  const lcAppt1Start = new Date(Date.now() + randOffset1).toISOString().replace(/\.\d{3}Z$/, "Z");
  const lcAppt1End = new Date(Date.now() + randOffset1 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const bookLcAppt1Res = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: lcPatientDbId,
      provider_id: "RS5956",
      start_time: lcAppt1Start,
      end_time: lcAppt1End,
      reason_for_visit: "Baseline cardiac consultation",
    }),
  });
  assert(bookLcAppt1Res.status === 201 && bookLcAppt1Res.data?.id, `Booked consultation 1 (ID: ${bookLcAppt1Res.data?.id})`);
  const lcAppt1Id = bookLcAppt1Res.data.id;

  // Advance lifecycle to completed
  await request(`${BASE_URL}/api/appointments/${lcAppt1Id}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "confirmed" }),
  });
  await request(`${BASE_URL}/api/appointments/${lcAppt1Id}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "checked_in" }),
  });
  await request(`${BASE_URL}/api/appointments/${lcAppt1Id}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({
      status: "in_progress",
      internal_notes: "BP 130/85 mmHg. ECG normal sinus rhythm. Prescribed Telmisartan 40mg.",
    }),
  });
  const completeLcApptRes = await request(`${BASE_URL}/api/appointments/${lcAppt1Id}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "completed" }),
  });
  assert(completeLcApptRes.status === 200 && completeLcApptRes.data?.status === "completed", "Consultation 1 completed successfully");

  // STEP 19: RECEPTIONIST SOFT-DELETES/DEACTIVATES PATIENT
  console.log("\n--- STEP 19: DEACTIVATE PATIENT ---");
  const deactPatRes = await request(`${BASE_URL}/api/patients/${lcPatientNumber}`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(deactPatRes.status === 200, `Patient ${lcPatientNumber} deactivated by Receptionist with HTTP 200`);
  assert(deactPatRes.data?.status === "inactive", `Deactivation response confirms status: 'inactive'`);

  // STEP 20: ACTIVE DIRECTORY CONTRACT SEPARATION
  console.log("\n--- STEP 20: VERIFY EXCLUSION FROM ACTIVE DIRECTORY ---");
  const activeDirCheck = await request(`${BASE_URL}/api/patients/?search=${lcPatientPhone}&is_active=true`, {
    headers: receptionistHeaders,
  });
  assert(activeDirCheck.status === 200, `Active directory query returned HTTP 200`);
  const foundInActive = activeDirCheck.data?.find((p: any) => p.patient_number === lcPatientNumber);
  assert(!foundInActive, `Deactivated patient ${lcPatientNumber} is strictly absent from active patient directory`);

  // STEP 21: INACTIVE DIRECTORY & RBAC ENFORCEMENT
  console.log("\n--- STEP 21: VERIFY INACTIVE DIRECTORY DISCOVERABILITY & RBAC ---");
  const inactiveDirRecept = await request(`${BASE_URL}/api/patients/?is_active=false&limit=100`, {
    headers: receptionistHeaders,
  });
  assert(inactiveDirRecept.status === 200, `Receptionist accessed inactive directory (HTTP 200)`);
  const foundInInactive = inactiveDirRecept.data?.find((p: any) => p.patient_number === lcPatientNumber);
  assert(Boolean(foundInInactive), `Deactivated patient ${lcPatientNumber} discoverable in inactive archive`);

  const inactiveDirAdmin = await request(`${BASE_URL}/api/patients/?is_active=false&limit=100`, {
    headers: adminHeaders,
  });
  assert(inactiveDirAdmin.status === 200, `Admin accessed inactive directory (HTTP 200)`);
  assert(
    inactiveDirAdmin.data?.some((p: any) => p.patient_number === lcPatientNumber),
    `Deactivated patient discoverable in Admin inactive archive`
  );

  // Doctor is strictly forbidden from querying inactive patient directory
  const inactiveDirDoc = await request(`${BASE_URL}/api/patients/?is_active=false`, {
    headers: doctorHeaders,
  });
  assert(
    inactiveDirDoc.status === 403,
    `RBAC Guard: Doctor querying inactive patient directory rejected with HTTP 403 Forbidden`
  );

  // STEP 22: HISTORICAL APPOINTMENT RECORD PRESERVATION
  console.log("\n--- STEP 22: VERIFY HISTORICAL APPOINTMENT INTEGRITY ---");
  // 22a. Direct appointment query preserves all clinical details during patient deactivation
  const directApptDuringDeact = await request(`${BASE_URL}/api/appointments/${lcAppt1Id}`, {
    headers: receptionistHeaders,
  });
  assert(directApptDuringDeact.status === 200, `Direct consultation query returned HTTP 200 during patient deactivation`);
  assert(directApptDuringDeact.data?.id === lcAppt1Id, `Historical consultation ${lcAppt1Id} preserved during patient deactivation`);
  assert(directApptDuringDeact.data?.status === "completed", `Historical consultation status intact ('completed')`);
  assert(
    directApptDuringDeact.data?.internal_notes?.includes("Telmisartan"),
    `Historical clinical notes intact after deactivation`
  );

  // 22b. Patient appointment list returns empty list for deactivated patient per backend safety contract
  const historyDuringDeact = await request(`${BASE_URL}/api/appointments/patient/${lcPatientDbId}/appointments`, {
    headers: receptionistHeaders,
  });
  assert(
    historyDuringDeact.status === 200 && Array.isArray(historyDuringDeact.data) && historyDuringDeact.data.length === 0,
    `Patient appointment history safely returns empty list for inactive patient per backend contract`
  );

  // STEP 23: BOOKING BLOCKED FOR DEACTIVATED PATIENT
  console.log("\n--- STEP 23: VERIFY BOOKING BLOCKED FOR INACTIVE PATIENT ---");
  const blockedBookingAttempt = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: lcPatientDbId,
      provider_id: "RS5956",
      start_time: new Date(Date.now() + 86400000 * 13).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 13 + 1800000).toISOString(),
      reason_for_visit: "Attempted consultation on deactivated patient",
    }),
  });
  assert(
    blockedBookingAttempt.status === 404 && blockedBookingAttempt.data?.detail?.toLowerCase().includes("inactive"),
    `Appointment booking on deactivated patient blocked with HTTP 404 ("${blockedBookingAttempt.data?.detail}")`
  );

  // STEP 24: RECEPTIONIST REACTIVATES PATIENT
  console.log("\n--- STEP 24: REACTIVATE PATIENT ---");
  const reactPatRes = await request(`${BASE_URL}/api/patients/${lcPatientNumber}/reactivate`, {
    method: "PATCH",
    headers: receptionistHeaders,
  });
  assert(reactPatRes.status === 200, `Patient ${lcPatientNumber} reactivated with HTTP 200`);
  assert(reactPatRes.data?.is_active === true, `Patient response confirms is_active = True`);

  // STEP 25: DIRECTORY RECONCILIATION AFTER REACTIVATION
  console.log("\n--- STEP 25: DIRECTORY RECONCILIATION AFTER REACTIVATION ---");
  const activeDirAfterReact = await request(`${BASE_URL}/api/patients/?search=${lcPatientPhone}&is_active=true`, {
    headers: receptionistHeaders,
  });
  assert(
    activeDirAfterReact.status === 200 && activeDirAfterReact.data?.some((p: any) => p.patient_number === lcPatientNumber),
    `Patient ${lcPatientNumber} restored to active directory`
  );

  const inactiveDirAfterReact = await request(`${BASE_URL}/api/patients/?is_active=false`, {
    headers: receptionistHeaders,
  });
  assert(
    inactiveDirAfterReact.status === 200 && !inactiveDirAfterReact.data?.some((p: any) => p.patient_number === lcPatientNumber),
    `Patient ${lcPatientNumber} removed from inactive archive`
  );

  // STEP 26: BOOK CONSULTATION 2 FOR RESTORED PATIENT
  console.log("\n--- STEP 26: BOOK CONSULTATION 2 FOR RESTORED PATIENT ---");
  const randOffset2 = 86400000 * (70 + Math.floor(Math.random() * 20)) + Math.floor(Math.random() * 3600000);
  const lcAppt2Start = new Date(Date.now() + randOffset2).toISOString().replace(/\.\d{3}Z$/, "Z");
  const lcAppt2End = new Date(Date.now() + randOffset2 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const bookLcAppt2Res = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: lcPatientDbId,
      provider_id: "RS5956",
      start_time: lcAppt2Start,
      end_time: lcAppt2End,
      reason_for_visit: "Post-restoration follow-up consultation",
    }),
  });
  assert(bookLcAppt2Res.status === 201 && bookLcAppt2Res.data?.id, `Consultation 2 successfully booked for restored patient (ID: ${bookLcAppt2Res.data?.id})`);
  assert(bookLcAppt2Res.data?.patient?.name === "Kalyani Mukherjee", `Appointment enriches restored patient name: 'Kalyani Mukherjee'`);
  const lcAppt2Id = bookLcAppt2Res.data.id;

  // Verify patient appointment ledger now returns both pre-deactivation and post-reactivation appointments
  const historyAfterReact = await request(`${BASE_URL}/api/appointments/patient/${lcPatientDbId}/appointments`, {
    headers: receptionistHeaders,
  });
  assert(historyAfterReact.status === 200 && Array.isArray(historyAfterReact.data), `Restored patient appointment ledger returned HTTP 200`);
  assert(
    historyAfterReact.data.some((a: any) => a.id === lcAppt1Id) && historyAfterReact.data.some((a: any) => a.id === lcAppt2Id),
    `Restored patient appointment ledger returns both Consultation 1 (${lcAppt1Id}) and Consultation 2 (${lcAppt2Id})`
  );

  // STEP 27: DIRECT DB VERIFICATION FOR PATIENT LIFECYCLE
  console.log("\n--- STEP 27: DIRECT DATABASE STATE & AUDIT FOR PATIENT LIFECYCLE ---");
  const patDbData = await verifyPatientDatabaseRecord(lcPatientDbId);
  assert(patDbData.patient !== null, `Patient record exists in DB (ID: ${lcPatientDbId})`);
  assert(patDbData.patient?.is_active === true, `DB patient is_active = True`);
  assert(patDbData.patient?.created_by_id === receptionistSession.userId, `DB patient created_by_id = ${receptionistSession.userId}`);
  assert(patDbData.patient?.updated_by_id === receptionistSession.userId, `DB patient updated_by_id = ${receptionistSession.userId} (Receptionist reactivator)`);
  assert(patDbData.appointment_count === 2, `DB confirms patient has exactly 2 appointments (pre-deactivation & post-reactivation)`);
  assert(
    patDbData.appointment_ids.includes(lcAppt1Id) && patDbData.appointment_ids.includes(lcAppt2Id),
    `DB confirms both appointment IDs [${lcAppt1Id}, ${lcAppt2Id}] permanently associated with patient`
  );

  // ================================================================================
  // SUB-STAGE 11.3.4: STAFF LIFECYCLE & CREDENTIAL RECOVERY
  // ================================================================================
  console.log("\n================================================================================");
  console.log("SUB-STAGE 11.3.4: STAFF LIFECYCLE & CREDENTIAL RECOVERY");
  console.log("================================================================================");

  // STEP 28: ADMIN PROVISIONS A DOCTOR STAFF ACCOUNT
  console.log("\n--- STEP 28: ADMIN PROVISIONS DOCTOR ACCOUNT ---");
  const staffProvPhone = `45555${Math.floor(10000 + Math.random() * 90000)}`;
  const createStaffProv = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Meenakshi Sundaram",
      specialization: "Neurology",
      phone: staffProvPhone,
      email: "meenakshi.s@caredesk.com",
      post: "MD",
    }),
  });
  assert(createStaffProv.status === 201 && createStaffProv.data?.id, `Provider created (Doc: ${createStaffProv.data?.doc_number})`);
  const staffProvId = createStaffProv.data.id;

  const staffUserPhone = `75555${Math.floor(10000 + Math.random() * 90000)}`;
  const createStaffUser = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      phone: staffUserPhone,
      password: "DoctorSecurePass123",
      role: "DOCTOR",
      email: "meenakshi.s@caredesk.com",
      provider_id: staffProvId,
    }),
  });
  assert(createStaffUser.status === 201, `Admin created DOCTOR user (HTTP 201)`);
  const staffUserId = createStaffUser.data.id;

  // STEP 29: DOCTOR AUTHENTICATION & SESSION ACQUISITION
  console.log("\n--- STEP 29: DOCTOR AUTHENTICATES & CONFIRMS PROFILE ---");
  const meenakshiSession = await loginUser(BASE_URL, staffUserPhone, "DoctorSecurePass123", "DOCTOR");
  assert(meenakshiSession.role === "DOCTOR", `Doctor Meenakshi logged in (User ID: ${meenakshiSession.userId})`);

  const meenakshiMeRes = await request(`${BASE_URL}/api/auth/me`, {
    headers: { Origin: BASE_URL, cookie: meenakshiSession.cookieHeader },
  });
  assert(meenakshiMeRes.status === 200 && meenakshiMeRes.data?.provider_id === staffProvId, `Doctor profile confirms provider_id = ${staffProvId}`);

  // STEP 30: ADMIN DEACTIVATES DOCTOR ACCOUNT
  console.log("\n--- STEP 30: ADMIN DEACTIVATES DOCTOR ACCOUNT ---");
  const deactStaffRes = await request(`${BASE_URL}/api/users/${staffUserId}/deactivate`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert(deactStaffRes.status === 200, `Admin deactivated staff user ${staffUserId} with HTTP 200`);
  assert(deactStaffRes.data?.is_active === false, `Staff response confirms is_active = False`);

  // STEP 31: CREDENTIAL LOCKOUT ON AUTHENTICATION
  console.log("\n--- STEP 31: VERIFY LOGIN BLOCKED FOR DEACTIVATED STAFF ---");
  const blockedLoginRes = await request(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ phone: staffUserPhone, password: "DoctorSecurePass123" }),
  });
  assert(blockedLoginRes.status === 401, `Deactivated staff login rejected with HTTP 401 Unauthorized`);

  // STEP 32: IN-FLIGHT SESSION TOKEN REVOCATION
  console.log("\n--- STEP 32: VERIFY IN-FLIGHT TOKEN REVOCATION ---");
  const inFlightRes = await request(`${BASE_URL}/api/auth/me`, {
    headers: { Origin: BASE_URL, cookie: meenakshiSession.cookieHeader },
  });
  assert(
    inFlightRes.status === 401 || inFlightRes.status === 403,
    `In-flight session token immediately rejected on protected endpoint (HTTP ${inFlightRes.status})`
  );

  // STEP 33: ROLE HIERARCHY & SELF-DEACTIVATION DEFENSES
  console.log("\n--- STEP 33: VERIFY HIERARCHY & SELF-DEACTIVATION DEFENSES ---");
  // Self-deactivation lock
  const selfDeactAttempt = await request(`${BASE_URL}/api/users/${adminSession.userId}/deactivate`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert(selfDeactAttempt.status === 400, `Admin self-deactivation blocked with HTTP 400 ("${selfDeactAttempt.data?.detail}")`);

  // Receptionist attempting to deactivate Admin
  const receptDeactAdmin = await request(`${BASE_URL}/api/users/${adminSession.userId}/deactivate`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(receptDeactAdmin.status === 403, `Receptionist blocked from deactivating Admin with HTTP 403 Forbidden`);

  // Receptionist attempting to reactivate Admin
  const receptReactAdmin = await request(`${BASE_URL}/api/users/${adminSession.userId}/reactivate`, {
    method: "POST",
    headers: receptionistHeaders,
  });
  assert(receptReactAdmin.status === 403, `Receptionist blocked from reactivating Admin with HTTP 403 Forbidden`);

  // STEP 34: ADMIN REACTIVATES DOCTOR ACCOUNT
  console.log("\n--- STEP 34: ADMIN REACTIVATES DOCTOR ACCOUNT ---");
  const reactStaffRes = await request(`${BASE_URL}/api/users/${staffUserId}/reactivate`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert(reactStaffRes.status === 200, `Admin reactivated staff user ${staffUserId} with HTTP 200`);
  assert(reactStaffRes.data?.is_active === true, `Staff response confirms is_active = True`);

  // STEP 35: RESTORED LOGIN & UNCHANGED LINKAGE
  console.log("\n--- STEP 35: RESTORED LOGIN & CREDENTIAL VERIFICATION ---");
  const restoredDoctorSession = await loginUser(BASE_URL, staffUserPhone, "DoctorSecurePass123", "DOCTOR");
  assert(restoredDoctorSession.role === "DOCTOR", `Doctor successfully logged in after reactivation`);

  const restoredMeRes = await request(`${BASE_URL}/api/auth/me`, {
    headers: { Origin: BASE_URL, cookie: restoredDoctorSession.cookieHeader },
  });
  assert(restoredMeRes.status === 200, `/api/auth/me returned HTTP 200`);
  assert(restoredMeRes.data?.provider_id === staffProvId, `Doctor provider linkage intact: provider_id = ${staffProvId}`);
  assert(restoredMeRes.data?.role === "DOCTOR", `Doctor role intact: 'DOCTOR'`);

  // STEP 36: DIRECT DB STATE VERIFICATION FOR STAFF
  console.log("\n--- STEP 36: DIRECT DATABASE VERIFICATION FOR STAFF ACCOUNT ---");
  const staffDbData = await verifyUserDatabaseRecord(staffUserId);
  assert(staffDbData.user !== null, `Staff user exists in DB (ID: ${staffUserId})`);
  assert(staffDbData.user?.is_active === true, `DB staff user is_active = True`);
  assert(staffDbData.user?.role === "DOCTOR", `DB staff role = 'DOCTOR'`);
  assert(staffDbData.user?.provider_id === staffProvId, `DB staff provider_id = ${staffProvId}`);

  // ================================================================================
  // SUB-STAGE 11.3.5: CROSS-DOMAIN FAILURE SCENARIOS & BOUNDARY DEFENSE
  // ================================================================================
  console.log("\n================================================================================");
  console.log("SUB-STAGE 11.3.5: CROSS-DOMAIN FAILURE SCENARIOS & BOUNDARY DEFENSE");
  console.log("================================================================================");

  // STEP 37: BOOK APPOINTMENT WITH NONEXISTENT PATIENT ID
  console.log("\n--- STEP 37: NONEXISTENT PATIENT ID BOOKING REJECTION ---");
  const nonExistentPatientBooking = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: 999999,
      provider_id: "RS5956",
      start_time: new Date(Date.now() + 86400000 * 20).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 20 + 1800000).toISOString(),
      reason_for_visit: "Test nonexistent patient rejection",
    }),
  });
  assert(
    nonExistentPatientBooking.status === 404 && nonExistentPatientBooking.data?.detail?.toLowerCase().includes("patient"),
    `Nonexistent patient ID rejected with HTTP 404 ("${nonExistentPatientBooking.data?.detail}")`
  );

  // STEP 38: BOOK APPOINTMENT WITH NONEXISTENT PROVIDER CODE
  console.log("\n--- STEP 38: NONEXISTENT PROVIDER CODE BOOKING REJECTION ---");
  const nonExistentProviderBooking = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: "ZZ9999",
      start_time: new Date(Date.now() + 86400000 * 20).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 20 + 1800000).toISOString(),
      reason_for_visit: "Test nonexistent provider rejection",
    }),
  });
  assert(
    nonExistentProviderBooking.status === 404 && nonExistentProviderBooking.data?.detail?.toLowerCase().includes("provider"),
    `Nonexistent provider code rejected with HTTP 404 ("${nonExistentProviderBooking.data?.detail}")`
  );

  // STEP 39: REACTIVATE ALREADY ACTIVE PATIENT
  console.log("\n--- STEP 39: REACTIVATE ALREADY ACTIVE PATIENT REJECTION ---");
  const reactAlreadyActivePat = await request(`${BASE_URL}/api/patients/${patientNumber}/reactivate`, {
    method: "PATCH",
    headers: receptionistHeaders,
  });
  assert(
    reactAlreadyActivePat.status === 404,
    `Reactivating already active patient (${patientNumber}) rejected with HTTP 404`
  );

  // STEP 40: SOFT-DELETE ALREADY INACTIVE PATIENT
  console.log("\n--- STEP 40: SOFT-DELETE ALREADY INACTIVE PATIENT REJECTION ---");
  // Temporarily deactivate Kalyani to test double-deactivation
  await request(`${BASE_URL}/api/patients/${lcPatientNumber}`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  const doubleDeactPat = await request(`${BASE_URL}/api/patients/${lcPatientNumber}`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(
    doubleDeactPat.status === 404,
    `Deactivating already inactive patient (${lcPatientNumber}) rejected with HTTP 404`
  );
  // Restore Kalyani back to active
  await request(`${BASE_URL}/api/patients/${lcPatientNumber}/reactivate`, {
    method: "PATCH",
    headers: receptionistHeaders,
  });

  // STEP 41: IDEMPOTENT USER DEACTIVATION & REACTIVATION
  console.log("\n--- STEP 41: USER DEACTIVATION & REACTIVATION IDEMPOTENCY ---");
  // Reactivating already active staff user
  const reactAlreadyActiveStaff = await request(`${BASE_URL}/api/users/${staffUserId}/reactivate`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert(
    reactAlreadyActiveStaff.status === 200 && reactAlreadyActiveStaff.data?.is_active === true,
    `Reactivating already active user is idempotent and returns HTTP 200 with is_active = True`
  );

  // STEP 42: INVALID CONSULTATION STATUS TRANSITIONS
  console.log("\n--- STEP 42: INVALID CONSULTATION STATUS TRANSITION REJECTIONS ---");
  // Attempt invalid transition: completed -> scheduled
  const invalidTransition1 = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "scheduled" }),
  });
  assert(
    invalidTransition1.status === 400,
    `Invalid status transition 'completed' -> 'scheduled' rejected with HTTP 400 Bad Request`
  );

  // Attempt invalid transition: completed -> in_progress
  const invalidTransition2 = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert(
    invalidTransition2.status === 400,
    `Invalid status transition 'completed' -> 'in_progress' rejected with HTTP 400 Bad Request`
  );

  // Attempt invalid cancellation: cancel a completed appointment
  const cancelCompletedAttempt = await request(`${BASE_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "cancelled" }),
  });
  assert(
    cancelCompletedAttempt.status === 400,
    `Cancelling a completed consultation rejected with HTTP 400 Bad Request`
  );

  // STEP 43: DIRECT DATABASE STATE INTEGRITY VERIFICATION
  console.log("\n--- STEP 43: DIRECT DATABASE STATE INTEGRITY VERIFICATION ---");
  const finalDbCheck = await verifyDatabaseRecord(patientDbId, appointmentId);
  assert(
    finalDbCheck.appointment?.status === "completed",
    `Terminal state lock verified: DB appointment status remains 'completed' after invalid transitions`
  );
  assert(
    finalDbCheck.patient?.is_active === true,
    `Patient active status remains pristine in database`
  );

  console.log("\n================================================================================");
  console.log(`🎉 ALL STAGE 11.3 (11.3.1 - 11.3.5) TESTS PASSED (${passed}/${total} GREEN, 100%)!`);
  console.log("================================================================================\n");
}

runStage11Workflows().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

export {};
