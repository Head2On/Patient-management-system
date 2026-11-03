/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * STAGE 11.4.1: APPOINTMENT CONCURRENCY & SCHEDULING INTEGRITY
 * 
 * Tests concurrent appointment operations across Browser -> Next.js BFF -> FastAPI -> PostgreSQL:
 * 1. Two simultaneous requests booking the same provider for overlapping times.
 * 2. Two simultaneous requests booking the same patient for overlapping times.
 * 3. Adjacent non-overlapping appointments.
 * 4. Cancelled appointment time slot release.
 * 5. Completed appointment slot behavior.
 * 6. Simultaneous updates to the same appointment.
 * 7. Simultaneous conflicting status transitions.
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

async function queryAppointmentsForProvider(providerDocNumber: string): Promise<any[]> {
  const projectRoot = path.resolve(__dirname, "../../../");
  const pythonScript = `
import json
from app.db.database import SessionLocal
from app.models.appointment import Appointment
from app.models.provider import Provider

db = SessionLocal()
try:
    provider = db.query(Provider).filter(Provider.doc_number == "${providerDocNumber}").first()
    if not provider:
        print(json.dumps([]))
    else:
        appts = db.query(Appointment).filter(Appointment.provider_id == provider.id).order_by(Appointment.id).all()
        result = [
            {
                "id": a.id,
                "patient_id": a.patient_id,
                "provider_id": a.provider_id,
                "start_time": a.start_time.isoformat(),
                "end_time": a.end_time.isoformat(),
                "status": a.status,
                "reason_for_visit": a.reason_for_visit,
                "internal_notes": a.internal_notes,
                "updated_by_id": a.updated_by_id
            }
            for a in appts
        ]
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

async function queryAppointmentsForPatient(patientId: number): Promise<any[]> {
  const projectRoot = path.resolve(__dirname, "../../../");
  const pythonScript = `
import json
from app.db.database import SessionLocal
from app.models.appointment import Appointment

db = SessionLocal()
try:
    appts = db.query(Appointment).filter(Appointment.patient_id == ${patientId}).order_by(Appointment.id).all()
    result = [
        {
            "id": a.id,
            "patient_id": a.patient_id,
            "provider_id": a.provider_id,
            "start_time": a.start_time.isoformat(),
            "end_time": a.end_time.isoformat(),
            "status": a.status,
            "reason_for_visit": a.reason_for_visit
        }
        for a in appts
    ]
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

async function queryAppointmentById(appointmentId: number): Promise<any> {
  const projectRoot = path.resolve(__dirname, "../../../");
  const pythonScript = `
import json
from app.db.database import SessionLocal
from app.models.appointment import Appointment

db = SessionLocal()
try:
    appt = db.query(Appointment).filter(Appointment.id == ${appointmentId}).first()
    result = {
        "id": appt.id,
        "patient_id": appt.patient_id,
        "provider_id": appt.provider_id,
        "start_time": appt.start_time.isoformat(),
        "end_time": appt.end_time.isoformat(),
        "status": appt.status,
        "reason_for_visit": appt.reason_for_visit,
        "internal_notes": appt.internal_notes,
        "created_by_id": appt.created_by_id,
        "updated_by_id": appt.updated_by_id
    } if appt else None
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

async function runStage11ConcurrencyVerification() {
  console.log("================================================================================");
  console.log("STAGE 11.4.1: APPOINTMENT CONCURRENCY & SCHEDULING INTEGRITY VERIFICATION");
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

  console.log("✓ Admin, Receptionist, and Doctor sessions established\n");

  // ================================================================================
  // SETUP: DEDICATED PROVIDER & PATIENTS FOR CONCURRENCY TESTS
  // ================================================================================
  console.log("--- SETUP: PROVISIONING TEST INFRASTRUCTURE ---");
  // Provider 1 (Dr. Arjun Banerjee)
  const provPhone1 = `41111${Math.floor(10000 + Math.random() * 90000)}`;
  const prov1Res = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Arjun Banerjee",
      specialization: "General Medicine",
      phone: provPhone1,
      email: "arjun.banerjee@caredesk.com",
      post: "MD",
    }),
  });
  assert(prov1Res.status === 201 && prov1Res.data?.doc_number, `Created Provider 1: ${prov1Res.data?.doc_number}`);
  const provDoc1 = prov1Res.data.doc_number;

  // Provider 2 (Dr. Priya Nair)
  const provPhone2 = `42222${Math.floor(10000 + Math.random() * 90000)}`;
  const prov2Res = await request(`${BASE_URL}/api/providers/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "Dr. Priya Nair",
      specialization: "Pediatrics",
      phone: provPhone2,
      email: "priya.nair@caredesk.com",
      post: "MD",
    }),
  });
  assert(prov2Res.status === 201 && prov2Res.data?.doc_number, `Created Provider 2: ${prov2Res.data?.doc_number}`);
  const provDoc2 = prov2Res.data.doc_number;

  // Patient Alpha
  const phoneA = `67777${Math.floor(10000 + Math.random() * 90000)}`;
  const patARes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Patient Concurrency Alpha",
      phone: phoneA,
      gender: "Male",
      dob: "1990-01-15",
      address: "10 Park Street, Kolkata",
      chief_complaint: "Concurrency testing alpha",
    }),
  });
  const patNumA = patARes.data.patient_number;
  const patADetail = await request(`${BASE_URL}/api/patients/${patNumA}`, { headers: receptionistHeaders });
  const patDbIdA: number = patADetail.data.id;
  assert(Boolean(patDbIdA), `Created Patient Alpha: ${patNumA} (DB ID: ${patDbIdA})`);

  // Patient Beta
  const phoneB = `68888${Math.floor(10000 + Math.random() * 90000)}`;
  const patBRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Patient Concurrency Beta",
      phone: phoneB,
      gender: "Female",
      dob: "1992-05-20",
      address: "20 Theatre Road, Kolkata",
      chief_complaint: "Concurrency testing beta",
    }),
  });
  const patNumB = patBRes.data.patient_number;
  const patBDetail = await request(`${BASE_URL}/api/patients/${patNumB}`, { headers: receptionistHeaders });
  const patDbIdB: number = patBDetail.data.id;
  assert(Boolean(patDbIdB), `Created Patient Beta: ${patNumB} (DB ID: ${patDbIdB})`);

  // Patient Gamma
  const phoneC = `69999${Math.floor(10000 + Math.random() * 90000)}`;
  const patCRes = await request(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      name: "Patient Concurrency Gamma",
      phone: phoneC,
      gender: "Male",
      dob: "1988-10-10",
      address: "30 Rashbehari Avenue, Kolkata",
      chief_complaint: "Concurrency testing gamma",
    }),
  });
  const patNumC = patCRes.data.patient_number;
  const patCDetail = await request(`${BASE_URL}/api/patients/${patNumC}`, { headers: receptionistHeaders });
  const patDbIdC: number = patCDetail.data.id;
  assert(Boolean(patDbIdC), `Created Patient Gamma: ${patNumC} (DB ID: ${patDbIdC})`);

  // ================================================================================
  // 11.4.1.1: TWO RECEPTIONISTS SIMULTANEOUSLY BOOKING SAME PROVIDER OVERLAPPING TIMES
  // ================================================================================
  console.log("\n================================================================================");
  console.log("11.4.1.1: SIMULTANEOUS BOOKINGS FOR SAME PROVIDER (OVERLAPPING TIMES)");
  console.log("================================================================================");

  const slot1Start = new Date(Date.now() + 86400000 * 30).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot1End = new Date(Date.now() + 86400000 * 30 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  console.log(`Target Provider: ${provDoc1}`);
  console.log(`Slot: ${slot1Start} -> ${slot1End}`);
  console.log("Dispatching simultaneous requests via Promise.all (Patient Alpha vs Patient Beta)...");

  const [provRes1, provRes2] = await Promise.all([
    request(`${BASE_URL}/api/appointments/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        patient_id: patDbIdA,
        provider_id: provDoc1,
        start_time: slot1Start,
        end_time: slot1End,
        reason_for_visit: "Simultaneous Provider Booking 1",
      }),
    }),
    request(`${BASE_URL}/api/appointments/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        patient_id: patDbIdB,
        provider_id: provDoc1,
        start_time: slot1Start,
        end_time: slot1End,
        reason_for_visit: "Simultaneous Provider Booking 2",
      }),
    }),
  ]);

  const provStatuses = [provRes1.status, provRes2.status].sort();
  console.log(`Responses: Status 1 = ${provRes1.status}, Status 2 = ${provRes2.status}`);

  assert(
    provStatuses[0] === 201 && provStatuses[1] === 409,
    `Provider double-booking prevented: Exactly one request succeeded (201) and one rejected (409 Conflict)`
  );

  // PostgreSQL verification
  const prov1DbRecords = await queryAppointmentsForProvider(provDoc1);
  const matchingProv1Slots = prov1DbRecords.filter(
    (a) => new Date(a.start_time).getTime() === new Date(slot1Start).getTime()
  );
  assert(
    matchingProv1Slots.length === 1,
    `PostgreSQL confirms exactly 1 appointment recorded for provider ${provDoc1} at slot ${slot1Start}`
  );

  // ================================================================================
  // 11.4.1.2: TWO SIMULTANEOUS REQUESTS BOOKING SAME PATIENT FOR OVERLAPPING APPOINTMENTS
  // ================================================================================
  console.log("\n================================================================================");
  console.log("11.4.1.2: SIMULTANEOUS BOOKINGS FOR SAME PATIENT (DIFFERENT PROVIDERS)");
  console.log("================================================================================");

  // Attempting to book Patient Gamma simultaneously with Provider 1 and Provider 2 at the same time
  const slot2Start = new Date(Date.now() + 86400000 * 31).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot2End = new Date(Date.now() + 86400000 * 31 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  console.log(`Target Patient: ${patNumC} (DB ID: ${patDbIdC})`);
  console.log(`Slot: ${slot2Start} -> ${slot2End}`);
  console.log(`Request 1: Booking Patient Gamma with Provider 1 (${provDoc1})`);
  console.log(`Request 2: Booking Patient Gamma with Provider 2 (${provDoc2})`);

  const [patRes1, patRes2] = await Promise.all([
    request(`${BASE_URL}/api/appointments/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        patient_id: patDbIdC,
        provider_id: provDoc1,
        start_time: slot2Start,
        end_time: slot2End,
        reason_for_visit: "Simultaneous Patient Booking with Provider 1",
      }),
    }),
    request(`${BASE_URL}/api/appointments/`, {
      method: "POST",
      headers: receptionistHeaders,
      body: JSON.stringify({
        patient_id: patDbIdC,
        provider_id: provDoc2,
        start_time: slot2Start,
        end_time: slot2End,
        reason_for_visit: "Simultaneous Patient Booking with Provider 2",
      }),
    }),
  ]);

  const patStatuses = [patRes1.status, patRes2.status].sort();
  console.log(`Responses: Status 1 = ${patRes1.status}, Status 2 = ${patRes2.status}`);

  assert(
    patStatuses[0] === 201 && patStatuses[1] === 409,
    `Patient double-booking prevented: Exactly one request succeeded (201) and one rejected with HTTP 409 Conflict`
  );

  // PostgreSQL verification
  const patCDbRecords = await queryAppointmentsForPatient(patDbIdC);
  const matchingPatCSlots = patCDbRecords.filter(
    (a) => new Date(a.start_time).getTime() === new Date(slot2Start).getTime()
  );
  assert(
    matchingPatCSlots.length === 1,
    `PostgreSQL confirms exactly 1 appointment recorded for patient ${patDbIdC} at slot ${slot2Start}`
  );

  // ================================================================================
  // 11.4.1.3: ADJACENT, NON-OVERLAPPING APPOINTMENTS
  // ================================================================================
  console.log("\n================================================================================");
  console.log("11.4.1.3: ADJACENT, NON-OVERLAPPING APPOINTMENTS");
  console.log("================================================================================");

  // Slot 3A: 10:00 -> 10:30
  // Slot 3B: 10:30 -> 11:00 (exact boundary touch)
  const slot3AStart = new Date(Date.now() + 86400000 * 32).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot3AEnd = new Date(Date.now() + 86400000 * 32 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot3BStart = slot3AEnd;
  const slot3BEnd = new Date(Date.now() + 86400000 * 32 + 3600000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const adjRes1 = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdA,
      provider_id: provDoc2,
      start_time: slot3AStart,
      end_time: slot3AEnd,
      reason_for_visit: "Adjacent Slot A (10:00 - 10:30)",
    }),
  });
  assert(adjRes1.status === 201, `Adjacent appointment A created (HTTP 201, ID: ${adjRes1.data?.id})`);

  const adjRes2 = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdB,
      provider_id: provDoc2,
      start_time: slot3BStart,
      end_time: slot3BEnd,
      reason_for_visit: "Adjacent Slot B (10:30 - 11:00)",
    }),
  });
  assert(adjRes2.status === 201, `Adjacent appointment B created (HTTP 201, ID: ${adjRes2.data?.id})`);
  assert(
    adjRes1.data?.end_time === adjRes2.data?.start_time,
    `Boundary verification: Slot A end_time exactly equals Slot B start_time`
  );

  // ================================================================================
  // 11.4.1.4: CANCELLED APPOINTMENT RELEASES ITS TIME SLOT
  // ================================================================================
  console.log("\n================================================================================");
  console.log("11.4.1.4: CANCELLED APPOINTMENT RELEASES ITS TIME SLOT");
  console.log("================================================================================");

  const slot4Start = new Date(Date.now() + 86400000 * 33).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot4End = new Date(Date.now() + 86400000 * 33 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  // Step 1: Book initial appointment
  const initialApptRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdA,
      provider_id: provDoc1,
      start_time: slot4Start,
      end_time: slot4End,
      reason_for_visit: "To be cancelled",
    }),
  });
  assert(initialApptRes.status === 201, `Initial appointment booked (ID: ${initialApptRes.data?.id})`);
  const cancelledApptId = initialApptRes.data.id;

  // Step 2: Cancel the appointment
  const cancelRes = await request(`${BASE_URL}/api/appointments/${cancelledApptId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "cancelled" }),
  });
  assert(cancelRes.status === 200 && cancelRes.data?.status === "cancelled", `Appointment ${cancelledApptId} cancelled`);

  // Step 3: Book new appointment for the exact same slot with Patient Beta
  const releasedSlotBookingRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdB,
      provider_id: provDoc1,
      start_time: slot4Start,
      end_time: slot4End,
      reason_for_visit: "Re-booking into released slot",
    }),
  });
  assert(
    releasedSlotBookingRes.status === 201 && releasedSlotBookingRes.data?.id,
    `Time slot successfully released: New appointment booked in released slot (ID: ${releasedSlotBookingRes.data?.id})`
  );

  // PostgreSQL verification
  const cancelledSlotDbRecords = await queryAppointmentsForProvider(provDoc1);
  const matchingSlot4Appts = cancelledSlotDbRecords.filter(
    (a) => new Date(a.start_time).getTime() === new Date(slot4Start).getTime()
  );
  assert(
    matchingSlot4Appts.length === 2,
    `PostgreSQL confirms 2 records exist for slot: 1 cancelled (ID: ${cancelledApptId}) and 1 scheduled (ID: ${releasedSlotBookingRes.data.id})`
  );

  // ================================================================================
  // 11.4.1.5: COMPLETED APPOINTMENT HISTORICAL SLOT RETENTION
  // ================================================================================
  console.log("\n================================================================================");
  console.log("11.4.1.5: COMPLETED APPOINTMENT HISTORICAL SLOT RETENTION");
  console.log("================================================================================");

  const slot5Start = new Date(Date.now() + 86400000 * 34).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot5End = new Date(Date.now() + 86400000 * 34 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  // Step 1: Book appointment and advance to completed
  const completedApptBooking = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdA,
      provider_id: provDoc1,
      start_time: slot5Start,
      end_time: slot5End,
      reason_for_visit: "Clinical evaluation to be completed",
    }),
  });
  assert(completedApptBooking.status === 201, `Booked appointment (ID: ${completedApptBooking.data?.id})`);
  const completedApptId = completedApptBooking.data.id;

  await request(`${BASE_URL}/api/appointments/${completedApptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "confirmed" }),
  });
  await request(`${BASE_URL}/api/appointments/${completedApptId}`, {
    method: "PATCH",
    headers: receptionistHeaders,
    body: JSON.stringify({ status: "checked_in" }),
  });
  await request(`${BASE_URL}/api/appointments/${completedApptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "in_progress", internal_notes: "Completed consultation test" }),
  });
  const finishRes = await request(`${BASE_URL}/api/appointments/${completedApptId}`, {
    method: "PATCH",
    headers: doctorHeaders,
    body: JSON.stringify({ status: "completed" }),
  });
  assert(finishRes.status === 200 && finishRes.data?.status === "completed", `Appointment advanced to 'completed'`);

  // Step 2: Test whether a completed appointment permits or blocks re-booking into the historical slot
  const overlapWithCompletedAttempt = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdB,
      provider_id: provDoc1,
      start_time: slot5Start,
      end_time: slot5End,
      reason_for_visit: "Re-booking historical slot of completed appointment",
    }),
  });
  console.log(`Overlap with completed slot response: HTTP ${overlapWithCompletedAttempt.status}`);
  assert(
    overlapWithCompletedAttempt.status === 201 && overlapWithCompletedAttempt.data?.id,
    `Completed appointment slot is reusable according to scheduling policy: New appointment booked (HTTP 201, ID: ${overlapWithCompletedAttempt.data?.id})`
  );

  // PostgreSQL verification: Both historical completed record and new appointment exist intact
  const slot5DbRecords = await queryAppointmentsForProvider(provDoc1);
  const matchingSlot5Appts = slot5DbRecords.filter(
    (a) => new Date(a.start_time).getTime() === new Date(slot5Start).getTime()
  );
  assert(
    matchingSlot5Appts.length === 2 &&
      matchingSlot5Appts.some((a) => a.status === "completed") &&
      matchingSlot5Appts.some((a) => a.status === "scheduled"),
    `PostgreSQL confirms completed appointment (ID: ${completedApptId}) remains intact while slot is reused (ID: ${overlapWithCompletedAttempt.data.id})`
  );

  // ================================================================================
  // 11.4.1.6: TWO USERS SIMULTANEOUSLY ATTEMPTING TO UPDATE THE SAME APPOINTMENT
  // ================================================================================
  console.log("\n================================================================================");
  console.log("11.4.1.6: SIMULTANEOUS UPDATES TO THE SAME APPOINTMENT");
  console.log("================================================================================");

  const slot6Start = new Date(Date.now() + 86400000 * 35).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot6End = new Date(Date.now() + 86400000 * 35 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const apptForUpdateRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdA,
      provider_id: provDoc1,
      start_time: slot6Start,
      end_time: slot6End,
      reason_for_visit: "Initial reason before concurrent updates",
    }),
  });
  assert(apptForUpdateRes.status === 201, `Appointment created for concurrent updates (ID: ${apptForUpdateRes.data?.id})`);
  const apptToUpdateId = apptForUpdateRes.data.id;

  // Simultaneous updates:
  // User 1 (Receptionist): updates reason_for_visit
  // User 2 (Doctor): updates internal_notes
  const [updateRes1, updateRes2] = await Promise.all([
    request(`${BASE_URL}/api/appointments/${apptToUpdateId}`, {
      method: "PATCH",
      headers: receptionistHeaders,
      body: JSON.stringify({ reason_for_visit: "Updated by Receptionist" }),
    }),
    request(`${BASE_URL}/api/appointments/${apptToUpdateId}`, {
      method: "PATCH",
      headers: doctorHeaders,
      body: JSON.stringify({ internal_notes: "Updated by Doctor concurrently" }),
    }),
  ]);

  assert(updateRes1.status === 200, `Receptionist update succeeded with HTTP 200`);
  assert(updateRes2.status === 200, `Doctor update succeeded with HTTP 200`);

  // Verify PostgreSQL state
  const finalUpdatedDb = await queryAppointmentById(apptToUpdateId);
  assert(finalUpdatedDb !== null, `Database record ${apptToUpdateId} exists`);
  assert(
    finalUpdatedDb.reason_for_visit === "Updated by Receptionist" || finalUpdatedDb.internal_notes === "Updated by Doctor concurrently",
    `Database state holds valid data without record corruption`
  );
  console.log(`Final DB State for Appointment ${apptToUpdateId}: reason='${finalUpdatedDb.reason_for_visit}', notes='${finalUpdatedDb.internal_notes}', updated_by=${finalUpdatedDb.updated_by_id}`);

  // ================================================================================
  // 11.4.1.7: TWO USERS SIMULTANEOUSLY ATTEMPTING CONFLICTING STATUS TRANSITIONS
  // ================================================================================
  console.log("\n================================================================================");
  console.log("11.4.1.7: SIMULTANEOUS CONFLICTING STATUS TRANSITIONS");
  console.log("================================================================================");

  const slot7Start = new Date(Date.now() + 86400000 * 36).toISOString().replace(/\.\d{3}Z$/, "Z");
  const slot7End = new Date(Date.now() + 86400000 * 36 + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const apptForTransitionRes = await request(`${BASE_URL}/api/appointments/`, {
    method: "POST",
    headers: receptionistHeaders,
    body: JSON.stringify({
      patient_id: patDbIdB,
      provider_id: provDoc1,
      start_time: slot7Start,
      end_time: slot7End,
      reason_for_visit: "Testing conflicting status transitions",
    }),
  });
  assert(apptForTransitionRes.status === 201, `Created appointment for transition test (ID: ${apptForTransitionRes.data?.id})`);
  const transitionApptId = apptForTransitionRes.data.id;

  // Simultaneous conflicting transitions from 'scheduled':
  // Request 1: transition to 'confirmed'
  // Request 2: transition to 'cancelled'
  console.log(`Dispatching simultaneous status transitions on Appointment ${transitionApptId}: 'confirmed' vs 'cancelled'...`);
  const [transRes1, transRes2] = await Promise.all([
    request(`${BASE_URL}/api/appointments/${transitionApptId}`, {
      method: "PATCH",
      headers: doctorHeaders,
      body: JSON.stringify({ status: "confirmed" }),
    }),
    request(`${BASE_URL}/api/appointments/${transitionApptId}`, {
      method: "PATCH",
      headers: receptionistHeaders,
      body: JSON.stringify({ status: "cancelled" }),
    }),
  ]);

  console.log(`Status Transition Responses: Req1=${transRes1.status} (${transRes1.data?.status}), Req2=${transRes2.status} (${transRes2.data?.status})`);

  // At least one transition succeeds; both may succeed sequentially if transition matrix allows confirmed -> cancelled
  assert(transRes1.status === 200 || transRes2.status === 200, `At least one transition succeeded`);

  // Check final PostgreSQL status
  const finalTransitionDb = await queryAppointmentById(transitionApptId);
  assert(
    ["confirmed", "cancelled"].includes(finalTransitionDb.status),
    `Final PostgreSQL status is a valid lifecycle state: '${finalTransitionDb.status}'`
  );
  console.log(`Final PostgreSQL status for appointment ${transitionApptId}: '${finalTransitionDb.status}'`);

  // Terminal state lock test: If cancelled, attempting to transition to 'in_progress' or 'confirmed' must be rejected
  if (finalTransitionDb.status === "cancelled") {
    const invalidAfterCancel = await request(`${BASE_URL}/api/appointments/${transitionApptId}`, {
      method: "PATCH",
      headers: doctorHeaders,
      body: JSON.stringify({ status: "in_progress" }),
    });
    assert(
      invalidAfterCancel.status === 400,
      `Terminal state integrity: Transition from 'cancelled' to 'in_progress' rejected with HTTP 400`
    );
  }

  console.log("\n================================================================================");
  console.log(`🎉 ALL STAGE 11.4.1 CONCURRENCY & INTEGRITY CHECKS COMPLETED (${passed}/${total} GREEN, 100%)!`);
  console.log("================================================================================\n");
}

runStage11ConcurrencyVerification().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});

export {};
