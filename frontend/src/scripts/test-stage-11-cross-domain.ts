/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * STAGE 11.3: CROSS-DOMAIN WORKFLOW INTEGRATION VERIFICATION
 * 
 * Verifies end-to-end multi-domain workflows across Browser -> Next.js BFF -> FastAPI -> Database:
 * 1. Patient Care Cycle (Register -> Book -> Consult -> History)
 * 2. Clinical Onboarding Flow (Provider -> Doctor Account -> Login -> View Consultations)
 * 3. Patient Archive & Recovery (Deactivate -> Inactive Booking Block -> Reactivate -> Booking Restored)
 * 4. Staff Lifecycle & Credential Lockout (Deactivate Staff -> Login Lockout -> Reactivate -> Login Restored)
 * 5. Provider Reassignment & Audit Continuity (Linkage Switch -> Audit Preservation)
 */

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

async function runStage11CrossDomainVerification() {
  console.log("================================================================================");
  console.log("STAGE 11.3: CROSS-DOMAIN WORKFLOW INTEGRATION VERIFICATION");
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

  console.log("--- 0. AUTHENTICATING ACTORS ---");
  const adminSession = await loginUser(BASE_URL, "9999999999", "AdminPass123", "ADMIN");
  const receptionistSession = await loginUser(BASE_URL, "8888888888", "ReceptionistPass123", "RECEPTIONIST");
  const doctorSession = await loginUser(BASE_URL, "7777777777", "DoctorPass123", "DOCTOR");

  const adminHeaders = { Origin: BASE_URL, cookie: adminSession.cookieHeader, "Content-Type": "application/json" };
  const receptionistHeaders = { Origin: BASE_URL, cookie: receptionistSession.cookieHeader, "Content-Type": "application/json" };
  const doctorHeaders = { Origin: BASE_URL, cookie: doctorSession.cookieHeader, "Content-Type": "application/json" };

  // ================================================================================
  // WORKFLOW 1: COMPLETE PATIENT CARE CYCLE
  // ================================================================================
  console.log("\n--- WORKFLOW 1: COMPLETE PATIENT CARE CYCLE ---");

  // Step 1: Receptionist registers a new patient
  const patientPhone = `61111${Math.floor(10000 + Math.random() * 90000)}`;
  const regPatientRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Suresh Mukhopadhyay",
      phone: patientPhone,
      gender: "Male",
      dob: "1985-06-20",
      address: "Flat 4B, Greenfield Heights, Kolkata",
      chief_complaint: "Persistent dry cough and mild fever for 4 days",
    }),
  });
  assert(regPatientRes.status === 201, `Receptionist registered patient (HTTP 201, Number: ${regPatientRes.data?.patient_number})`);
  const patientNum = regPatientRes.data?.patient_number;

  // Step 2: Query patient details to obtain DB ID
  const patDetailRes = await request(`${BASE_URL}/api/patients/${patientNum}`, { headers: receptionistHeaders });
  assert(patDetailRes.status === 200 && patDetailRes.data?.id, `Resolved patient integer DB ID: ${patDetailRes.data?.id}`);
  const patientId = patDetailRes.data?.id;

  // Step 3: Receptionist books consultation with Doctor RS5956
  const startTime = new Date(Date.now() + 86400000 * 3).toISOString().replace(/\.\d{3}Z$/, "Z");
  const endTime = new Date(Date.now() + 86400000 * 3 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const bookApptRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientId,
      provider_id: "RS5956",
      start_time: startTime,
      end_time: endTime,
      reason_for_visit: "Clinical evaluation for respiratory symptoms",
    }),
  });
  assert(bookApptRes.status === 201 && bookApptRes.data?.id, `Receptionist booked consultation (HTTP 201, ID: ${bookApptRes.data?.id})`);
  const apptId = bookApptRes.data?.id;

  // Step 4: Doctor progresses consultation lifecycle
  // 4a. Doctor confirms appointment
  const docConfirm = await request(`${BASE_URL}/api/appointments/${apptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "confirmed" }),
  });
  assert(docConfirm.status === 200 && docConfirm.data?.status === "confirmed", "Doctor confirmed consultation (status: 'confirmed')");

  // 4b. Receptionist checks in patient upon clinic arrival
  const receptCheckIn = await request(`${BASE_URL}/api/appointments/${apptId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "checked_in" }),
  });
  assert(receptCheckIn.status === 200 && receptCheckIn.data?.status === "checked_in", "Receptionist checked in patient (status: 'checked_in')");

  // 4c. Doctor starts consultation and enters clinical notes
  const docStart = await request(`${BASE_URL}/api/appointments/${apptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({
      status: "in_progress",
      internal_notes: "Chest clear bilaterally. Prescribed Azithromycin 500mg and saline gargles.",
    }),
  });
  assert(
    docStart.status === 200 &&
    docStart.data?.status === "in_progress" &&
    docStart.data?.internal_notes?.includes("Azithromycin"),
    "Doctor started consultation and saved clinical internal notes (status: 'in_progress')"
  );

  // 4d. Doctor completes consultation
  const docComplete = await request(`${BASE_URL}/api/appointments/${apptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "completed" }),
  });
  assert(docComplete.status === 200 && docComplete.data?.status === "completed", "Doctor completed consultation (status: 'completed')");

  // Step 5: Verify consultation history on patient record
  const patApptsRes = await request(`${BASE_URL}/api/appointments/patient/${patientId}/appointments`, { headers: receptionistHeaders });
  assert(
    patApptsRes.status === 200 &&
    Array.isArray(patApptsRes.data) &&
    patApptsRes.data.some((a: any) => a.id === apptId && a.status === "completed"),
    "Consultation appears in patient's historical appointment ledger with status 'completed'"
  );

  // ================================================================================
  // WORKFLOW 2: CLINICAL ONBOARDING FLOW
  // ================================================================================
  console.log("\n--- WORKFLOW 2: CLINICAL ONBOARDING FLOW ---");

  // Step 1: Admin creates a new provider profile
  const docPhone = `48888${Math.floor(10000 + Math.random() * 90000)}`;
  const createProvRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Ananya Roy",
      specialization: "Pulmonology",
      phone: docPhone,
      email: "ananya.roy@caredesk.com",
      post: "MD",
    }),
  });
  assert(createProvRes.status === 201 && createProvRes.data?.doc_number, `Admin created provider (HTTP 201, Doc: ${createProvRes.data?.doc_number})`);
  const newDocNumber = createProvRes.data?.doc_number;
  const newProvDbId = createProvRes.data?.id;

  // Step 2: Admin provisions a new Doctor user account linked to this provider
  const doctorUserPhone = `72222${Math.floor(10000 + Math.random() * 90000)}`;
  const createDocUserRes = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      phone: doctorUserPhone,
      password: "AnanyaSecurePass123",
      role: "DOCTOR",
      email: "ananya.roy@caredesk.com",
      provider_id: newProvDbId,
    }),
  });
  assert(
    createDocUserRes.status === 201 &&
    createDocUserRes.data?.role === "DOCTOR" &&
    createDocUserRes.data?.provider_id === newProvDbId,
    `Admin provisioned DOCTOR user account linked to provider ${newProvDbId}`
  );

  // Step 3: New Doctor logs in
  const newDoctorSession = await loginUser(BASE_URL, doctorUserPhone, "AnanyaSecurePass123", "DOCTOR");
  assert(
    newDoctorSession.role === "DOCTOR",
    `Newly onboarded Doctor successfully logged in via BFF session (User ID: ${newDoctorSession.userId})`
  );

  // Step 4: Verify profile /api/auth/me returns linked provider
  const newDocMeRes = await request(`${BASE_URL}/api/auth/me`, {
    headers: { Origin: BASE_URL, cookie: newDoctorSession.cookieHeader },
  });
  assert(
    newDocMeRes.status === 200 && newDocMeRes.data?.provider_id === newProvDbId,
    `New Doctor profile returns provider_id: ${newProvDbId}`
  );

  // Step 5: Receptionist schedules a consultation with the new doctor
  const newDocStart = new Date(Date.now() + 86400000 * 4).toISOString().replace(/\.\d{3}Z$/, "Z");
  const newDocEnd = new Date(Date.now() + 86400000 * 4 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const apptForNewDoc = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientId,
      provider_id: newDocNumber,
      start_time: newDocStart,
      end_time: newDocEnd,
      reason_for_visit: "Pulmonary follow-up",
    }),
  });
  assert(apptForNewDoc.status === 201 && apptForNewDoc.data?.id, `Receptionist booked appointment for newly onboarded doctor (ID: ${apptForNewDoc.data?.id})`);

  // Step 6: New doctor retrieves appointments and confirms their consultation is present
  const newDocAppts = await request(`${BASE_URL}/api/appointments/`, {
    headers: { Origin: BASE_URL, cookie: newDoctorSession.cookieHeader },
  });
  assert(
    newDocAppts.status === 200 &&
    Array.isArray(newDocAppts.data) &&
    newDocAppts.data.some((a: any) => a.id === apptForNewDoc.data.id && a.provider?.doc_number === newDocNumber),
    "New Doctor successfully views and accesses their assigned consultations"
  );

  // ================================================================================
  // WORKFLOW 3: PATIENT ARCHIVE & RECOVERY
  // ================================================================================
  console.log("\n--- WORKFLOW 3: PATIENT ARCHIVE & RECOVERY ---");

  // Step 1: Create a test patient for lifecycle verification
  const archivePatientPhone = `62222${Math.floor(10000 + Math.random() * 90000)}`;
  const archivePatRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Tapan Sengupta",
      phone: archivePatientPhone,
      gender: "Male",
      dob: "1978-11-12",
      address: "12 Lake Road, Kolkata",
      chief_complaint: "Joint pain",
    }),
  });
  assert(archivePatRes.status === 201, `Created patient for archive lifecycle (Patient: ${archivePatRes.data?.patient_number})`);
  const archivePatNum = archivePatRes.data?.patient_number;

  const archivePatDetail = await request(`${BASE_URL}/api/patients/${archivePatNum}`, { headers: receptionistHeaders });
  const archivePatId = archivePatDetail.data?.id;

  // Step 2: Receptionist deactivates the patient
  const deactPatRes = await request(`${BASE_URL}/api/patients/${archivePatNum}`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(deactPatRes.status === 200, `Receptionist deactivated patient ${archivePatNum}`);

  // Step 3: Attempting to book appointment for deactivated patient must fail
  const blockedApptStart = new Date(Date.now() + 86400000 * 5).toISOString().replace(/\.\d{3}Z$/, "Z");
  const blockedApptEnd = new Date(Date.now() + 86400000 * 5 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const blockedBooking = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: archivePatId,
      provider_id: "RS5956",
      start_time: blockedApptStart,
      end_time: blockedApptEnd,
      reason_for_visit: "Attempted booking on inactive patient",
    }),
  });
  assert(
    blockedBooking.status === 404 && blockedBooking.data?.detail?.toLowerCase().includes("inactive"),
    `Booking blocked on deactivated patient with HTTP 404 ("${blockedBooking.data?.detail}")`
  );

  // Step 4: Discover deactivated patient in inactive directory (use limit=100 to avoid page 1 pagination cutoff)
  const inactiveDirRes = await request(`${BASE_URL}/api/patients/?is_active=false&limit=100`, { headers: receptionistHeaders });
  assert(
    inactiveDirRes.status === 200 &&
    Array.isArray(inactiveDirRes.data) &&
    inactiveDirRes.data.some((p: any) => p.patient_number === archivePatNum),
    `Deactivated patient ${archivePatNum} discovered in inactive directory filter`
  );

  // Step 5: Receptionist reactivates the patient record
  const reactPatRes = await request(`${BASE_URL}/api/patients/${archivePatNum}/reactivate`, {
    method: "PATCH",
    headers: receptionistHeaders,
  });
  assert(reactPatRes.status === 200 && reactPatRes.data?.is_active === true, `Patient ${archivePatNum} successfully reactivated`);

  // Step 6: Booking an appointment now succeeds
  const restoredBooking = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: archivePatId,
      provider_id: "RS5956",
      start_time: blockedApptStart,
      end_time: blockedApptEnd,
      reason_for_visit: "Restored consultation booking after reactivation",
    }),
  });
  assert(restoredBooking.status === 201 && restoredBooking.data?.id, `Appointment booking successfully restored for reactivated patient (ID: ${restoredBooking.data?.id})`);

  // ================================================================================
  // WORKFLOW 4: STAFF LIFECYCLE & CREDENTIAL LOCKOUT
  // ================================================================================
  console.log("\n--- WORKFLOW 4: STAFF LIFECYCLE & CREDENTIAL LOCKOUT ---");

  // Step 1: Admin provisions operational receptionist staff user
  const tempStaffPhone = `83333${Math.floor(10000 + Math.random() * 90000)}`;
  const createTempStaffRes = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      phone: tempStaffPhone,
      password: "TempPass12345",
      role: "RECEPTIONIST",
      email: "temp.staff@caredesk.com",
    }),
  });
  assert(createTempStaffRes.status === 201, `Admin created temporary staff user (ID: ${createTempStaffRes.data?.id})`);
  const tempStaffUserId = createTempStaffRes.data?.id;

  // Step 2: Temporary staff logs in successfully
  const tempStaffSession = await loginUser(BASE_URL, tempStaffPhone, "TempPass12345", "RECEPTIONIST");
  assert(tempStaffSession.role === "RECEPTIONIST", `Temporary staff logged in successfully (User ID: ${tempStaffSession.userId})`);

  // Step 3: Admin deactivates temporary staff account
  const deactStaffRes = await request(`${BASE_URL}/api/users/${tempStaffUserId}/deactivate`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert(deactStaffRes.status === 200 && deactStaffRes.data?.is_active === false, `Admin deactivated staff account ${tempStaffUserId}`);

  // Step 4: Immediate credential lockout on login
  const lockedLoginRes = await request(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ phone: tempStaffPhone, password: "TempPass12345" }),
  });
  assert(lockedLoginRes.status === 401, `Login immediately blocked for deactivated account with HTTP 401`);

  // Step 5: In-flight session token immediately rejected by backend
  const inFlightTokenRes = await request(`${BASE_URL}/api/auth/me`, {
    headers: { Origin: BASE_URL, cookie: tempStaffSession.cookieHeader },
  });
  assert(
    inFlightTokenRes.status === 401 || inFlightTokenRes.status === 403,
    `Existing in-flight session token immediately rejected for deactivated user (HTTP ${inFlightTokenRes.status})`
  );

  // Step 6: Admin reactivates staff account
  const reactStaffRes = await request(`${BASE_URL}/api/users/${tempStaffUserId}/reactivate`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert(reactStaffRes.status === 200 && reactStaffRes.data?.is_active === true, `Admin reactivated staff account ${tempStaffUserId}`);

  // Step 7: Staff user can log in again
  const restoredLoginSession = await loginUser(BASE_URL, tempStaffPhone, "TempPass12345", "RECEPTIONIST");
  assert(restoredLoginSession.role === "RECEPTIONIST", `Staff user login successfully restored after reactivation`);

  // ================================================================================
  // WORKFLOW 5: PROVIDER REASSIGNMENT & AUDIT CONTINUITY
  // ================================================================================
  console.log("\n--- WORKFLOW 5: PROVIDER REASSIGNMENT & AUDIT CONTINUITY ---");

  // Step 1: Admin creates Provider A and Provider B
  const provPhoneA = `49999${Math.floor(10000 + Math.random() * 90000)}`;
  const provPhoneB = `48888${Math.floor(10000 + Math.random() * 90000)}`;

  const provARes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ name: "Dr. Clinic Alpha", specialization: "Dermatology", phone: provPhoneA, post: "MD" }),
  });
  const provBRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ name: "Dr. Clinic Beta", specialization: "Dermatology", phone: provPhoneB, post: "MD" }),
  });
  assert(provARes.status === 201 && provBRes.status === 201, `Admin created Provider A (${provARes.data?.doc_number}) and Provider B (${provBRes.data?.doc_number})`);
  const docNumberA = provARes.data?.doc_number;
  const docNumberB = provBRes.data?.doc_number;
  const provIdA = provARes.data?.id;
  const provIdB = provBRes.data?.id;

  // Step 2: Admin provisions Doctor user linked to Provider A
  const switchDocPhone = `73333${Math.floor(10000 + Math.random() * 90000)}`;
  const switchDocUserRes = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      phone: switchDocPhone,
      password: "SwitchDoctorPass123",
      role: "DOCTOR",
      provider_id: provIdA,
    }),
  });
  assert(switchDocUserRes.status === 201 && switchDocUserRes.data?.provider_id === provIdA, `Doctor user created with initial linkage to Provider A (${provIdA})`);
  const switchDocUserId = switchDocUserRes.data?.id;

  // Step 3: Receptionist books Consultation 1 with Provider A
  const appt1Start = new Date(Date.now() + 86400000 * 6).toISOString().replace(/\.\d{3}Z$/, "Z");
  const appt1End = new Date(Date.now() + 86400000 * 6 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const appt1Res = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientId,
      provider_id: docNumberA,
      start_time: appt1Start,
      end_time: appt1End,
      reason_for_visit: "Consultation 1 with Provider A",
    }),
  });
  assert(appt1Res.status === 201 && appt1Res.data?.provider?.doc_number === docNumberA, `Consultation 1 booked with Provider A (${docNumberA})`);
  const appt1Id = appt1Res.data?.id;

  // Step 4: Admin updates Doctor user's provider linkage to Provider B
  const linkSwitchRes = await request(`${BASE_URL}/api/users/${switchDocUserId}/provider`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ provider_id: provIdB }),
  });
  assert(linkSwitchRes.status === 200 && linkSwitchRes.data?.provider_id === provIdB, `Admin successfully switched Doctor linkage to Provider B (${provIdB})`);

  // Step 5: Receptionist books Consultation 2 with Provider B
  const appt2Start = new Date(Date.now() + 86400000 * 7).toISOString().replace(/\.\d{3}Z$/, "Z");
  const appt2End = new Date(Date.now() + 86400000 * 7 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const appt2Res = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientId,
      provider_id: docNumberB,
      start_time: appt2Start,
      end_time: appt2End,
      reason_for_visit: "Consultation 2 with Provider B",
    }),
  });
  assert(appt2Res.status === 201 && appt2Res.data?.provider?.doc_number === docNumberB, `Consultation 2 booked with Provider B (${docNumberB})`);
  const appt2Id = appt2Res.data?.id;

  // Step 6: Verify historical audit continuity
  const verifyAppt1 = await request(`${BASE_URL}/api/appointments/${appt1Id}`, { headers: adminHeaders });
  const verifyAppt2 = await request(`${BASE_URL}/api/appointments/${appt2Id}`, { headers: adminHeaders });

  assert(
    verifyAppt1.data?.provider?.doc_number === docNumberA,
    `Historical integrity preserved: Consultation 1 permanently references Provider A (${docNumberA})`
  );
  assert(
    verifyAppt2.data?.provider?.doc_number === docNumberB,
    `New consultation correctly references Provider B (${docNumberB})`
  );

  // Step 7: Verify audit tracking columns (created_by_id)
  assert(
    verifyAppt1.data?.created_by_id === receptionistSession.userId,
    `Audit trail preserved: Consultation 1 created_by_id recorded Receptionist ID ${receptionistSession.userId}`
  );
  assert(
    verifyAppt2.data?.created_by_id === receptionistSession.userId,
    `Audit trail preserved: Consultation 2 created_by_id recorded Receptionist ID ${receptionistSession.userId}`
  );

  console.log("\n================================================================================");
  console.log(`🎉 ALL STAGE 11.3 CROSS-DOMAIN WORKFLOW TESTS PASSED (${passed}/${total} GREEN, 100%)!`);
  console.log("================================================================================\n");
}

runStage11CrossDomainVerification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

export {};
