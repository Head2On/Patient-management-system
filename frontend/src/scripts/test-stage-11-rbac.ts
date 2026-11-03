/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * STAGE 11.2: ROLE-BASED WORKFLOW VERIFICATION (RBAC E2E)
 * 
 * Verifies that each role (ADMIN, RECEPTIONIST, DOCTOR, UNAUTHENTICATED) can perform
 * EXACTLY the operations permitted by the backend across:
 * 1. User & Staff Domain
 * 2. Provider Domain
 * 3. Patient Domain
 * 4. Appointment Domain
 * 5. Database State Integrity
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

async function runStage11RbacVerification() {
  console.log("================================================================================");
  console.log("STAGE 11.2: ROLE-BASED WORKFLOW VERIFICATION (RBAC E2E)");
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

  console.log("--- 0. SESSION ESTABLISHMENT ---");
  const adminSession = await loginUser(BASE_URL, "9999999999", "AdminPass123", "ADMIN");
  assert(adminSession.role === "ADMIN", `Admin authenticated (User ID: ${adminSession.userId})`);

  const receptionistSession = await loginUser(BASE_URL, "8888888888", "ReceptionistPass123", "RECEPTIONIST");
  assert(receptionistSession.role === "RECEPTIONIST", `Receptionist authenticated (User ID: ${receptionistSession.userId})`);

  const doctorSession = await loginUser(BASE_URL, "7777777777", "DoctorPass123", "DOCTOR");
  assert(doctorSession.role === "DOCTOR", `Doctor authenticated (User ID: ${doctorSession.userId})`);

  const unauthHeaders = { Origin: BASE_URL };
  const adminHeaders = { Origin: BASE_URL, cookie: adminSession.cookieHeader, "Content-Type": "application/json" };
  const receptionistHeaders = { Origin: BASE_URL, cookie: receptionistSession.cookieHeader, "Content-Type": "application/json" };
  const doctorHeaders = { Origin: BASE_URL, cookie: doctorSession.cookieHeader, "Content-Type": "application/json" };

  // ================================================================================
  // 1. STAFF & USER MANAGEMENT DOMAIN
  // ================================================================================
  console.log("\n--- 1. STAFF & USER MANAGEMENT RBAC ---");

  // 1.1 View staff directory (GET /api/users/)
  const listAdmin = await request(`${BASE_URL}/api/users/`, { headers: adminHeaders });
  assert(listAdmin.status === 200 && Array.isArray(listAdmin.data), "Admin can list staff directory (HTTP 200)");

  const listRecept = await request(`${BASE_URL}/api/users/`, { headers: receptionistHeaders });
  assert(listRecept.status === 403, "Receptionist blocked from staff directory (HTTP 403)");

  const listDoctor = await request(`${BASE_URL}/api/users/`, { headers: doctorHeaders });
  assert(listDoctor.status === 403, "Doctor blocked from staff directory (HTTP 403)");

  const listUnauth = await request(`${BASE_URL}/api/users/`, { headers: unauthHeaders });
  assert(listUnauth.status === 401, "Unauthenticated blocked from staff directory (HTTP 401)");

  // 1.2 View user profiles (GET /api/users/{id})
  const viewOwnAdmin = await request(`${BASE_URL}/api/users/${adminSession.userId}`, { headers: adminHeaders });
  assert(viewOwnAdmin.status === 200 && viewOwnAdmin.data.id === adminSession.userId, "Admin can view own profile (HTTP 200)");

  const viewOtherAdmin = await request(`${BASE_URL}/api/users/${receptionistSession.userId}`, { headers: adminHeaders });
  assert(viewOtherAdmin.status === 200, "Admin can view other staff profiles (HTTP 200)");

  const viewOwnRecept = await request(`${BASE_URL}/api/users/${receptionistSession.userId}`, { headers: receptionistHeaders });
  assert(viewOwnRecept.status === 200 && viewOwnRecept.data.id === receptionistSession.userId, "Receptionist can view own profile (HTTP 200)");

  const viewAdminByRecept = await request(`${BASE_URL}/api/users/${adminSession.userId}`, { headers: receptionistHeaders });
  assert(viewAdminByRecept.status === 403, "Receptionist blocked from viewing Admin profile (HTTP 403)");

  const viewOwnDoc = await request(`${BASE_URL}/api/users/${doctorSession.userId}`, { headers: doctorHeaders });
  assert(viewOwnDoc.status === 200 && viewOwnDoc.data.id === doctorSession.userId, "Doctor can view own profile (HTTP 200)");

  const viewAdminByDoc = await request(`${BASE_URL}/api/users/${adminSession.userId}`, { headers: doctorHeaders });
  assert(viewAdminByDoc.status === 403, "Doctor blocked from viewing Admin profile (HTTP 403)");

  // 1.3 Create staff user (POST /api/users/)
  const testStaffPhone = `55555${Math.floor(10000 + Math.random() * 90000)}`;
  const createByDoc = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify({
      phone: testStaffPhone,
      password: "TestPassword123",
      role: "RECEPTIONIST",
    }),
  });
  assert(createByDoc.status === 403, "Doctor blocked from creating staff accounts (HTTP 403)");

  const createByRecept = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      phone: testStaffPhone,
      password: "TestPassword123",
      role: "RECEPTIONIST",
    }),
  });
  assert(createByRecept.status === 403, "Receptionist blocked from creating staff accounts (HTTP 403)");

  const createByAdmin = await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      phone: testStaffPhone,
      password: "TestPassword123",
      role: "RECEPTIONIST",
      email: "testtemp@caredesk.com",
    }),
  });
  assert(createByAdmin.status === 201, `Admin can create staff account (HTTP 201, ID: ${createByAdmin.data?.id})`);
  const tempUserId = createByAdmin.data?.id;

  // 1.4 Edit user profiles (PATCH /api/users/{id})
  const editOwnRecept = await request(`${BASE_URL}/api/users/${receptionistSession.userId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ email: "updated.recept@caredesk.com" }),
  });
  assert(editOwnRecept.status === 200, "Receptionist can edit own profile (HTTP 200)");

  const editAdminByRecept = await request(`${BASE_URL}/api/users/${adminSession.userId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ email: "hacked.admin@caredesk.com" }),
  });
  assert(editAdminByRecept.status === 403, "Receptionist blocked from editing Admin profile (HTTP 403)");

  const editOwnDoc = await request(`${BASE_URL}/api/users/${doctorSession.userId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ email: "updated.doctor@caredesk.com" }),
  });
  assert(editOwnDoc.status === 200, "Doctor can edit own profile (HTTP 200)");

  const editAdminByDoc = await request(`${BASE_URL}/api/users/${adminSession.userId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ email: "hacked.admin@caredesk.com" }),
  });
  assert(editAdminByDoc.status === 403, "Doctor blocked from editing Admin profile (HTTP 403)");

  // 1.5 Role elevation prevention
  const elevateByDoc = await request(`${BASE_URL}/api/users/${doctorSession.userId}/role`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ role: "ADMIN" }),
  });
  assert(elevateByDoc.status === 403, "Doctor blocked from elevating own role to ADMIN (HTTP 403)");

  const elevateByRecept = await request(`${BASE_URL}/api/users/${receptionistSession.userId}/admin`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ role: "ADMIN" }),
  });
  assert(elevateByRecept.status === 403, "Receptionist blocked from admin-endpoint elevation (HTTP 403)");

  // 1.6 Staff Lifecycle & Hierarchy (Deactivation / Reactivation)
  const selfDeactAdmin = await request(`${BASE_URL}/api/users/${adminSession.userId}/deactivate`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert(selfDeactAdmin.status === 400, "Admin blocked from deactivating own account (HTTP 400)");

  const deactAdminByRecept = await request(`${BASE_URL}/api/users/${adminSession.userId}/deactivate`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(deactAdminByRecept.status === 403, "Receptionist blocked from deactivating Admin account (HTTP 403)");

  const reactAdminByRecept = await request(`${BASE_URL}/api/users/${adminSession.userId}/reactivate`, {
    method: "POST",
    headers: receptionistHeaders,
  });
  assert(reactAdminByRecept.status === 403, "Receptionist blocked from reactivating Admin account (HTTP 403)");

  const deactByDoc = await request(`${BASE_URL}/api/users/${tempUserId}/deactivate`, {
    method: "DELETE",
    headers: doctorHeaders,
  });
  assert(deactByDoc.status === 403, "Doctor blocked from staff deactivation (HTTP 403)");

  const deactTempByRecept = await request(`${BASE_URL}/api/users/${tempUserId}/deactivate`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(deactTempByRecept.status === 200 && deactTempByRecept.data?.is_active === false, "Receptionist can deactivate operational staff (HTTP 200)");

  const reactTempByRecept = await request(`${BASE_URL}/api/users/${tempUserId}/reactivate`, {
    method: "POST",
    headers: receptionistHeaders,
  });
  assert(reactTempByRecept.status === 200 && reactTempByRecept.data?.is_active === true, "Receptionist can reactivate operational staff (HTTP 200)");

  // ================================================================================
  // 2. PROVIDER DOMAIN
  // ================================================================================
  console.log("\n--- 2. PROVIDER DOMAIN RBAC ---");

  // 2.1 Provider Directory Read (GET /api/providers/)
  const getProvAdmin = await request(`${BASE_URL}/api/providers/`, { headers: adminHeaders });
  assert(getProvAdmin.status === 200 && Array.isArray(getProvAdmin.data), "Admin can view providers list (HTTP 200)");

  const getProvRecept = await request(`${BASE_URL}/api/providers/`, { headers: receptionistHeaders });
  assert(getProvRecept.status === 200 && Array.isArray(getProvRecept.data), "Receptionist can view providers list (HTTP 200)");

  const getProvDoc = await request(`${BASE_URL}/api/providers/`, { headers: doctorHeaders });
  assert(getProvDoc.status === 200 && Array.isArray(getProvDoc.data), "Doctor can view providers list (HTTP 200)");

  const getProvUnauth = await request(`${BASE_URL}/api/providers/`, { headers: unauthHeaders });
  assert(getProvUnauth.status === 401, "Unauthenticated blocked from providers list (HTTP 401)");

  // 2.2 Provider Creation (POST /api/providers/)
  const testProvPhone = `44444${Math.floor(10000 + Math.random() * 90000)}`;
  const provCreateByRecept = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Dr. Receptionist Test",
      specialization: "General Practice",
      phone: testProvPhone,
      post: "MD",
    }),
  });
  assert(provCreateByRecept.status === 403, "Receptionist blocked from creating provider (HTTP 403)");

  const provCreateByDoc = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify({
      name: "Dr. Doctor Test",
      specialization: "Pediatrics",
      phone: testProvPhone,
      post: "MS",
    }),
  });
  assert(provCreateByDoc.status === 403, "Doctor blocked from creating provider (HTTP 403)");

  const provCreateByAdmin = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Admin Created",
      specialization: "Cardiology",
      phone: testProvPhone,
      post: "MD",
    }),
  });
  assert(provCreateByAdmin.status === 201, `Admin can create provider (HTTP 201, Doc Number: ${provCreateByAdmin.data?.doc_number})`);
  const createdDocNumber = provCreateByAdmin.data?.doc_number;

  // 2.3 Provider Update (PUT /api/providers/{doc_number})
  const provUpdateByRecept = await request(`${BASE_URL}/api/providers/${createdDocNumber}`, {
    method: "PUT",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Dr. Modified",
      specialization: "Neurology",
      phone: testProvPhone,
      post: "MD",
    }),
  });
  assert(provUpdateByRecept.status === 403, "Receptionist blocked from updating provider (HTTP 403)");

  const provUpdateByDoc = await request(`${BASE_URL}/api/providers/${createdDocNumber}`, {
    method: "PUT",
    headers: doctorHeaders,
    body: JSON.stringify({
      name: "Dr. Modified",
      specialization: "Neurology",
      phone: testProvPhone,
      post: "MD",
    }),
  });
  assert(provUpdateByDoc.status === 403, "Doctor blocked from updating provider (HTTP 403)");

  const provUpdateByAdmin = await request(`${BASE_URL}/api/providers/${createdDocNumber}`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Admin Modified",
      specialization: "Neurology",
      phone: testProvPhone,
      post: "MS",
    }),
  });
  assert(provUpdateByAdmin.status === 200, "Admin can update provider (HTTP 200)");

  // 2.4 Provider Lifecycle (DELETE & PATCH reactivate)
  const provDeactByRecept = await request(`${BASE_URL}/api/providers/${createdDocNumber}`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(provDeactByRecept.status === 403, "Receptionist blocked from deactivating provider (HTTP 403)");

  const provDeactByDoc = await request(`${BASE_URL}/api/providers/${createdDocNumber}`, {
    method: "DELETE",
    headers: doctorHeaders,
  });
  assert(provDeactByDoc.status === 403, "Doctor blocked from deactivating provider (HTTP 403)");

  const provDeactByAdmin = await request(`${BASE_URL}/api/providers/${createdDocNumber}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert(provDeactByAdmin.status === 200 && provDeactByAdmin.data?.is_active === false, "Admin can deactivate provider (HTTP 200)");

  const provReactByRecept = await request(`${BASE_URL}/api/providers/${createdDocNumber}/reactivate`, {
    method: "PATCH",
    headers: receptionistHeaders,
  });
  assert(provReactByRecept.status === 403, "Receptionist blocked from reactivating provider (HTTP 403)");

  const provReactByAdmin = await request(`${BASE_URL}/api/providers/${createdDocNumber}/reactivate`, {
    method: "PATCH",
    headers: adminHeaders,
  });
  assert(provReactByAdmin.status === 200 && provReactByAdmin.data?.is_active === true, "Admin can reactivate provider (HTTP 200)");

  // ================================================================================
  // 3. PATIENT DOMAIN
  // ================================================================================
  console.log("\n--- 3. PATIENT DOMAIN RBAC ---");

  // 3.1 Active Patient Directory Read (GET /api/patients/?is_active=true)
  const getPatientsAdmin = await request(`${BASE_URL}/api/patients/?is_active=true`, { headers: adminHeaders });
  assert(getPatientsAdmin.status === 200 && Array.isArray(getPatientsAdmin.data), "Admin can list active patients (HTTP 200)");

  const getPatientsRecept = await request(`${BASE_URL}/api/patients/?is_active=true`, { headers: receptionistHeaders });
  assert(getPatientsRecept.status === 200 && Array.isArray(getPatientsRecept.data), "Receptionist can list active patients (HTTP 200)");

  const getPatientsDoc = await request(`${BASE_URL}/api/patients/?is_active=true`, { headers: doctorHeaders });
  assert(getPatientsDoc.status === 200 && Array.isArray(getPatientsDoc.data), "Doctor can list active patients (HTTP 200)");

  // 3.2 Inactive Patient Directory Read (GET /api/patients/?is_active=false)
  const getInactiveAdmin = await request(`${BASE_URL}/api/patients/?is_active=false`, { headers: adminHeaders });
  assert(getInactiveAdmin.status === 200 && Array.isArray(getInactiveAdmin.data), "Admin can list inactive patients (HTTP 200)");

  const getInactiveRecept = await request(`${BASE_URL}/api/patients/?is_active=false`, { headers: receptionistHeaders });
  assert(getInactiveRecept.status === 200 && Array.isArray(getInactiveRecept.data), "Receptionist can list inactive patients (HTTP 200)");

  const getInactiveDoc = await request(`${BASE_URL}/api/patients/?is_active=false`, { headers: doctorHeaders });
  assert(getInactiveDoc.status === 403, "Doctor blocked from listing inactive patients (HTTP 403)");

  // 3.3 Patient Registration (POST /api/patients/)
  const testPatientPhone = `33333${Math.floor(10000 + Math.random() * 90000)}`;
  const patCreateByDoc = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify({
      name: "Patient By Doctor",
      phone: testPatientPhone,
      gender: "Male",
      dob: "1990-01-01",
      address: "123 Medical Way",
      chief_complaint: "Routine checkup",
    }),
  });
  assert(patCreateByDoc.status === 403, "Doctor blocked from creating patient (HTTP 403)");

  const patCreateByRecept = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Patient By Receptionist",
      phone: testPatientPhone,
      gender: "Female",
      dob: "1992-05-15",
      address: "456 Receptionist Ave",
      chief_complaint: "Headache and fever",
    }),
  });
  assert(patCreateByRecept.status === 201, `Receptionist can create patient (HTTP 201, Patient Number: ${patCreateByRecept.data?.patient_number})`);
  const createdPatientNumber = patCreateByRecept.data?.patient_number;

  // 3.4 Patient Update (PATCH /api/patients/{patient_number})
  const patUpdateByDoc = await request(`${BASE_URL}/api/patients/${createdPatientNumber}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ chief_complaint: "Migraine with aura" }),
  });
  assert(patUpdateByDoc.status === 403, "Doctor blocked from modifying patient demographics (HTTP 403)");

  const patUpdateByRecept = await request(`${BASE_URL}/api/patients/${createdPatientNumber}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ chief_complaint: "Severe migraine updated" }),
  });
  assert(patUpdateByRecept.status === 200, "Receptionist can update patient demographics (HTTP 200)");

  // 3.5 Patient Lifecycle (DELETE & PATCH reactivate)
  const patDeactByDoc = await request(`${BASE_URL}/api/patients/${createdPatientNumber}`, {
    method: "DELETE",
    headers: doctorHeaders,
  });
  assert(patDeactByDoc.status === 403, "Doctor blocked from deactivating patient (HTTP 403)");

  const patDeactByRecept = await request(`${BASE_URL}/api/patients/${createdPatientNumber}`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(patDeactByRecept.status === 200 && patDeactByRecept.data?.status === "inactive", "Receptionist can deactivate patient (HTTP 200)");

  const patReactByDoc = await request(`${BASE_URL}/api/patients/${createdPatientNumber}/reactivate`, {
    method: "PATCH",
    headers: doctorHeaders,
  });
  assert(patReactByDoc.status === 403, "Doctor blocked from reactivating patient (HTTP 403)");

  const patReactByRecept = await request(`${BASE_URL}/api/patients/${createdPatientNumber}/reactivate`, {
    method: "PATCH",
    headers: receptionistHeaders,
  });
  assert(patReactByRecept.status === 200 && patReactByRecept.data?.is_active === true, "Receptionist can reactivate patient (HTTP 200)");

  // ================================================================================
  // 4. APPOINTMENT DOMAIN
  // ================================================================================
  console.log("\n--- 4. APPOINTMENT DOMAIN RBAC ---");

  // 4.1 Appointment Read (GET /api/appointments/)
  const getApptsAdmin = await request(`${BASE_URL}/api/appointments/`, { headers: adminHeaders });
  assert(getApptsAdmin.status === 200 && Array.isArray(getApptsAdmin.data), "Admin can list appointments (HTTP 200)");

  const getApptsRecept = await request(`${BASE_URL}/api/appointments/`, { headers: receptionistHeaders });
  assert(getApptsRecept.status === 200 && Array.isArray(getApptsRecept.data), "Receptionist can list appointments (HTTP 200)");

  const getApptsDoc = await request(`${BASE_URL}/api/appointments/`, { headers: doctorHeaders });
  assert(getApptsDoc.status === 200 && Array.isArray(getApptsDoc.data), "Doctor can list appointments (HTTP 200)");

  // Need patient DB id and provider doc_number
  const patientDetailRes = await request(`${BASE_URL}/api/patients/${createdPatientNumber}`, { headers: adminHeaders });
  const patientDbId = patientDetailRes.data?.id;

  // 4.2 Appointment Booking (POST /api/appointments/)
  const futureStart = new Date(Date.now() + 86400000 * 2).toISOString().replace(/\.\d{3}Z$/, "Z");
  const futureEnd = new Date(Date.now() + 86400000 * 2 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const apptCreateByDoc = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: doctorHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: "RS5956",
      start_time: futureStart,
      end_time: futureEnd,
      reason_for_visit: "Doctor attempted booking",
    }),
  });
  assert(apptCreateByDoc.status === 403, "Doctor blocked from booking appointment (HTTP 403)");

  const apptCreateByRecept = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: "RS5956",
      start_time: futureStart,
      end_time: futureEnd,
      reason_for_visit: "Consultation booked by receptionist",
    }),
  });
  assert(apptCreateByRecept.status === 201, `Receptionist can book appointment (HTTP 201, ID: ${apptCreateByRecept.data?.id})`);
  const createdApptId = apptCreateByRecept.data?.id;

  // 4.3 Appointment Clinical Update & Transitions (PATCH /api/appointments/{id})
  // Doctor confirms appointment
  const docTransitionConfirm = await request(`${BASE_URL}/api/appointments/${createdApptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "confirmed" }),
  });
  assert(docTransitionConfirm.status === 200 && docTransitionConfirm.data?.status === "confirmed", "Doctor can update appointment status to 'confirmed' (HTTP 200)");

  // Doctor checks in patient
  const docTransitionCheckIn = await request(`${BASE_URL}/api/appointments/${createdApptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "checked_in" }),
  });
  assert(docTransitionCheckIn.status === 200 && docTransitionCheckIn.data?.status === "checked_in", "Doctor can update appointment status to 'checked_in' (HTTP 200)");

  // Doctor starts consultation
  const docTransitionInProgress = await request(`${BASE_URL}/api/appointments/${createdApptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "in_progress", internal_notes: "Patient in examination room 1." }),
  });
  assert(docTransitionInProgress.status === 200 && docTransitionInProgress.data?.status === "in_progress", "Doctor can start consultation ('in_progress') and add clinical notes (HTTP 200)");

  // Doctor completes consultation
  const docTransitionComplete = await request(`${BASE_URL}/api/appointments/${createdApptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "completed" }),
  });
  assert(docTransitionComplete.status === 200 && docTransitionComplete.data?.status === "completed", "Doctor can complete consultation ('completed') (HTTP 200)");

  // Receptionist attempts invalid transition on completed terminal appointment
  const invalidTransition = await request(`${BASE_URL}/api/appointments/${createdApptId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "scheduled" }),
  });
  assert(invalidTransition.status === 400, "Terminal appointment status locked against invalid transitions (HTTP 400)");

  // ================================================================================
  // 5. DATABASE STATE INTEGRITY VERIFICATION
  // ================================================================================
  console.log("\n--- 5. DATABASE STATE INTEGRITY VERIFICATION ---");

  // Verify Admin account was never deactivated or role-demoted
  const adminVerify = await request(`${BASE_URL}/api/users/${adminSession.userId}`, { headers: adminHeaders });
  assert(
    adminVerify.status === 200 && adminVerify.data?.role === "ADMIN" && adminVerify.data?.is_active === true,
    "Admin account remained active with ADMIN role throughout all malicious attempts"
  );

  // Verify Doctor account role was never elevated
  const docVerify = await request(`${BASE_URL}/api/users/${doctorSession.userId}`, { headers: doctorHeaders });
  assert(
    docVerify.status === 200 && docVerify.data?.role === "DOCTOR",
    "Doctor account role remained strictly DOCTOR"
  );

  console.log("\n================================================================================");
  console.log(`🎉 ALL STAGE 11.2 RBAC E2E TESTS PASSED (${passed}/${total} GREEN, 100%)!`);
  console.log("================================================================================\n");
}

runStage11RbacVerification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

export {};

