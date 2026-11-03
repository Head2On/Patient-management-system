/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * STAGE 11.4.2A: DUPLICATE REGISTRATION & CONCURRENT UNIQUENESS
 * 
 * Verifies validation boundaries, duplicate prevention, and concurrent integrity across:
 * Next.js Frontend BFF -> FastAPI Backend -> PostgreSQL Database
 * 
 * Tests:
 * 1. Duplicate patient phone policy (family sharing permitted)
 * 2. Duplicate patient Aadhaar (rejected via unique constraint)
 * 3. Same phone with different formatting (normalization / acceptance)
 * 4. Duplicate provider phone (rejected via DB unique constraint)
 * 5. Duplicate provider email (permitted: clinic/org email sharing)
 * 6. Reuse phone after patient deactivation (permitted)
 * 7. Reuse Aadhaar after patient deactivation (rejected: preserves identity integrity)
 * 8. Concurrent duplicate patient Aadhaar registration (Promise.all race test)
 * 9. Concurrent duplicate provider phone registration (Promise.all race test)
 * 10. Concurrent duplicate patient phone registration (Promise.all race test - family sharing)
 */

import { execSync } from "child_process";
import path from "path";
import { patientFormSchema } from "../features/patients/schemas";
import { providerFormSchema } from "../features/providers/schemas";

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

// Database helper functions using Python & SQLAlchemy
function runPythonDbQuery(pythonCode: string): any {
  const projectRoot = path.resolve(__dirname, "../../../");
  const output = execSync("python", {
    input: pythonCode,
    cwd: projectRoot,
    encoding: "utf-8",
  });
  return JSON.parse(output.trim());
}

async function queryPatientsByAadhaar(aadhaar: string): Promise<any[]> {
  const code = `
import json
from app.db.database import SessionLocal
from app.models.patient import Patient

db = SessionLocal()
try:
    patients = db.query(Patient).filter(Patient.aadhaar == "${aadhaar}").all()
    result = [
        {"id": p.id, "patient_number": p.patient_number, "name": p.name, "phone": p.phone, "aadhaar": p.aadhaar, "is_active": p.is_active}
        for p in patients
    ]
    print(json.dumps(result))
finally:
    db.close()
`;
  return runPythonDbQuery(code);
}

async function queryPatientByNumber(patientNumber: string): Promise<any> {
  const code = `
import json
from app.db.database import SessionLocal
from app.models.patient import Patient

db = SessionLocal()
try:
    p = db.query(Patient).filter(Patient.patient_number == "${patientNumber}").first()
    if p:
        res = {"id": p.id, "patient_number": p.patient_number, "name": p.name, "phone": p.phone, "aadhaar": p.aadhaar, "dob": str(p.dob), "is_active": p.is_active}
        print(json.dumps(res))
    else:
        print(json.dumps(None))
finally:
    db.close()
`;
  return runPythonDbQuery(code);
}

async function queryPatientsByPhone(phone: string): Promise<any[]> {
  const code = `
import json
from app.db.database import SessionLocal
from app.models.patient import Patient

db = SessionLocal()
try:
    patients = db.query(Patient).filter(Patient.phone == "${phone}").all()
    result = [
        {"id": p.id, "patient_number": p.patient_number, "name": p.name, "phone": p.phone, "aadhaar": p.aadhaar, "is_active": p.is_active}
        for p in patients
    ]
    print(json.dumps(result))
finally:
    db.close()
`;
  return runPythonDbQuery(code);
}

async function queryProvidersByPhone(phone: string): Promise<any[]> {
  const code = `
import json
from app.db.database import SessionLocal
from app.models.provider import Provider

db = SessionLocal()
try:
    providers = db.query(Provider).filter(Provider.phone == "${phone}").all()
    result = [
        {"id": p.id, "doc_number": p.doc_number, "name": p.name, "phone": p.phone, "email": p.email, "is_active": p.is_active}
        for p in providers
    ]
    print(json.dumps(result))
finally:
    db.close()
`;
  return runPythonDbQuery(code);
}

async function queryProvidersByEmail(email: string): Promise<any[]> {
  const code = `
import json
from app.db.database import SessionLocal
from app.models.provider import Provider

db = SessionLocal()
try:
    providers = db.query(Provider).filter(Provider.email == "${email}").all()
    result = [
        {"id": p.id, "doc_number": p.doc_number, "name": p.name, "phone": p.phone, "email": p.email, "is_active": p.is_active}
        for p in providers
    ]
    print(json.dumps(result))
finally:
    db.close()
`;
  return runPythonDbQuery(code);
}

async function runStage11BoundariesVerification() {
  console.log("================================================================================");
  console.log("STAGE 11.4.2A: DUPLICATE REGISTRATION & CONCURRENT UNIQUENESS VERIFICATION");
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

  const adminHeaders = { Origin: BASE_URL, cookie: adminSession.cookieHeader, "Content-Type": "application/json" };
  const receptionistHeaders = { Origin: BASE_URL, cookie: receptionistSession.cookieHeader, "Content-Type": "application/json" };

  console.log("✓ Admin and Receptionist sessions established\n");

  // ================================================================================
  // 1. DUPLICATE PATIENT PHONE POLICY (FAMILY SHARING)
  // ================================================================================
  console.log("================================================================================");
  console.log("1. DUPLICATE PATIENT PHONE POLICY (FAMILY SHARING)");
  console.log("================================================================================");
  const sharedFamilyPhone = `61234${Math.floor(10000 + Math.random() * 90000)}`;

  // Register Parent
  const regParentRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Ramesh Sharma (Parent)",
      phone: sharedFamilyPhone,
      gender: "Male",
      dob: "1965-02-14",
      address: "14 Sarat Bose Road, Kolkata",
      chief_complaint: "Routine health checkup",
    }),
  });
  assert(regParentRes.status === 201, `Registered first patient with phone ${sharedFamilyPhone} (HTTP 201, ${regParentRes.data?.patient_number})`);
  const parentNumber = regParentRes.data.patient_number;

  // Register Child sharing the exact same phone
  const regChildRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Rohit Sharma (Child)",
      phone: sharedFamilyPhone,
      gender: "Male",
      dob: "2008-09-22",
      address: "14 Sarat Bose Road, Kolkata",
      chief_complaint: "Seasonal allergic rhinitis",
    }),
  });
  assert(
    regChildRes.status === 201,
    `Verified policy: Registering family member with shared phone number is permitted (HTTP 201, ${regChildRes.data?.patient_number})`
  );
  const childNumber = regChildRes.data.patient_number;

  // PostgreSQL verification
  const sharedPhoneDb = await queryPatientsByPhone(sharedFamilyPhone);
  assert(
    sharedPhoneDb.length === 2,
    `PostgreSQL confirms exactly 2 distinct patients ([${parentNumber}, ${childNumber}]) share phone ${sharedFamilyPhone}`
  );

  // ================================================================================
  // 2. DUPLICATE PATIENT AADHAAR ENFORCEMENT
  // ================================================================================
  console.log("\n================================================================================");
  console.log("2. DUPLICATE PATIENT AADHAAR ENFORCEMENT (NATIONAL UNIQUE ID)");
  console.log("================================================================================");
  const uniqueAadhaar = `${Math.floor(1000 + Math.random() * 9000)}88889999`;

  // Register Patient 1 with Aadhaar
  const regAadhaarPat1 = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Sunil Gangopadhyay",
      phone: `67111${Math.floor(10000 + Math.random() * 90000)}`,
      gender: "Male",
      dob: "1970-07-10",
      aadhaar: uniqueAadhaar,
      address: "22 Gariahat Road, Kolkata",
      chief_complaint: "Joint stiffness",
    }),
  });
  assert(regAadhaarPat1.status === 201, `Registered patient with Aadhaar ${uniqueAadhaar} (HTTP 201, ${regAadhaarPat1.data?.patient_number})`);

  // Attempt to register Patient 2 with the EXACT SAME Aadhaar
  const regAadhaarPat2 = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Imposter Patient",
      phone: `67222${Math.floor(10000 + Math.random() * 90000)}`,
      gender: "Female",
      dob: "1980-01-01",
      aadhaar: uniqueAadhaar,
      address: "Unknown Address",
      chief_complaint: "Attempted duplicate Aadhaar registration",
    }),
  });
  assert(
    regAadhaarPat2.status === 400 && regAadhaarPat2.data?.detail?.toLowerCase().includes("duplicate"),
    `Duplicate Aadhaar rejected with HTTP 400 Bad Request ("${regAadhaarPat2.data?.detail}")`
  );

  // PostgreSQL verification
  const aadhaarDb = await queryPatientsByAadhaar(uniqueAadhaar);
  assert(
    aadhaarDb.length === 1,
    `PostgreSQL unique constraint verified: Exactly 1 record exists with Aadhaar ${uniqueAadhaar}`
  );

  // ================================================================================
  // 3. SAME PHONE WITH DIFFERENT FORMATTING / NORMALIZATION POLICY
  // ================================================================================
  console.log("\n================================================================================");
  console.log("3. SAME PHONE WITH DIFFERENT FORMATTING / NORMALIZATION POLICY");
  console.log("================================================================================");
  const baseDigits = `62345${Math.floor(10000 + Math.random() * 90000)}`;
  const paddedPhone = `  ${baseDigits}  `;

  // Register patient with untrimmed/padded phone directly via API
  const regPaddedPatRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Padded Phone Patient",
      phone: paddedPhone,
      gender: "Other",
      dob: "1992-05-15",
      address: "15 Park Street, Kolkata",
      chief_complaint: "Checking phone formatting handling",
    }),
  });
  assert(
    regPaddedPatRes.status === 201,
    `Direct API accepts string phone (HTTP 201, ${regPaddedPatRes.data?.patient_number})`
  );
  // Verify how backend stored it:
  console.log(`Stored phone representation: "${regPaddedPatRes.data?.phone}"`);

  // Provider phone with formatting
  const provPhoneRaw = `42111${Math.floor(10000 + Math.random() * 90000)}`;
  const regProvFormatted = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Formatting Test",
      specialization: "General Medicine",
      phone: ` ${provPhoneRaw} `,
      email: "formatting.test@caredesk.com",
      post: "MD",
    }),
  });
  assert(
    regProvFormatted.status === 201,
    `Provider registered with padded phone (Doc: ${regProvFormatted.data?.doc_number})`
  );
  assert(
    regProvFormatted.data?.doc_number.endsWith(provPhoneRaw.slice(-4)),
    `Doc number generation extracts digits correctly (${regProvFormatted.data?.doc_number} ends with ${provPhoneRaw.slice(-4)})`
  );

  // ================================================================================
  // 4. DUPLICATE PROVIDER PHONE ENFORCEMENT
  // ================================================================================
  console.log("\n================================================================================");
  console.log("4. DUPLICATE PROVIDER PHONE ENFORCEMENT");
  console.log("================================================================================");
  const provPhone = `43333${Math.floor(10000 + Math.random() * 90000)}`;

  // Admin registers Provider 1
  const regProv1 = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Sandip Das",
      specialization: "ENT",
      phone: provPhone,
      email: "sandip.das@caredesk.com",
      post: "MS",
    }),
  });
  assert(regProv1.status === 201, `Admin created Provider 1 with phone ${provPhone} (Doc: ${regProv1.data?.doc_number})`);

  // Admin attempts to register Provider 2 with the EXACT SAME phone
  const regProv2 = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Sourav Ganguly",
      specialization: "Orthopedics",
      phone: provPhone,
      email: "sourav.ortho@caredesk.com",
      post: "MS",
    }),
  });
  assert(
    regProv2.status === 400 && regProv2.data?.detail?.toLowerCase().includes("already registered"),
    `Duplicate provider phone rejected with HTTP 400 ("${regProv2.data?.detail}")`
  );

  // PostgreSQL verification
  const provPhoneDb = await queryProvidersByPhone(provPhone);
  assert(
    provPhoneDb.length === 1,
    `PostgreSQL unique constraint verified: Exactly 1 provider exists with phone ${provPhone}`
  );

  // ================================================================================
  // 4. DUPLICATE PROVIDER EMAIL POLICY (ORGANIZATION / SHARED INBOX)
  // ================================================================================
  console.log("\n================================================================================");
  console.log("4. DUPLICATE PROVIDER EMAIL POLICY (SHARED CLINIC INBOX)");
  console.log("================================================================================");
  const sharedClinicEmail = `shared.ent.clinic${Math.floor(1000 + Math.random() * 9000)}@caredesk.com`;
  const provPhoneA = `44441${Math.floor(10000 + Math.random() * 90000)}`;
  const provPhoneB = `44442${Math.floor(10000 + Math.random() * 90000)}`;

  const regProvEmailA = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Anirban Bose",
      specialization: "Ophthalmology",
      phone: provPhoneA,
      email: sharedClinicEmail,
      post: "MD",
    }),
  });
  assert(regProvEmailA.status === 201, `Provider A created with shared email (Doc: ${regProvEmailA.data?.doc_number})`);

  const regProvEmailB = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Debolina Sen",
      specialization: "Ophthalmology",
      phone: provPhoneB,
      email: sharedClinicEmail,
      post: "MD",
    }),
  });
  assert(
    regProvEmailB.status === 201,
    `Verified policy: Multiple providers can share clinical department email (HTTP 201, Doc: ${regProvEmailB.data?.doc_number})`
  );

  // PostgreSQL verification
  const provEmailDb = await queryProvidersByEmail(sharedClinicEmail);
  assert(
    provEmailDb.length === 2,
    `PostgreSQL confirms exactly 2 providers registered under shared email ${sharedClinicEmail}`
  );

  // ================================================================================
  // 5. REUSE PHONE AND AADHAAR AFTER PATIENT DEACTIVATION
  // ================================================================================
  console.log("\n================================================================================");
  console.log("5. REUSE OF IDENTIFIERS AFTER PATIENT DEACTIVATION");
  console.log("================================================================================");
  const deactPatientAadhaar = `${Math.floor(1000 + Math.random() * 9000)}77776666`;
  const deactPatientPhone = `68111${Math.floor(10000 + Math.random() * 90000)}`;

  // Step 1: Register patient
  const regDeactPatRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Aparna Sen",
      phone: deactPatientPhone,
      gender: "Female",
      dob: "1982-11-25",
      aadhaar: deactPatientAadhaar,
      address: "10 Hindusthan Park, Kolkata",
      chief_complaint: "Migraine follow-up",
    }),
  });
  assert(regDeactPatRes.status === 201, `Registered patient ${regDeactPatRes.data?.patient_number}`);
  const deactPatNumber = regDeactPatRes.data.patient_number;

  // Step 2: Deactivate patient
  const deactActionRes = await request(`${BASE_URL}/api/patients/${deactPatNumber}`, {
    method: "DELETE",
    headers: receptionistHeaders,
  });
  assert(deactActionRes.status === 200, `Deactivated patient ${deactPatNumber}`);

  // Step 3: Attempt to reuse the deactivated patient's Aadhaar for a new patient registration
  const reuseAadhaarRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "New Person Claiming Same Aadhaar",
      phone: `68222${Math.floor(10000 + Math.random() * 90000)}`,
      gender: "Female",
      dob: "1995-03-12",
      aadhaar: deactPatientAadhaar,
      address: "Some address",
      chief_complaint: "Testing Aadhaar reuse on inactive record",
    }),
  });
  assert(
    reuseAadhaarRes.status === 400 && reuseAadhaarRes.data?.detail?.toLowerCase().includes("duplicate"),
    `Aadhaar reuse blocked across deactivated records (HTTP 400: "${reuseAadhaarRes.data?.detail}") - preserves patient clinical identity`
  );

  // Step 4: Test phone reuse after patient deactivation (e.g. family member)
  const reusePhoneRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Family Member Using Same Phone",
      phone: deactPatientPhone,
      gender: "Male",
      dob: "2010-06-05",
      address: "10 Hindusthan Park, Kolkata",
      chief_complaint: "Pediatric checkup",
    }),
  });
  assert(
    reusePhoneRes.status === 201,
    `Phone reuse permitted after deactivation: family member registered with same phone (HTTP 201)`
  );

  // ================================================================================
  // 6. CONCURRENT DUPLICATE PATIENT AADHAAR REGISTRATION (RACE CONDITION DEFENSE)
  // ================================================================================
  console.log("\n================================================================================");
  console.log("6. CONCURRENT DUPLICATE AADHAAR REGISTRATION RACE TEST");
  console.log("================================================================================");
  const concurrentAadhaar = `${Math.floor(1000 + Math.random() * 9000)}55554444`;
  console.log(`Dispatching 2 simultaneous registration requests with identical Aadhaar: ${concurrentAadhaar}...`);

  const [concAadhaarRes1, concAadhaarRes2] = await Promise.all([
    request(`${BASE_URL}/api/patients/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        name: "Concurrent Applicant A",
        phone: `69111${Math.floor(10000 + Math.random() * 90000)}`,
        gender: "Male",
        dob: "1984-04-04",
        aadhaar: concurrentAadhaar,
        address: "70 Lake Gardens, Kolkata",
        chief_complaint: "Aadhaar race test A",
      }),
    }),
    request(`${BASE_URL}/api/patients/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        name: "Concurrent Applicant B",
        phone: `69222${Math.floor(10000 + Math.random() * 90000)}`,
        gender: "Female",
        dob: "1986-06-06",
        aadhaar: concurrentAadhaar,
        address: "70 Lake Gardens, Kolkata",
        chief_complaint: "Aadhaar race test B",
      }),
    }),
  ]);

  const aadhaarStatuses = [concAadhaarRes1.status, concAadhaarRes2.status].sort();
  console.log(`Concurrent Aadhaar registration responses: ${concAadhaarRes1.status} and ${concAadhaarRes2.status}`);

  assert(
    aadhaarStatuses[0] === 201 && aadhaarStatuses[1] === 400,
    `Concurrent Aadhaar uniqueness enforced: Exactly one request succeeded (201) and one rejected (400 Bad Request)`
  );

  // Verify PostgreSQL state
  const concAadhaarDb = await queryPatientsByAadhaar(concurrentAadhaar);
  assert(
    concAadhaarDb.length === 1,
    `PostgreSQL confirms exactly 1 patient committed with Aadhaar ${concurrentAadhaar}`
  );

  // ================================================================================
  // 7. CONCURRENT DUPLICATE PROVIDER PHONE REGISTRATION (RACE CONDITION DEFENSE)
  // ================================================================================
  console.log("\n================================================================================");
  console.log("7. CONCURRENT DUPLICATE PROVIDER PHONE REGISTRATION RACE TEST");
  console.log("================================================================================");
  const concurrentProvPhone = `49111${Math.floor(10000 + Math.random() * 90000)}`;
  console.log(`Dispatching 2 simultaneous registration requests with identical provider phone: ${concurrentProvPhone}...`);

  const [concProvRes1, concProvRes2] = await Promise.all([
    request(`${BASE_URL}/api/providers/`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Dr. Tanmoy Banerjee",
        specialization: "Dermatology",
        phone: concurrentProvPhone,
        email: "tanmoy.b@caredesk.com",
        post: "MD",
      }),
    }),
    request(`${BASE_URL}/api/providers/`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Dr. Trisha Banerjee",
        specialization: "Dermatology",
        phone: concurrentProvPhone,
        email: "trisha.b@caredesk.com",
        post: "MD",
      }),
    }),
  ]);

  const provPhoneStatuses = [concProvRes1.status, concProvRes2.status].sort();
  console.log(`Concurrent Provider phone registration responses: ${concProvRes1.status} and ${concProvRes2.status}`);

  assert(
    provPhoneStatuses[0] === 201 && provPhoneStatuses[1] === 400,
    `Concurrent Provider phone uniqueness enforced: Exactly one request succeeded (201) and one rejected (400 Bad Request)`
  );

  // Verify PostgreSQL state
  const concProvPhoneDb = await queryProvidersByPhone(concurrentProvPhone);
  assert(
    concProvPhoneDb.length === 1,
    `PostgreSQL confirms exactly 1 provider committed with phone ${concurrentProvPhone}`
  );

  // ================================================================================
  // 8. CONCURRENT DUPLICATE PATIENT PHONE REGISTRATION (FAMILY SHARING RACE TEST)
  // ================================================================================
  console.log("\n================================================================================");
  console.log("8. CONCURRENT DUPLICATE PATIENT PHONE REGISTRATION RACE TEST (FAMILY SHARING)");
  console.log("================================================================================");
  const concurrentPatientPhone = `63111${Math.floor(10000 + Math.random() * 90000)}`;
  console.log(`Dispatching 2 simultaneous patient registration requests with shared phone: ${concurrentPatientPhone}...`);

  const [concPatPhoneRes1, concPatPhoneRes2] = await Promise.all([
    request(`${BASE_URL}/api/patients/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        name: "Concurrent Family Member 1",
        phone: concurrentPatientPhone,
        gender: "Male",
        dob: "1975-08-12",
        address: "88 Ballygunge Circular Rd, Kolkata",
        chief_complaint: "Family share race 1",
      }),
    }),
    request(`${BASE_URL}/api/patients/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        name: "Concurrent Family Member 2",
        phone: concurrentPatientPhone,
        gender: "Female",
        dob: "1978-10-24",
        address: "88 Ballygunge Circular Rd, Kolkata",
        chief_complaint: "Family share race 2",
      }),
    }),
  ]);

  console.log(`Concurrent patient phone registration responses: ${concPatPhoneRes1.status} and ${concPatPhoneRes2.status}`);

  assert(
    concPatPhoneRes1.status === 201 && concPatPhoneRes2.status === 201,
    `Concurrent patient phone sharing permitted: Both requests succeeded (HTTP 201, [${concPatPhoneRes1.data?.patient_number}, ${concPatPhoneRes2.data?.patient_number}])`
  );

  // Verify PostgreSQL state
  const concPatPhoneDb = await queryPatientsByPhone(concurrentPatientPhone);
  assert(
    concPatPhoneDb.length === 2,
    `PostgreSQL confirms exactly 2 distinct patient records committed under shared phone ${concurrentPatientPhone}`
  );

  console.log("\n================================================================================");
  console.log(`🎉 ALL STAGE 11.4.2A DUPLICATE REGISTRATION CHECKS PASSED (${passed}/${total} GREEN, 100%)!`);
  console.log("================================================================================\n");

  // ================================================================================
  // STAGE 11.4.2B: INPUT VALIDATION BOUNDARIES (ZOD vs PYDANTIC vs DB)
  // ================================================================================
  console.log("\n================================================================================");
  console.log("STAGE 11.4.2B: INPUT VALIDATION BOUNDARIES (PATIENT & PROVIDER)");
  console.log("================================================================================\n");

  const validPatientBase = {
    name: "Valid Patient Name",
    phone: "9876543210",
    dob: "1990-01-01",
    gender: "Female" as const,
    address: "10 Elgin Road, Kolkata",
    chief_complaint: "Routine general consultation",
  };

  const validProviderBase = {
    name: "Dr. Valid Doctor",
    specialization: "General Medicine",
    phone: "9876501234",
    email: "valid.doc@caredesk.com",
    post: "MD" as const,
  };

  // ================================================================================
  // STAGE 11.4.2B: INPUT VALIDATION BOUNDARIES — PATIENT PHONE, AADHAAR & DOB
  // Direct FastAPI Bypass vs Frontend Zod Contract Parity Testing
  // ================================================================================
  console.log("\n================================================================================");
  console.log("STAGE 11.4.2B: INPUT VALIDATION BOUNDARIES (PATIENT PHONE, AADHAAR & DOB)");
  console.log("Direct API Requests Bypassing Frontend Zod vs Pydantic vs PostgreSQL");
  console.log("================================================================================\n");

  interface ParityRow {
    field: string;
    testCase: string;
    input: string;
    zodResult: "Accept" | "Reject";
    httpStatus: number;
    pydanticResult: "Accept" | "Reject (422)" | "Reject (400)";
    postgresOutcome: string;
    parity: "Match" | "Contract Gap";
  }

  const parityResults: ParityRow[] = [];

  // Helper to execute patient registration directly via API (bypassing Zod)
  async function testDirectPatientApi(testCase: string, field: string, inputVal: string, payloadOverride: Record<string, any>, expectedZod: "Accept" | "Reject") {
    const payload = {
      name: `Test ${field} ${testCase}`,
      phone: `66${Math.floor(10000000 + Math.random() * 90000000)}`,
      dob: "1990-05-15",
      gender: "Female",
      address: "15 Park Street, Kolkata",
      chief_complaint: `Contract test for ${field}`,
      ...payloadOverride,
    };

    const res = await request(`${BASE_URL}/api/patients/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify(payload),
    });

    let pydanticResult: "Accept" | "Reject (422)" | "Reject (400)" = "Accept";
    let postgresOutcome = "Not Created";

    if (res.status === 201 && res.data?.patient_number) {
      pydanticResult = "Accept";
      const dbRecord = await queryPatientByNumber(res.data.patient_number);
      if (dbRecord) {
        if (field === "phone") postgresOutcome = `Stored '${dbRecord.phone}'`;
        else if (field === "aadhaar") postgresOutcome = dbRecord.aadhaar === null ? "Stored NULL" : `Stored '${dbRecord.aadhaar}'`;
        else if (field === "dob") postgresOutcome = `Stored '${dbRecord.dob}'`;
        else postgresOutcome = `Committed (${res.data.patient_number})`;
      } else {
        postgresOutcome = "Committed in API response";
      }
    } else if (res.status === 422) {
      pydanticResult = "Reject (422)";
      postgresOutcome = "Rejected (no row created)";
    } else if (res.status === 400) {
      pydanticResult = "Reject (400)";
      postgresOutcome = "DB Integrity Error (rolled back)";
    } else {
      postgresOutcome = `HTTP ${res.status}`;
    }

    const parity: "Match" | "Contract Gap" = (expectedZod === "Accept" && pydanticResult === "Accept") || (expectedZod === "Reject" && pydanticResult !== "Accept") ? "Match" : "Contract Gap";

    parityResults.push({
      field,
      testCase,
      input: inputVal,
      zodResult: expectedZod,
      httpStatus: res.status,
      pydanticResult,
      postgresOutcome,
      parity,
    });

    return res;
  }

  // --------------------------------------------------------------------------------
  // B.1 PATIENT PHONE VALIDATION: LENGTH & DIGITS
  // --------------------------------------------------------------------------------
  console.log("--- B.1 PATIENT PHONE VALIDATION (LENGTH, FORMAT & DIRECT FASTAPI BYPASS) ---");

  // 1. Phone 9 digits (too short)
  const phone9Parse = patientFormSchema.safeParse({ ...validPatientBase, phone: "123456789" });
  assert(!phone9Parse.success, "Zod rejects phone below 10 digits (9 digits)");
  const resPhone9 = await testDirectPatientApi("9 digits (below min 10)", "phone", "123456789", { phone: "123456789" }, "Reject");
  assert(resPhone9.status === 422, "FastAPI rejects 9-digit phone with HTTP 422 Unprocessable Entity (Match ✅)");

  // 2. Phone 10 digits (valid boundary)
  const phone10Parse = patientFormSchema.safeParse({ ...validPatientBase, phone: "9876543210" });
  assert(phone10Parse.success, "Zod accepts valid 10-digit phone");
  const resPhone10 = await testDirectPatientApi("10 digits (valid min boundary)", "phone", "9876543210", { phone: "9876543210" }, "Accept");
  assert(resPhone10.status === 201, "FastAPI accepts valid 10-digit phone (Match ✅)");

  // 3. Phone 15 digits (valid max boundary)
  const phone15Parse = patientFormSchema.safeParse({ ...validPatientBase, phone: "987654321012345" });
  assert(phone15Parse.success, "Zod accepts valid 15-digit phone");
  const resPhone15 = await testDirectPatientApi("15 digits (valid max boundary)", "phone", "987654321012345", { phone: "987654321012345" }, "Accept");
  assert(resPhone15.status === 201, "FastAPI accepts valid 15-digit phone (Match ✅)");

  // 4. Phone 16 digits (too long)
  const phone16Parse = patientFormSchema.safeParse({ ...validPatientBase, phone: "1234567890123456" });
  assert(!phone16Parse.success, "Zod rejects phone exceeding 15 digits (16 digits)");
  const resPhone16 = await testDirectPatientApi("16 digits (exceeds max 15)", "phone", "1234567890123456", { phone: "1234567890123456" }, "Reject");
  assert(resPhone16.status === 422, "FastAPI rejects 16-digit phone with HTTP 422 Unprocessable Entity (Match ✅)");

  // 5. Phone with letters
  const phoneAlphaParse = patientFormSchema.safeParse({ ...validPatientBase, phone: "98765abcde" });
  assert(!phoneAlphaParse.success, "Zod rejects alphabetic characters in phone");
  const resPhoneAlpha = await testDirectPatientApi("Letters ('98765abcde')", "phone", "98765abcde", { phone: "98765abcde" }, "Reject");
  assert(resPhoneAlpha.status === 422, "FastAPI rejects phone with letters with HTTP 422 Unprocessable Entity (Match ✅)");

  // 6. Phone with padded whitespace
  const phonePaddedParse = patientFormSchema.safeParse({ ...validPatientBase, phone: "  9876543210  " });
  assert(phonePaddedParse.success, "Zod trims leading/trailing whitespace and accepts 10 digits");
  const resPhonePadded = await testDirectPatientApi("Padded whitespace ('  9876543210  ')", "phone", "  9876543210  ", { phone: "  9876543210  " }, "Accept");
  assert(resPhonePadded.status === 201, "FastAPI accepts padded phone (HTTP 201)");
  const paddedPatDb = await queryPatientByNumber(resPhonePadded.data.patient_number);
  assert(paddedPatDb && paddedPatDb.phone === "9876543210", "Backend stripped whitespace: stored phone is normalized pure 10 digits '9876543210' (Match ✅)");

  // 7. Phone with internal space
  const phoneInternalSpaceParse = patientFormSchema.safeParse({ ...validPatientBase, phone: "98765 43210" });
  assert(!phoneInternalSpaceParse.success, "Zod rejects phone with internal space");
  const resPhoneInternalSpace = await testDirectPatientApi("Internal space ('98765 43210')", "phone", "98765 43210", { phone: "98765 43210" }, "Reject");
  assert(resPhoneInternalSpace.status === 422, "FastAPI rejects phone with internal space with HTTP 422 (Match ✅)");

  // 8. Phone with symbols (+ and -)
  const phoneSymbolsParse = patientFormSchema.safeParse({ ...validPatientBase, phone: "+91-98765-43210" });
  assert(!phoneSymbolsParse.success, "Zod rejects punctuation/special characters (+ and -) in phone");
  const resPhoneSymbols = await testDirectPatientApi("Symbols ('+91-98765-43210')", "phone", "+91-98765-43210", { phone: "+91-98765-43210" }, "Reject");
  assert(resPhoneSymbols.status === 422, "FastAPI rejects phone with symbols with HTTP 422 (Match ✅)");

  // --------------------------------------------------------------------------------
  // B.2 PATIENT AADHAAR VALIDATION: LENGTH, FORMAT, EMPTY, NULL & WHITESPACE
  // --------------------------------------------------------------------------------
  console.log("\n--- B.2 PATIENT AADHAAR VALIDATION (LENGTH, NULL, EMPTY & DIRECT FASTAPI BYPASS) ---");

  // 1. Aadhaar 11 digits (unique randomized 11-digit string)
  const aadh11Val = `11${Math.floor(100000000 + Math.random() * 900000000)}`;
  const aadh11Parse = patientFormSchema.safeParse({ ...validPatientBase, aadhaar: aadh11Val });
  assert(!aadh11Parse.success, "Zod rejects Aadhaar with 11 digits");
  const resAadh11 = await testDirectPatientApi("11 digits (below 12)", "aadhaar", aadh11Val, { aadhaar: aadh11Val }, "Reject");
  assert(resAadh11.status === 422, "FastAPI rejects 11-digit Aadhaar with HTTP 422 Unprocessable Entity (Match ✅)");

  // 2. Aadhaar 12 digits (valid)
  const validAadhaarVal = `77${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const aadh12Parse = patientFormSchema.safeParse({ ...validPatientBase, aadhaar: validAadhaarVal });
  assert(aadh12Parse.success, "Zod accepts valid 12-digit Aadhaar");
  const resAadh12 = await testDirectPatientApi("12 digits (valid)", "aadhaar", validAadhaarVal, { aadhaar: validAadhaarVal }, "Accept");
  assert(resAadh12.status === 201, "FastAPI accepts valid 12-digit Aadhaar (Match ✅)");

  // 3. Aadhaar 13 digits (unique randomized 13-digit string)
  const aadh13Val = `13${Math.floor(10000000000 + Math.random() * 90000000000)}`;
  const aadh13Parse = patientFormSchema.safeParse({ ...validPatientBase, aadhaar: aadh13Val });
  assert(!aadh13Parse.success, "Zod rejects Aadhaar with 13 digits");
  const resAadh13 = await testDirectPatientApi("13 digits (above 12)", "aadhaar", aadh13Val, { aadhaar: aadh13Val }, "Reject");
  assert(resAadh13.status === 422, "FastAPI rejects 13-digit Aadhaar with HTTP 422 Unprocessable Entity (Match ✅)");

  // 4. Aadhaar with letters (unique randomized string ending in 'A')
  const aadhAlphaVal = `12${Math.floor(10000000 + Math.random() * 90000000)}A`;
  const aadhAlphaParse = patientFormSchema.safeParse({ ...validPatientBase, aadhaar: aadhAlphaVal });
  assert(!aadhAlphaParse.success, "Zod rejects Aadhaar with alphabetic characters");
  const resAadhAlpha = await testDirectPatientApi("Letters (alphanumeric)", "aadhaar", aadhAlphaVal, { aadhaar: aadhAlphaVal }, "Reject");
  assert(resAadhAlpha.status === 422, "FastAPI rejects Aadhaar with letters with HTTP 422 (Match ✅)");

  // 5. Aadhaar formatted with 4-digit spaces ('1234 5678 9012')
  const spacedAadhaarRaw = `88${Math.floor(10 + Math.random() * 90)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`;
  const aadhSpacedParse = patientFormSchema.safeParse({ ...validPatientBase, aadhaar: spacedAadhaarRaw });
  assert(aadhSpacedParse.success, "Zod accepts 4-digit spaced Aadhaar format");
  const resAadhSpaced = await testDirectPatientApi("4-digit spaced format", "aadhaar", spacedAadhaarRaw, { aadhaar: spacedAadhaarRaw }, "Accept");
  assert(resAadhSpaced.status === 201, "FastAPI accepts spaced Aadhaar (HTTP 201)");
  const spacedPatDb = await queryPatientByNumber(resAadhSpaced.data.patient_number);
  assert(spacedPatDb && !spacedPatDb.aadhaar.includes(" ") && spacedPatDb.aadhaar.length === 12, "Backend stripped spaces: stored Aadhaar is normalized pure 12 digits (Match ✅)");

  // 6. Aadhaar empty string ('') normalized to NULL
  const aadhEmptyParse = patientFormSchema.safeParse({ ...validPatientBase, aadhaar: "" });
  assert(aadhEmptyParse.success, "Zod permits empty string Aadhaar as optional field");
  const resAadhEmpty1 = await testDirectPatientApi("Empty string (row 1)", "aadhaar", "''", { aadhaar: "" }, "Accept");
  assert(resAadhEmpty1.status === 201, "FastAPI accepts aadhaar: '' and normalizes to None/NULL (HTTP 201)");
  const emptyPat1Db = await queryPatientByNumber(resAadhEmpty1.data.patient_number);
  assert(emptyPat1Db && emptyPat1Db.aadhaar === null, "PostgreSQL stores SQL NULL for aadhaar: ''");

  // Second registration with '' succeeds with 201 without collision because both are NULL!
  const resAadhEmpty2 = await testDirectPatientApi("Empty string (row 2)", "aadhaar", "''", { aadhaar: "" }, "Accept");
  assert(
    resAadhEmpty2.status === 201,
    "PostgreSQL permits multiple empty aadhaar registrations without collision (Resolved! Both normalized to NULL! Match ✅)"
  );
  const emptyPat2Db = await queryPatientByNumber(resAadhEmpty2.data.patient_number);
  assert(emptyPat2Db && emptyPat2Db.aadhaar === null, "PostgreSQL stores SQL NULL for second empty aadhaar");

  // 7. Aadhaar whitespace ('   ')
  const aadhWhitespaceParse = patientFormSchema.safeParse({ ...validPatientBase, aadhaar: "   " });
  assert(aadhWhitespaceParse.success, "Zod permits whitespace-only Aadhaar as optional field");
  const resAadhWhitespace = await testDirectPatientApi("Whitespace only ('   ')", "aadhaar", "'   '", { aadhaar: "   " }, "Accept");
  assert(resAadhWhitespace.status === 201, "FastAPI accepts aadhaar: '   ' and normalizes to None/NULL (HTTP 201)");
  const wsPatDb = await queryPatientByNumber(resAadhWhitespace.data.patient_number);
  assert(wsPatDb && wsPatDb.aadhaar === null, "PostgreSQL stores SQL NULL for whitespace-only aadhaar (Match ✅)");

  // 8. Aadhaar null
  const resAadhNull1 = await testDirectPatientApi("Null (row 1)", "aadhaar", "null", { aadhaar: null }, "Accept");
  assert(resAadhNull1.status === 201, "FastAPI accepts aadhaar: null (Match ✅)");
  const resAadhNull2 = await testDirectPatientApi("Null (row 2 - multiple nulls)", "aadhaar", "null", { aadhaar: null }, "Accept");
  assert(resAadhNull2.status === 201, "PostgreSQL permits multiple rows with aadhaar: null (SQL NULL standard: NULL != NULL, Match ✅)");

  // --------------------------------------------------------------------------------
  // B.3 PATIENT DATE OF BIRTH (DOB) BOUNDARY & LEAP YEAR VALIDATION
  // --------------------------------------------------------------------------------
  console.log("\n--- B.3 PATIENT DOB BOUNDARIES (FUTURE DATE, LEAP DAY, MALFORMED) ---");

  // 1. Future DOB (2099-01-01)
  const dobFutureParse = patientFormSchema.safeParse({ ...validPatientBase, dob: "2099-01-01" });
  assert(!dobFutureParse.success, "Zod rejects future DOB ('2099-01-01')");
  const resDobFuture = await testDirectPatientApi("Future date ('2099-01-01')", "dob", "2099-01-01", { dob: "2099-01-01" }, "Reject");
  assert(resDobFuture.status === 422, "FastAPI rejects future DOB with HTTP 422 Unprocessable Entity (Match ✅)");

  // 2. Nonexistent calendar date (2024-02-30)
  const dobInvalidParse = patientFormSchema.safeParse({ ...validPatientBase, dob: "2024-02-30" });
  assert(!dobInvalidParse.success, "Zod rejects nonexistent calendar date ('2024-02-30')");
  const resDobInvalid = await testDirectPatientApi("Nonexistent date ('2024-02-30')", "dob", "2024-02-30", { dob: "2024-02-30" }, "Reject");
  assert(resDobInvalid.status === 422, "FastAPI rejects nonexistent date with HTTP 422 Unprocessable Entity (Match)");

  // 3. Century Leap Day 2000-02-29 (divisible by 400 -> valid leap year)
  const dob2000Parse = patientFormSchema.safeParse({ ...validPatientBase, dob: "2000-02-29" });
  assert(dob2000Parse.success, "Zod accepts century leap day ('2000-02-29', divisible by 400)");
  const resDob2000 = await testDirectPatientApi("Century Leap Day ('2000-02-29')", "dob", "2000-02-29", { dob: "2000-02-29" }, "Accept");
  assert(resDob2000.status === 201, "FastAPI accepts valid century leap day 2000-02-29 (Match)");

  // 4. Century Non-Leap Day 1900-02-29 (divisible by 100 but not 400 -> invalid)
  const dob1900Parse = patientFormSchema.safeParse({ ...validPatientBase, dob: "1900-02-29" });
  assert(!dob1900Parse.success, "Zod rejects century non-leap day ('1900-02-29')");
  const resDob1900 = await testDirectPatientApi("Century Non-Leap ('1900-02-29')", "dob", "1900-02-29", { dob: "1900-02-29" }, "Reject");
  assert(resDob1900.status === 422, "FastAPI rejects century non-leap day with HTTP 422 Unprocessable Entity (Match)");

  // 5. Standard Leap Day 2024-02-29 (divisible by 4 -> valid leap year)
  const dob2024Parse = patientFormSchema.safeParse({ ...validPatientBase, dob: "2024-02-29" });
  assert(dob2024Parse.success, "Zod accepts standard leap day ('2024-02-29')");
  const resDob2024 = await testDirectPatientApi("Standard Leap Day ('2024-02-29')", "dob", "2024-02-29", { dob: "2024-02-29" }, "Accept");
  assert(resDob2024.status === 201, "FastAPI accepts standard leap day 2024-02-29 (Match)");

  // 6. Standard Non-Leap Day 2026-02-29 (non-leap year -> invalid)
  const dob2026Parse = patientFormSchema.safeParse({ ...validPatientBase, dob: "2026-02-29" });
  assert(!dob2026Parse.success, "Zod rejects non-leap day ('2026-02-29')");
  const resDob2026 = await testDirectPatientApi("Non-Leap Year ('2026-02-29')", "dob", "2026-02-29", { dob: "2026-02-29" }, "Reject");
  assert(resDob2026.status === 422, "FastAPI rejects non-leap Feb 29 with HTTP 422 Unprocessable Entity (Match)");

  // 7. Malformed date string ('not-a-date')
  const dobMalformedParse = patientFormSchema.safeParse({ ...validPatientBase, dob: "not-a-date" });
  assert(!dobMalformedParse.success, "Zod rejects malformed date string ('not-a-date')");
  const resDobMalformed = await testDirectPatientApi("Malformed ('not-a-date')", "dob", "not-a-date", { dob: "not-a-date" }, "Reject");
  assert(resDobMalformed.status === 422, "FastAPI rejects malformed date with HTTP 422 Unprocessable Entity (Match)");

  // Print Summary Parity Table for Phone, Aadhaar & DOB
  console.log("\n================================================================================");
  console.log("STAGE 11.4.2B: ZOD vs PYDANTIC CONTRACT PARITY REPORT (PHONE, AADHAAR & DOB)");
  console.log("================================================================================");
  console.log("| Field    | Test Case                          | Input              | Frontend Zod | HTTP | Backend Pydantic | PostgreSQL Outcome                   | Contract Status |");
  console.log("| :------- | :--------------------------------- | :----------------- | :----------- | :--- | :--------------- | :----------------------------------- | :-------------- |");
  for (const r of parityResults) {
    const fieldPad = r.field.padEnd(8);
    const casePad = r.testCase.padEnd(34);
    const inputPad = r.input.padEnd(18);
    const zodPad = r.zodResult.padEnd(12);
    const httpPad = String(r.httpStatus).padEnd(4);
    const pydPad = r.pydanticResult.padEnd(16);
    const pgPad = r.postgresOutcome.padEnd(36);
    const statusPad = r.parity === "Match" ? "Match ✅" : "CONTRACT GAP ⚠️";
    console.log(`| ${fieldPad} | ${casePad} | ${inputPad} | ${zodPad} | ${httpPad} | ${pydPad} | ${pgPad} | ${statusPad} |`);
  }
  console.log("================================================================================\n");
  // --------------------------------------------------------------------------------
  // B.6 PATIENT NAME & ADDRESS (EMPTY, MAXIMUM LENGTH & UNICODE)
  // --------------------------------------------------------------------------------
  console.log("\n--- B.6 PATIENT NAME & ADDRESS (EMPTY, MAX LENGTH, UNICODE) ---");
  const nameEmpty = patientFormSchema.safeParse({ ...validPatientBase, name: "" });
  assert(!nameEmpty.success, "Zod rejects empty patient name");

  const nameWhitespace = patientFormSchema.safeParse({ ...validPatientBase, name: "   " });
  assert(!nameWhitespace.success, "Zod rejects whitespace-only patient name");

  const name200Chars = "A".repeat(200);
  const nameValidMax = patientFormSchema.safeParse({ ...validPatientBase, name: name200Chars });
  assert(nameValidMax.success, "Zod accepts patient name at exact 200 characters limit");

  const name201Chars = "A".repeat(201);
  const nameTooLong = patientFormSchema.safeParse({ ...validPatientBase, name: name201Chars });
  assert(!nameTooLong.success, "Zod rejects patient name exceeding 200 characters (201 chars)");

  const addrEmpty = patientFormSchema.safeParse({ ...validPatientBase, address: "" });
  assert(!addrEmpty.success, "Zod rejects empty address");

  const addrBelow5 = patientFormSchema.safeParse({ ...validPatientBase, address: "123" });
  assert(!addrBelow5.success, "Zod rejects address below 5 characters (3 chars)");

  const addr300Chars = "X".repeat(300);
  const addrValidMax = patientFormSchema.safeParse({ ...validPatientBase, address: addr300Chars });
  assert(addrValidMax.success, "Zod accepts address at exact 300 characters limit");

  const addr301Chars = "X".repeat(301);
  const addrTooLong = patientFormSchema.safeParse({ ...validPatientBase, address: addr301Chars });
  assert(!addrTooLong.success, "Zod rejects address exceeding 300 characters (301 chars)");

  // UNICODE Support (Hindi, Bengali script)
  const unicodeName = "রবীন্দ্রনাথ ঠাকুর (Rabindranath Tagore)";
  const unicodeAddress = "জোড়াসাঁকো ঠাকুরবাড়ি, ৬ দ্বারকানাথ ঠাকুর লেন, কলকাতা - ৭০০০MD";
  const unicodeChief = "জ্বর এবং সর্দি (Fever and cough)";

  const patUnicodeZod = patientFormSchema.safeParse({
    ...validPatientBase,
    name: unicodeName,
    address: unicodeAddress,
    chief_complaint: unicodeChief,
  });
  assert(patUnicodeZod.success, "Zod accepts full Bengali/Indic Unicode text");

  const regUnicodePatRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: unicodeName,
      phone: `65444${Math.floor(10000 + Math.random() * 90000)}`,
      gender: "Male",
      dob: "1961-05-07",
      address: unicodeAddress,
      chief_complaint: unicodeChief,
    }),
  });
  assert(
    regUnicodePatRes.status === 201 && regUnicodePatRes.data?.name === unicodeName,
    `Backend & PostgreSQL preserve Unicode text with 100% fidelity (${regUnicodePatRes.data?.patient_number})`
  );

  // --------------------------------------------------------------------------------
  // B.7 PROVIDER NAME & SPECIALIZATION LENGTH BOUNDARIES
  // --------------------------------------------------------------------------------
  console.log("\n--- B.7 PROVIDER NAME & SPECIALIZATION LENGTH BOUNDARIES ---");
  const provName1Char = providerFormSchema.safeParse({ ...validProviderBase, name: "A" });
  assert(!provName1Char.success, "Zod rejects provider name below 2 characters (1 char)");

  const provName300 = "Dr. " + "N".repeat(296);
  const provNameValid300 = providerFormSchema.safeParse({ ...validProviderBase, name: provName300 });
  assert(provNameValid300.success, "Zod accepts provider name at 300 characters limit");

  const provName301 = "Dr. " + "N".repeat(297);
  const provNameInvalid301 = providerFormSchema.safeParse({ ...validProviderBase, name: provName301 });
  assert(!provNameInvalid301.success, "Zod rejects provider name exceeding 300 characters (301 chars)");

  // Backend Pydantic validation on provider name > 300 chars
  const apiProvName301Res = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      name: provName301,
      phone: `41111${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvName301Res.status === 422,
    `Backend Pydantic rejects provider name > 300 chars with HTTP 422 Unprocessable Entity`
  );

  const provSpec1Char = providerFormSchema.safeParse({ ...validProviderBase, specialization: "O" });
  assert(!provSpec1Char.success, "Zod rejects provider specialization below 2 characters (1 char)");

  const provSpec300 = "S".repeat(300);
  const provSpecValid300 = providerFormSchema.safeParse({ ...validProviderBase, specialization: provSpec300 });
  assert(provSpecValid300.success, "Zod accepts specialization at 300 characters limit");

  const provSpec301 = "S".repeat(301);
  const provSpecInvalid301 = providerFormSchema.safeParse({ ...validProviderBase, specialization: provSpec301 });
  assert(!provSpecInvalid301.success, "Zod rejects specialization exceeding 300 characters (301 chars)");

  const apiProvSpec301Res = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      specialization: provSpec301,
      phone: `41222${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvSpec301Res.status === 422,
    `Backend Pydantic rejects specialization > 300 chars with HTTP 422 Unprocessable Entity`
  );

  // --------------------------------------------------------------------------------
  // B.8 PROVIDER PHONE VALIDATION
  // --------------------------------------------------------------------------------
  console.log("\n--- B.8 PROVIDER PHONE VALIDATION ---");
  const provPhoneShort = providerFormSchema.safeParse({ ...validProviderBase, phone: "123456789" });
  assert(!provPhoneShort.success, "Zod rejects provider phone below 10 digits");

  const provPhone21 = providerFormSchema.safeParse({ ...validProviderBase, phone: "1".repeat(21) });
  assert(!provPhone21.success, "Zod rejects provider phone exceeding 20 digits");

  const apiProvPhone21Res = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      phone: "1".repeat(21),
    }),
  });
  assert(
    apiProvPhone21Res.status === 422,
    `Backend Pydantic rejects provider phone > 20 digits with HTTP 422 Unprocessable Entity`
  );

  const provPhoneAlpha = providerFormSchema.safeParse({ ...validProviderBase, phone: "98765DOCXX" });
  assert(!provPhoneAlpha.success, "Zod rejects non-digit characters in provider phone");

  // --------------------------------------------------------------------------------
  // B.9 PROVIDER EMAIL VALIDATION (INVALID EMAIL & EMPTY VS NULL)
  // --------------------------------------------------------------------------------
  console.log("\n--- B.9 PROVIDER EMAIL VALIDATION ---");
  const provInvalidEmail = providerFormSchema.safeParse({ ...validProviderBase, email: "not-an-email" });
  assert(!provInvalidEmail.success, "Zod rejects invalid email format ('not-an-email')");

  const apiProvInvalidEmailRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      email: "not-an-email",
      phone: `41333${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvInvalidEmailRes.status === 422,
    `Backend Pydantic EmailStr rejects invalid email with HTTP 422 Unprocessable Entity`
  );

  // Empty string vs null coordination:
  const provEmptyEmailZod = providerFormSchema.safeParse({ ...validProviderBase, email: "" });
  assert(provEmptyEmailZod.success, "Zod accepts empty string '' for optional email field");

  const apiEmptyEmailRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      email: "",
      phone: `41444${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiEmptyEmailRes.status === 422,
    `Backend Pydantic rejects email: '' with HTTP 422 (proving why frontend form handler converts '' to null before sending)`
  );

  const apiNullEmailRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      email: null,
      phone: `41555${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiNullEmailRes.status === 201,
    `Backend Pydantic & PostgreSQL accept email: null (HTTP 201, Doc: ${apiNullEmailRes.data?.doc_number})`
  );

  // --------------------------------------------------------------------------------
  // B.10 PROVIDER POST VALIDATION (MD / MS ENUM)
  // --------------------------------------------------------------------------------
  console.log("\n--- B.10 PROVIDER POST VALIDATION (MD / MS ENUM) ---");
  const provInvalidPost = providerFormSchema.safeParse({ ...validProviderBase, post: "MBBS" as any });
  assert(!provInvalidPost.success, "Zod rejects invalid qualification post ('MBBS')");

  const apiInvalidPostRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      post: "MBBS",
      phone: `41666${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiInvalidPostRes.status === 422,
    `Backend Pydantic PostType enum rejects invalid post with HTTP 422 Unprocessable Entity`
  );

  const provValidPostMD = providerFormSchema.safeParse({ ...validProviderBase, post: "MD" });
  assert(provValidPostMD.success, "Zod accepts post: 'MD'");

  const provValidPostMS = providerFormSchema.safeParse({ ...validProviderBase, post: "MS" });
  assert(provValidPostMS.success, "Zod accepts post: 'MS'");

    // --------------------------------------------------------------------------------
  // B.11 PATIENT GENDER BOUNDARIES & PARITY (FASTAPI BYPASS & CASE NORMALIZATION)
  // --------------------------------------------------------------------------------
  console.log("\n--- B.11 PATIENT GENDER BOUNDARIES & PARITY ---");
  const patGenderAlien = patientFormSchema.safeParse({ ...validPatientBase, gender: "Alien" as any });
  assert(!patGenderAlien.success, "Zod rejects invalid gender ('Alien')");

  const patGenderEmpty = patientFormSchema.safeParse({ ...validPatientBase, gender: "" as any });
  assert(!patGenderEmpty.success, "Zod rejects empty string gender");

  const rejectedPatGenderPhone = `69111${Math.floor(10000 + Math.random() * 90000)}`;
  const apiGenderAlienRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      gender: "Alien",
      phone: rejectedPatGenderPhone,
    }),
  });
  assert(
    apiGenderAlienRes.status === 422,
    "FastAPI rejects invalid gender ('Alien') with HTTP 422 Unprocessable Entity (Match ✅)"
  );
  const dbAlienGenderCheck = await queryPatientsByPhone(rejectedPatGenderPhone);
  assert(dbAlienGenderCheck.length === 0, "PostgreSQL confirms 0 rows created for rejected 'Alien' gender");

  // Lowercase / uppercase normalization check on backend:
  const apiGenderLowerRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      gender: "male",
      phone: `69112${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiGenderLowerRes.status === 201 && apiGenderLowerRes.data?.gender === "Male",
    "FastAPI normalizes case-insensitive gender ('male' -> 'Male') with HTTP 201 (Match ✅)"
  );

  // --------------------------------------------------------------------------------
  // B.12 PATIENT CHIEF COMPLAINT BOUNDARIES & PARITY
  // --------------------------------------------------------------------------------
  console.log("\n--- B.12 PATIENT CHIEF COMPLAINT BOUNDARIES & PARITY ---");
  const patChiefShort = patientFormSchema.safeParse({ ...validPatientBase, chief_complaint: "Fe" });
  assert(!patChiefShort.success, "Zod rejects chief complaint below 3 characters ('Fe')");

  const patChief300 = "C".repeat(300);
  const patChiefValid300 = patientFormSchema.safeParse({ ...validPatientBase, chief_complaint: patChief300 });
  assert(patChiefValid300.success, "Zod accepts chief complaint at exact 300 characters limit");

  const patChief301 = "C".repeat(301);
  const patChiefInvalid301 = patientFormSchema.safeParse({ ...validPatientBase, chief_complaint: patChief301 });
  assert(!patChiefInvalid301.success, "Zod rejects chief complaint exceeding 300 characters (301 chars)");

  const patChiefWhitespace = patientFormSchema.safeParse({ ...validPatientBase, chief_complaint: "   " });
  assert(!patChiefWhitespace.success, "Zod rejects whitespace-only chief complaint");

  const apiChiefShortRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      chief_complaint: "Fe",
      phone: `69113${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiChiefShortRes.status === 422,
    "FastAPI rejects chief complaint < 3 characters with HTTP 422 (Match ✅)"
  );

  const apiChief301Res = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      chief_complaint: patChief301,
      phone: `69114${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiChief301Res.status === 422,
    "FastAPI rejects chief complaint > 300 characters with HTTP 422 (Match ✅)"
  );

  const apiChiefNullByteRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      chief_complaint: "Fever\x00cough",
      phone: `69115${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiChiefNullByteRes.status === 422,
    "FastAPI rejects null byte in chief complaint with HTTP 422 (Security ✅)"
  );

  // --------------------------------------------------------------------------------
  // B.13 PATIENT DIRECT FASTAPI BYPASS & NULL BYTE INJECTION PROTECTION
  // --------------------------------------------------------------------------------
  console.log("\n--- B.13 PATIENT DIRECT FASTAPI BYPASS & NULL BYTE INJECTION ---");
  const apiPatNameShortRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      name: "A",
      phone: `69116${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiPatNameShortRes.status === 422,
    "FastAPI rejects patient name < 2 chars with HTTP 422 (Match ✅)"
  );

  const apiPatNameWhitespaceRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      name: "   ",
      phone: `69117${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiPatNameWhitespaceRes.status === 422,
    "FastAPI rejects whitespace-only patient name with HTTP 422 (Match ✅)"
  );

  const apiPatNameNullByteRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      name: "Rahul\x00Verma",
      phone: `69118${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiPatNameNullByteRes.status === 422,
    "FastAPI rejects null byte in patient name with HTTP 422 (Security ✅)"
  );

  const apiPatAddressShortRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      address: "123",
      phone: `69119${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiPatAddressShortRes.status === 422,
    "FastAPI rejects patient address < 5 chars with HTTP 422 (Match ✅)"
  );

  const apiPatAddressNullByteRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      address: "City\x00Hospital Colony",
      phone: `69120${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiPatAddressNullByteRes.status === 422,
    "FastAPI rejects null byte in patient address with HTTP 422 (Security ✅)"
  );

  // --------------------------------------------------------------------------------
  // B.14 PROVIDER DIRECT FASTAPI BYPASS & NULL BYTE INJECTION PROTECTION
  // --------------------------------------------------------------------------------
  console.log("\n--- B.14 PROVIDER DIRECT FASTAPI BYPASS & NULL BYTE INJECTION ---");
  const apiProvNameShortRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      name: "D",
      phone: `41777${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvNameShortRes.status === 422,
    "FastAPI rejects provider name < 2 chars with HTTP 422 (Match ✅)"
  );

  const apiProvNameNullByteRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      name: "Dr. Aman\x00Sharma",
      phone: `41778${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvNameNullByteRes.status === 422,
    "FastAPI rejects null byte in provider name with HTTP 422 (Security ✅)"
  );

  const apiProvSpecShortRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      specialization: "O",
      phone: `41779${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvSpecShortRes.status === 422,
    "FastAPI rejects provider specialization < 2 chars with HTTP 422 (Match ✅)"
  );

  const apiProvSpecNullByteRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      specialization: "Cardio\x00logy",
      phone: `41780${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvSpecNullByteRes.status === 422,
    "FastAPI rejects null byte in provider specialization with HTTP 422 (Security ✅)"
  );

  const apiProvPhoneNullByteRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      phone: `41781\x00${Math.floor(10000 + Math.random() * 90000)}`,
    }),
  });
  assert(
    apiProvPhoneNullByteRes.status === 422,
    "FastAPI rejects null byte in provider phone with HTTP 422 (Security ✅)"
  );

  // --------------------------------------------------------------------------------
  // B.15 MASS ASSIGNMENT & FORBIDDEN EXTRA FIELDS ATTACK PREVENTION
  // --------------------------------------------------------------------------------
  console.log("\n--- B.15 MASS ASSIGNMENT & FORBIDDEN EXTRA FIELDS ---");
  const rejectedPatientPhone = `69121${Math.floor(10000 + Math.random() * 90000)}`;
  const apiPatExtraFieldsRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      ...validPatientBase,
      phone: rejectedPatientPhone,
      is_admin: true,
      hacker_field: "injected_payload",
    }),
  });
  assert(
    apiPatExtraFieldsRes.status === 422,
    "FastAPI rejects patient mass assignment / extra fields with HTTP 422 (extra='forbid' ✅)"
  );

  const rejectedProviderPhone = `41782${Math.floor(10000 + Math.random() * 90000)}`;
  const apiProvExtraFieldsRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      ...validProviderBase,
      phone: rejectedProviderPhone,
      role: "ADMIN",
      unauthorized_override: true,
    }),
  });
  assert(
    apiProvExtraFieldsRes.status === 422,
    "FastAPI rejects provider mass assignment / extra fields with HTTP 422 (extra='forbid' ✅)"
  );

  // --------------------------------------------------------------------------------
  // B.16 PROVIDER UNICODE NAME & SPECIALIZATION HIGH-FIDELITY PERSISTENCE
  // --------------------------------------------------------------------------------
  console.log("\n--- B.16 PROVIDER UNICODE HIGH-FIDELITY PERSISTENCE ---");
  const unicodeDocName = "ডাঃ সুবীর সেন";
  const unicodeDocSpec = "হৃদরোগ বিশেষজ্ঞ";
  const unicodeDocPhone = `41783${Math.floor(10000 + Math.random() * 90000)}`;
  const apiUnicodeDocRes = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: unicodeDocName,
      specialization: unicodeDocSpec,
      phone: unicodeDocPhone,
      post: "MD",
    }),
  });
  assert(
    apiUnicodeDocRes.status === 201 && apiUnicodeDocRes.data?.name === unicodeDocName,
    `FastAPI accepts Bengali Unicode provider name & spec (Doc: ${apiUnicodeDocRes.data?.doc_number})`
  );

  const dbUnicodeDoc = await queryProvidersByPhone(unicodeDocPhone);
  assert(
    dbUnicodeDoc.length === 1 && dbUnicodeDoc[0].name === unicodeDocName,
    "PostgreSQL verifies Unicode doctor name stored with 100% UTF-8 fidelity (Match ✅)"
  );

  // --------------------------------------------------------------------------------
  // B.17 POSTGRESQL ZERO-LEAK VERIFICATION FOR REJECTED REQUESTS
  // --------------------------------------------------------------------------------
  console.log("\n--- B.17 POSTGRESQL ZERO-LEAK VERIFICATION FOR REJECTED REQUESTS ---");
  const dbRejectedPat = await queryPatientsByPhone(rejectedPatientPhone);
  assert(
    dbRejectedPat.length === 0,
    "PostgreSQL confirms ZERO rows created for rejected extra-field patient payload (Zero DB Leak ✅)"
  );

  const dbRejectedProv = await queryProvidersByPhone(rejectedProviderPhone);
  assert(
    dbRejectedProv.length === 0,
    "PostgreSQL confirms ZERO rows created for rejected extra-field provider payload (Zero DB Leak ✅)"
  );

console.log("\n================================================================================");
  console.log(`🎉 ALL STAGE 11.4.2 (A + B) BOUNDARY & VALIDATION CHECKS PASSED (${passed}/${total} GREEN, 100%)!`);
  console.log("================================================================================\n");
}


runStage11BoundariesVerification().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});

export {};
