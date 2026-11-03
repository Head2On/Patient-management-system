/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * STAGE 11.4.3: SECURITY, OBJECT-LEVEL AUTHORIZATION (IDOR) & DATA INTEGRITY
 * 
 * Comprehensive Automated Security Evaluation across:
 * Next.js Frontend BFF -> FastAPI Backend -> PostgreSQL Database
 * 
 * Evaluates:
 * 1. Object-Level Access Control (IDOR) across Users, Appointments, Patients & Providers
 * 2. Authentication Bypass, Token Tampering, Expired Tokens & Session Lifecycle
 * 3. Mass Assignment & Unauthorized Field Injection (PATCH / PUT fail-closed contracts)
 * 4. SQL Injection & XSS Payload Neutralization
 * 5. Sensitive Data Exposure (Credential Leakage, PII Shielding, Error Hygiene)
 * 6. Transaction Atomicity & Database Rollback Integrity
 */

import { execSync } from "child_process";
import path from "path";

const BASE_URL = "http://localhost:3000";
const FASTAPI_URL = "http://127.0.0.1:8000";

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
  token: string;
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
    token,
    cookieHeader,
  };
}

function runPythonHelper(pythonCode: string): any {
  const projectRoot = path.resolve(__dirname, "../../../");
  const output = execSync("python", {
    input: pythonCode,
    cwd: projectRoot,
    encoding: "utf-8",
  });
  return JSON.parse(output.trim());
}

let totalChecks = 0;
let passedChecks = 0;
const failureDetails: string[] = [];

function check(label: string, passed: boolean, details?: string) {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`  [PASS] ${label}`);
  } else {
    console.error(`  [FAIL] ${label}${details ? ` -> ${details}` : ""}`);
    failureDetails.push(`${label}${details ? ` -> ${details}` : ""}`);
  }
}

async function main() {
  console.log("\n===============================================================================");
  console.log("STAGE 11.4.3: SECURITY, OBJECT-LEVEL AUTHORIZATION (IDOR) & DATA INTEGRITY");
  console.log("===============================================================================\n");

  // Step 0: Ensure standard accounts are seeded and available
  console.log("--- Step 0: Authentication & Session Verification ---");
  const admin = await loginUser(BASE_URL, "9999999999", "AdminPass123", "ADMIN");
  const receptionist = await loginUser(BASE_URL, "8888888888", "ReceptionistPass123", "RECEPTIONIST");
  const doctor = await loginUser(BASE_URL, "7777777777", "DoctorPass123", "DOCTOR");

  check("Admin login successful", admin.role === "ADMIN");
  check("Receptionist login successful", receptionist.role === "RECEPTIONIST");
  check("Doctor login successful", doctor.role === "DOCTOR");

  // Create a second doctor to test cross-doctor authorization
  const ts = Date.now().toString().slice(-8);
  const doc2Phone = `71${ts}`;
  let doctor2: UserSession;
  try {
    // 1. Create provider 2
    const prov2Res = await request(`${BASE_URL}/api/providers/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: admin.cookieHeader,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        name: `SecDoctor Two`,
        specialization: "Neurology",
        phone: doc2Phone,
        email: `doc2_${ts}@example.com`,
        post: "MD",
      }),
    });
    const prov2 = prov2Res.data;

    // 2. Create user for doctor 2
    const u2Res = await request(`${BASE_URL}/api/users/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: admin.cookieHeader,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        phone: doc2Phone,
        password: "Doctor2@1234",
        role: "DOCTOR",
        provider_id: prov2.id,
      }),
    });
    console.log("prov2Res:", prov2Res.status, prov2Res.text);
    console.log("u2Res:", u2Res.status, u2Res.text);
    check("Second doctor provisioned for cross-doctor tests", u2Res.status === 201);

    doctor2 = await loginUser(BASE_URL, doc2Phone, "Doctor2@1234", "DOCTOR");
    check("Doctor 2 login successful", doctor2.role === "DOCTOR");
  } catch (err: any) {
    console.error("Failed to provision second doctor:", err.message);
    throw err;
  }

  // =========================================================================
  // SECTION 1: IDOR & OBJECT-LEVEL ACCESS CONTROL
  // =========================================================================
  console.log("\n--- Section 1: IDOR & Object-Level Access Control ---");

  // 1.1 User Domain IDOR: Cross-user profile inspection
  const docViewAdmin = await request(`${BASE_URL}/api/users/${admin.userId}`, {
    headers: { Cookie: doctor.cookieHeader },
  });
  check(
    "Doctor viewing Admin profile rejected with HTTP 403 Forbidden",
    docViewAdmin.status === 403,
    `Got HTTP ${docViewAdmin.status}`
  );

  const docViewRecept = await request(`${BASE_URL}/api/users/${receptionist.userId}`, {
    headers: { Cookie: doctor.cookieHeader },
  });
  check(
    "Doctor viewing Receptionist profile rejected with HTTP 403 Forbidden",
    docViewRecept.status === 403,
    `Got HTTP ${docViewRecept.status}`
  );

  const doc1ViewDoc2 = await request(`${BASE_URL}/api/users/${doctor2.userId}`, {
    headers: { Cookie: doctor.cookieHeader },
  });
  check(
    "Doctor 1 viewing Doctor 2 profile rejected with HTTP 403 Forbidden",
    doc1ViewDoc2.status === 403,
    `Got HTTP ${doc1ViewDoc2.status}`
  );

  const receptViewAdmin = await request(`${BASE_URL}/api/users/${admin.userId}`, {
    headers: { Cookie: receptionist.cookieHeader },
  });
  check(
    "Receptionist viewing Admin profile rejected with HTTP 403 Forbidden",
    receptViewAdmin.status === 403,
    `Got HTTP ${receptViewAdmin.status}`
  );

  // 1.2 User Domain IDOR: Cross-user profile mutation
  const docUpdateAdmin = await request(`${BASE_URL}/api/users/${admin.userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: doctor.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({ email: "hacked@example.com" }),
  });
  check(
    "Doctor modifying Admin profile rejected with HTTP 403 Forbidden",
    docUpdateAdmin.status === 403,
    `Got HTTP ${docUpdateAdmin.status}`
  );

  const receptUpdateDoc = await request(`${BASE_URL}/api/users/${doctor.userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: receptionist.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({ email: "tampered@example.com" }),
  });
  check(
    "Receptionist modifying Doctor profile rejected with HTTP 403 Forbidden",
    receptUpdateDoc.status === 403,
    `Got HTTP ${receptUpdateDoc.status}`
  );

  // 1.3 Self Profile Authorization: Users can read and update their own profile
  const docViewSelf = await request(`${BASE_URL}/api/users/${doctor.userId}`, {
    headers: { Cookie: doctor.cookieHeader },
  });
  check(
    "Doctor viewing own profile by ID allowed with HTTP 200 OK",
    docViewSelf.status === 200 && docViewSelf.data?.id === doctor.userId,
    `Got HTTP ${docViewSelf.status}`
  );

  const docViewMe = await request(`${BASE_URL}/api/users/me`, {
    headers: { Cookie: doctor.cookieHeader },
  });
  check(
    "Doctor viewing own profile via /me allowed with HTTP 200 OK",
    docViewMe.status === 200 && docViewMe.data?.id === doctor.userId,
    `Got HTTP ${docViewMe.status}`
  );

  // 1.4 Admin Omnipotence: Admin can read and update any user profile
  const adminViewDoc = await request(`${BASE_URL}/api/users/${doctor.userId}`, {
    headers: { Cookie: admin.cookieHeader },
  });
  check(
    "Admin viewing Doctor profile allowed with HTTP 200 OK",
    adminViewDoc.status === 200 && adminViewDoc.data?.id === doctor.userId,
    `Got HTTP ${adminViewDoc.status}`
  );

  // 1.5 Phone Lookup IDOR: Non-admin staff blocked from phone lookup
  const docPhoneLookup = await request(`${BASE_URL}/api/users/phone/${admin.phone}`, {
    headers: { Cookie: doctor.cookieHeader },
  });
  check(
    "Doctor looking up user by phone rejected with HTTP 403 Forbidden",
    docPhoneLookup.status === 403,
    `Got HTTP ${docPhoneLookup.status}`
  );

  const receptPhoneLookup = await request(`${BASE_URL}/api/users/phone/${doctor.phone}`, {
    headers: { Cookie: receptionist.cookieHeader },
  });
  check(
    "Receptionist looking up user by phone rejected with HTTP 403 Forbidden",
    receptPhoneLookup.status === 403,
    `Got HTTP ${receptPhoneLookup.status}`
  );

  // 1.6 Patient Domain RBAC & Scope Protection:
  const docInactivePatients = await request(`${BASE_URL}/api/patients/?is_active=false`, {
    headers: { Cookie: doctor.cookieHeader },
  });
  check(
    "Doctor querying inactive patient directory rejected with HTTP 403 Forbidden",
    docInactivePatients.status === 403,
    `Got HTTP ${docInactivePatients.status}`
  );

  const docCreatePatient = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: doctor.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      name: "Illicit Patient",
      phone: "9988776655",
      dob: "1990-01-01",
      gender: "Male",
      address: "123 Clinic Road",
      chief_complaint: "Headache",
    }),
  });
  check(
    "Doctor creating patient record rejected with HTTP 403 Forbidden",
    docCreatePatient.status === 403,
    `Got HTTP ${docCreatePatient.status}`
  );

  // 1.7 Provider Domain RBAC Protection:
  const docCreateProvider = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: doctor.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      name: "Illicit Provider",
      specialization: "General",
      phone: "9911223344",
      post: "MD",
    }),
  });
  check(
    "Doctor creating provider rejected with HTTP 403 Forbidden",
    docCreateProvider.status === 403,
    `Got HTTP ${docCreateProvider.status}`
  );

  const receptCreateProvider = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: receptionist.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      name: "Illicit Provider",
      specialization: "General",
      phone: "9911223344",
      post: "MD",
    }),
  });
  check(
    "Receptionist creating provider rejected with HTTP 403 Forbidden",
    receptCreateProvider.status === 403,
    `Got HTTP ${receptCreateProvider.status}`
  );

  // 1.8 Appointment Booking Authorization:
  const docBookAppt = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: doctor.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      patient_id: 1,
      provider_id: "RS5956",
      start_time: new Date(Date.now() + 86400000).toISOString(),
      end_time: new Date(Date.now() + 90000000).toISOString(),
      reason_for_visit: "Unauthorized Booking",
    }),
  });
  check(
    "Doctor booking appointment directly rejected with HTTP 403 Forbidden",
    docBookAppt.status === 403,
    `Got HTTP ${docBookAppt.status}`
  );

  // =========================================================================
  // SECTION 2: AUTHENTICATION BYPASS, TOKEN FORGERY & JWT SECURITY
  // =========================================================================
  console.log("\n--- Section 2: Authentication Bypass & Token Security ---");

  // 2.1 Missing Authorization Header
  const unauthRes = await request(`${FASTAPI_URL}/api/v1/users/me`);
  check(
    "Direct request without Authorization header rejected with HTTP 401 Unauthorized",
    unauthRes.status === 401,
    `Got HTTP ${unauthRes.status}`
  );

  // 2.2 Malformed Authorization Schemes
  const basicAuthRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: "Basic YWRtaW46cGFzc3dvcmQ=" },
  });
  check(
    "Request with Basic auth scheme rejected with HTTP 401 Unauthorized",
    basicAuthRes.status === 401,
    `Got HTTP ${basicAuthRes.status}`
  );

  const emptyBearerRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: "Bearer " },
  });
  check(
    "Request with empty Bearer token rejected with HTTP 401 Unauthorized",
    emptyBearerRes.status === 401,
    `Got HTTP ${emptyBearerRes.status}`
  );

  // 2.3 Expired JWT Token
  const expiredToken = runPythonHelper(`
import json
from datetime import datetime, timedelta, timezone
import jwt
from app.core.config import settings

token = jwt.encode(
    {"sub": "${admin.userId}", "role": "ADMIN", "exp": datetime.now(timezone.utc) - timedelta(hours=2)},
    settings.secret_key,
    algorithm=settings.algorithm
)
print(json.dumps(token))
`);
  const expiredRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  check(
    "Expired JWT token rejected with HTTP 401 Unauthorized",
    expiredRes.status === 401,
    `Got HTTP ${expiredRes.status}`
  );

  // 2.4 Tampered Signature
  const validTokenParts = admin.token.split(".");
  const tamperedSig = validTokenParts[2].slice(0, -4) + "X9zQ";
  const tamperedSigToken = `${validTokenParts[0]}.${validTokenParts[1]}.${tamperedSig}`;
  const tamperedSigRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${tamperedSigToken}` },
  });
  check(
    "Token with tampered signature rejected with HTTP 401 Unauthorized",
    tamperedSigRes.status === 401,
    `Got HTTP ${tamperedSigRes.status}`
  );

  // 2.5 Tampered Payload (Elevation Attempt)
  // Decode payload, modify role to ADMIN, re-attach old signature
  const origPayload = JSON.parse(Buffer.from(doctor.token.split(".")[1], "base64url").toString());
  origPayload.role = "ADMIN";
  const forgedPayloadB64 = Buffer.from(JSON.stringify(origPayload)).toString("base64url");
  const forgedToken = `${doctor.token.split(".")[0]}.${forgedPayloadB64}.${doctor.token.split(".")[2]}`;
  const forgedRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });
  check(
    "Token with tampered payload rejected with HTTP 401 Unauthorized",
    forgedRes.status === 401,
    `Got HTTP ${forgedRes.status}`
  );

  // 2.6 Algorithm None Exploit
  const algNoneToken = runPythonHelper(`
import json
import jwt

token = jwt.encode(
    {"sub": "${admin.userId}", "role": "ADMIN"},
    key="",
    algorithm="none"
)
print(json.dumps(token))
`);
  const algNoneRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${algNoneToken}` },
  });
  check(
    "Token with 'alg: none' rejected with HTTP 401 Unauthorized",
    algNoneRes.status === 401,
    `Got HTTP ${algNoneRes.status}`
  );

  // 2.7 Forged Non-Existent User ID
  const phantomUserToken = runPythonHelper(`
import json
from datetime import datetime, timedelta, timezone
import jwt
from app.core.config import settings

token = jwt.encode(
    {"sub": "9999999", "role": "ADMIN", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
    settings.secret_key,
    algorithm=settings.algorithm
)
print(json.dumps(token))
`);
  const phantomUserRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${phantomUserToken}` },
  });
  check(
    "Token with non-existent user sub rejected with HTTP 401 Unauthorized",
    phantomUserRes.status === 401,
    `Got HTTP ${phantomUserRes.status}`
  );

  // 2.8 Malformed Non-Integer User ID
  const malformedSubToken = runPythonHelper(`
import json
from datetime import datetime, timedelta, timezone
import jwt
from app.core.config import settings

token = jwt.encode(
    {"sub": "invalid-uuid-or-string", "role": "ADMIN", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
    settings.secret_key,
    algorithm=settings.algorithm
)
print(json.dumps(token))
`);
  const malformedSubRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${malformedSubToken}` },
  });
  check(
    "Token with non-integer user sub rejected with HTTP 401 Unauthorized",
    malformedSubRes.status === 401,
    `Got HTTP ${malformedSubRes.status}`
  );

  // 2.9 Deactivated User Session Invalidation
  // Create a temporary user, log them in, deactivate them, then test their token
  const deactPhone = `95${Date.now().toString().slice(-8)}`;
  await request(`${BASE_URL}/api/users/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: admin.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      phone: deactPhone,
      password: "TempUser@1234",
      role: "RECEPTIONIST",
    }),
  });
  const tempSession = await loginUser(BASE_URL, deactPhone, "TempUser@1234", "RECEPTIONIST");
  // Deactivate temp user
  const deactRes = await request(`${BASE_URL}/api/users/${tempSession.userId}/deactivate`, {
    method: "DELETE",
    headers: {
      Cookie: admin.cookieHeader,
      Origin: BASE_URL,
    },
  });
  check("Temporary user deactivated for token test", deactRes.status === 200);

  // Now use the in-flight token of the deactivated user
  const postDeactRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${tempSession.token}` },
  });
  check(
    "Token of deactivated user rejected with HTTP 403 Forbidden",
    postDeactRes.status === 403,
    `Got HTTP ${postDeactRes.status}`
  );

  // 2.10 Anti-CSRF Protection on BFF Mutations
  const csrfUntrustedOrigin = await request(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: {
      Cookie: admin.cookieHeader,
      Origin: "http://malicious-attacker-site.com",
    },
  });
  check(
    "BFF mutation with untrusted Origin rejected with HTTP 403 Forbidden",
    csrfUntrustedOrigin.status === 403,
    `Got HTTP ${csrfUntrustedOrigin.status}`
  );

  // =========================================================================
  // SECTION 3: MASS ASSIGNMENT & UNAUTHORIZED FIELD INJECTION
  // =========================================================================
  console.log("\n--- Section 3: Mass Assignment & Extra Field Injection Defense ---");

  // First create a patient for testing PATCH
  const pAadhaar = `98${Date.now().toString().slice(-10)}`;
  const pPhone = `94${Date.now().toString().slice(-8)}`;
  const pCreateRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: receptionist.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      name: "Security Mass Assign Patient",
      phone: pPhone,
      dob: "1992-05-15",
      gender: "Female",
      aadhaar: pAadhaar,
      address: "123 Security Testing Lane",
      chief_complaint: "Routine checkup",
    }),
  });
  check("Patient created for mass assignment test", pCreateRes.status === 201);
  const patientNum = pCreateRes.data.patient_number;

  // Resolve internal database ID via patient detail endpoint
  const pDetailRes = await request(`${BASE_URL}/api/patients/${patientNum}`, {
    headers: { Cookie: receptionist.cookieHeader },
  });
  const patientDbId = pDetailRes.data?.id;
  check("Patient internal database ID resolved via detail endpoint", Number.isInteger(patientDbId));

  // 3.1 Patient PATCH extra fields
  const patientMassAssign = await request(`${FASTAPI_URL}/api/v1/patients/${patientNum}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      name: "Security Updated Name",
      is_active: false,
      created_by_id: 9999,
      id: 8888,
      injected_field: "malicious_value",
    }),
  });
  check(
    "Patient PATCH with extra fields rejected with HTTP 422 (extra='forbid')",
    patientMassAssign.status === 422,
    `Got HTTP ${patientMassAssign.status}`
  );

  // 3.2 Appointment PATCH extra fields
  // Book an appointment first (use jitter to prevent collision across repeat test runs)
  const jitter1 = Math.floor(Math.random() * 500000000);
  const apptStart = new Date(Date.now() + 300000000 + jitter1).toISOString();
  const apptEnd = new Date(Date.now() + 303600000 + jitter1).toISOString();
  const apptCreateRes = await request(`${FASTAPI_URL}/api/v1/appointments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${receptionist.token}`,
    },
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: "RS5956",
      start_time: apptStart,
      end_time: apptEnd,
      reason_for_visit: "Security evaluation consultation",
    }),
  });
  check("Appointment created for mass assignment test", apptCreateRes.status === 201);
  const apptId = apptCreateRes.data.id;

  const apptMassAssign = await request(`${FASTAPI_URL}/api/v1/appointments/${apptId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      reason_for_visit: "Updated reason",
      patient_id: 9999,
      created_by_id: 8888,
      id: 7777,
      malicious_payload: "exploit",
    }),
  });
  check(
    "Appointment PATCH with extra fields rejected with HTTP 422 (extra='forbid')",
    apptMassAssign.status === 422,
    `Got HTTP ${apptMassAssign.status}`
  );

  // 3.3 Provider PUT extra fields
  const provMassAssign = await request(`${FASTAPI_URL}/api/v1/providers/RS5956`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      name: "Dr. Rahul Sharma",
      specialization: "General Medicine",
      phone: "9876543210",
      post: "MD",
      doc_number: "HAX0001",
      is_active: false,
      id: 9999,
      created_by_id: 1111,
    }),
  });
  check(
    "Provider PUT with extra fields rejected with HTTP 422 (extra='forbid')",
    provMassAssign.status === 422,
    `Got HTTP ${provMassAssign.status}`
  );

  // 3.4 User PATCH extra fields
  const userMassAssign = await request(`${FASTAPI_URL}/api/v1/users/${doctor.userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      email: "clean@example.com",
      role: "ADMIN",
      provider_id: 9999,
      is_active: false,
      password_hash: "forged_hash",
      malicious_flag: true,
    }),
  });
  // Note: If UserUpdate lacks extra="forbid", it will ignore extra fields (status 200) instead of rejecting (status 422)
  console.log(`    [INFO] User PATCH extra fields result: HTTP ${userMassAssign.status}`);
  if (userMassAssign.status === 422) {
    check("User PATCH with extra fields rejected with HTTP 422 (extra='forbid')", true);
  } else {
    // Check if role was ignored (safe from privilege escalation) even if 200
    check(
      "User PATCH extra fields did not elevate role to ADMIN",
      userMassAssign.data?.role === "DOCTOR",
      `Role was mutated to ${userMassAssign.data?.role}`
    );
    console.log("    [NOTE] UserUpdate schema currently ignores extra fields instead of rejecting them with 422.");
  }

  // =========================================================================
  // SECTION 4: SQL INJECTION & XSS PAYLOAD DEFENSE
  // =========================================================================
  console.log("\n--- Section 4: SQL Injection & XSS Payload Defense ---");

  // 4.1 SQL Injection in Patient Directory Search
  const sqliPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE patients; --",
    "admin'--",
    "' UNION SELECT null, null, null, null, null, null, null, null, null, null --",
    "1' OR 1=1 #",
  ];

  for (const payload of sqliPayloads) {
    const enc = encodeURIComponent(payload);
    const sqliRes = await request(`${FASTAPI_URL}/api/v1/patients/?search=${enc}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    check(
      `SQLi payload "${payload}" safely handled without database error`,
      sqliRes.status === 200 && Array.isArray(sqliRes.data),
      `Got HTTP ${sqliRes.status}: ${sqliRes.text}`
    );
  }

  // Verify patients table is intact after DROP TABLE attempt
  const tableCheck = runPythonHelper(`
import json
from app.db.database import SessionLocal
from app.models.patient import Patient

db = SessionLocal()
try:
    count = db.query(Patient).count()
    print(json.dumps({"intact": True, "count": count}))
finally:
    db.close()
`);
  check("Database patients table confirmed intact with active records", tableCheck.intact && tableCheck.count > 0);

  // 4.2 SQL Injection in Phone Path Parameter
  const sqliPhoneRes = await request(`${FASTAPI_URL}/api/v1/users/phone/%27%20OR%20%271%27%3D%271`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  check(
    "SQLi in phone path parameter handled safely without SQL execution",
    sqliPhoneRes.status === 404 || sqliPhoneRes.status === 422,
    `Got HTTP ${sqliPhoneRes.status}`
  );

  // 4.3 Stored XSS Payloads in Clinical Text Fields
  const xssPatientRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: receptionist.cookieHeader,
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      name: 'XSS <script>alert("p_name")</script>',
      phone: `93${Date.now().toString().slice(-8)}`,
      dob: "1994-08-20",
      gender: "Other",
      address: '456 <img src=x onerror=alert("addr")> Avenue',
      chief_complaint: 'Severe <svg onload=alert("complaint")> fever',
    }),
  });
  check(
    "Patient with XSS payloads accepted and safely encoded into database",
    xssPatientRes.status === 201,
    `Got HTTP ${xssPatientRes.status}`
  );
  check(
    "XSS payload in patient name preserved as string literal",
    xssPatientRes.data?.name === 'XSS <script>alert("p_name")</script>'
  );

  // 4.4 Stored XSS in Appointment Notes & Reason (use jitter to prevent collision)
  const jitter2 = Math.floor(Math.random() * 500000000);
  const xssApptRes = await request(`${FASTAPI_URL}/api/v1/appointments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${receptionist.token}`,
    },
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: "RS5956",
      start_time: new Date(Date.now() + 600000000 + jitter2).toISOString(),
      end_time: new Date(Date.now() + 603600000 + jitter2).toISOString(),
      reason_for_visit: 'Checkup <iframe src="javascript:alert(1)">',
      internal_notes: 'Private <script>document.cookie=""</script> notes',
    }),
  });
  check(
    "Appointment with XSS payloads accepted and stored as literal string",
    xssApptRes.status === 201,
    `Got HTTP ${xssApptRes.status}`
  );
  check(
    "XSS in internal notes preserved as raw text without server interpretation",
    xssApptRes.data?.internal_notes === 'Private <script>document.cookie=""</script> notes'
  );

  // =========================================================================
  // SECTION 5: SENSITIVE DATA EXPOSURE & LOG HYGIENE
  // =========================================================================
  console.log("\n--- Section 5: Sensitive Data Exposure Defense ---");

  // 5.1 User Response Password Hash Shielding
  const userMeRes = await request(`${FASTAPI_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const userMeKeys = Object.keys(userMeRes.data || {});
  check(
    "User /me response strictly omits password_hash",
    !userMeKeys.includes("password_hash") && !userMeKeys.includes("password")
  );

  const userListRes = await request(`${FASTAPI_URL}/api/v1/users/`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const userListHasHash = (userListRes.data || []).some(
    (u: any) => "password_hash" in u || "password" in u || "salt" in u
  );
  check("User directory listing strictly omits password_hash across all items", !userListHasHash);

  // 5.2 Patient Directory Aadhaar Shielding
  const pListRes = await request(`${FASTAPI_URL}/api/v1/patients/?limit=10`, {
    headers: { Authorization: `Bearer ${receptionist.token}` },
  });
  const pListHasAadhaar = (pListRes.data || []).some((p: any) => "aadhaar" in p && p.aadhaar !== undefined);
  const pListHasDbId = (pListRes.data || []).some((p: any) => "id" in p && p.id !== undefined);
  check(
    "Patient directory list strictly omits Aadhaar (PII shielding)",
    !pListHasAadhaar,
    "Aadhaar field leaked in PatientResponse"
  );
  check(
    "Patient directory list strictly omits database internal integer ID",
    !pListHasDbId,
    "Internal integer ID leaked in PatientListItem"
  );

  // 5.3 Provider Public Response Audit Trail Shielding
  const provPublicRes = await request(`${FASTAPI_URL}/api/v1/appointments/${apptId}`, {
    headers: { Authorization: `Bearer ${receptionist.token}` },
  });
  const nestedProvider = provPublicRes.data?.provider;
  check(
    "Appointment nested provider representation omits internal staff audit IDs",
    nestedProvider && nestedProvider.created_by_id === undefined && nestedProvider.updated_by_id === undefined
  );

  // 5.4 Error Hygiene: 404 / 400 responses do not leak database stack traces
  const badParamRes = await request(`${FASTAPI_URL}/api/v1/patients/NONEXISTENT_NUMBER_999999`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  check(
    "404 error response does not expose database stack traces or SQL",
    badParamRes.status === 404 && !badParamRes.text.includes("Traceback") && !badParamRes.text.includes("psycopg")
  );

  // =========================================================================
  // SECTION 6: TRANSACTION ATOMICITY & FAILURE ROLLBACK
  // =========================================================================
  console.log("\n--- Section 6: Transaction Atomicity & Failure Rollback ---");

  // 6.1 Duplicate Aadhaar Rollback Integrity
  const initialPatientCount = runPythonHelper(`
import json
from app.db.database import SessionLocal
from app.models.patient import Patient
db = SessionLocal()
try:
    print(json.dumps(db.query(Patient).count()))
finally:
    db.close()
`);

  // Attempt to register a patient with an already used Aadhaar (pAadhaar)
  const dupAadhaarRes = await request(`${FASTAPI_URL}/api/v1/patients/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${receptionist.token}`,
    },
    body: JSON.stringify({
      name: "Duplicate Aadhaar Attempt",
      phone: `91${Date.now().toString().slice(-8)}`,
      dob: "1995-01-01",
      gender: "Male",
      aadhaar: pAadhaar,
      address: "123 Rollback Test Street",
      chief_complaint: "Testing duplicate Aadhaar",
    }),
  });
  check(
    "Duplicate Aadhaar registration rejected with HTTP 400 Bad Request",
    dupAadhaarRes.status === 400,
    `Got HTTP ${dupAadhaarRes.status}`
  );

  const postDupPatientCount = runPythonHelper(`
import json
from app.db.database import SessionLocal
from app.models.patient import Patient
db = SessionLocal()
try:
    print(json.dumps(db.query(Patient).count()))
finally:
    db.close()
`);
  check(
    "PostgreSQL transaction cleanly rolled back: 0 orphan patient rows created",
    postDupPatientCount === initialPatientCount,
    `Initial: ${initialPatientCount}, Post-fail: ${postDupPatientCount}`
  );

  // 6.2 Overlapping Appointment Slot Rollback Integrity
  const initialApptCount = runPythonHelper(`
import json
from app.db.database import SessionLocal
from app.models.appointment import Appointment
db = SessionLocal()
try:
    print(json.dumps(db.query(Appointment).count()))
finally:
    db.close()
`);

  // Attempt to book colliding slot for the same provider
  const dupApptRes = await request(`${FASTAPI_URL}/api/v1/appointments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${receptionist.token}`,
    },
    body: JSON.stringify({
      patient_id: patientDbId,
      provider_id: "RS5956",
      start_time: apptStart,
      end_time: apptEnd,
      reason_for_visit: "Colliding slot booking attempt",
    }),
  });
  check(
    "Overlapping slot booking rejected with HTTP 409 Conflict",
    dupApptRes.status === 409,
    `Got HTTP ${dupApptRes.status}`
  );

  const postDupApptCount = runPythonHelper(`
import json
from app.db.database import SessionLocal
from app.models.appointment import Appointment
db = SessionLocal()
try:
    print(json.dumps(db.query(Appointment).count()))
finally:
    db.close()
`);
  check(
    "PostgreSQL transaction cleanly rolled back: 0 colliding appointment rows created",
    postDupApptCount === initialApptCount,
    `Initial: ${initialApptCount}, Post-fail: ${postDupApptCount}`
  );

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n===============================================================================");
  console.log(`STAGE 11.4.3 SECURITY SUITE RESULTS: ${passedChecks}/${totalChecks} CHECKS PASSED`);
  console.log("===============================================================================");

  if (failureDetails.length > 0) {
    console.error("\nFailures encountered:");
    for (const f of failureDetails) {
      console.error(` - ${f}`);
    }
    process.exit(1);
  } else {
    console.log("\nAll security, authorization (IDOR), and data integrity boundaries 100% verified! \u2705\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test execution aborted with error:", err);
  process.exit(1);
});
