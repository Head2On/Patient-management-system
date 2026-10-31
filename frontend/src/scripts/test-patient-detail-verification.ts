/* eslint-disable @typescript-eslint/no-explicit-any */

async function main() {
  console.log("=== Verifying GET /api/patients/{patient_number} Endpoint ===");

  // 1. Authenticate via BFF login
  const loginRes = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ phone: "9999999999", password: "AdminPass123" }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }

  const rawCookies: string[] = (loginRes.headers as any).getSetCookie
    ? (loginRes.headers as any).getSetCookie()
    : [loginRes.headers.get("set-cookie") || ""];

  const cookieHeader = rawCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  // 2. Ensure at least one patient exists (e.g. PDC-000001)
  const listRes = await fetch("http://localhost:3000/api/patients/?page=1&limit=5", {
    headers: { Cookie: cookieHeader },
  });
  const listData = await listRes.json();
  console.log(`Current patients count in list: ${Array.isArray(listData) ? listData.length : 0}`);

  let targetPatientNumber = "PDC-000001";

  if (!Array.isArray(listData) || listData.length === 0) {
    console.log("Creating sample patient to ensure PDC-000001 exists...");
    const createRes = await fetch("http://localhost:3000/api/patients/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        name: "Jane Doe",
        phone: "9876543210",
        dob: "1990-01-15",
        gender: "Female",
        address: "123 Healthcare Ave, Metro City",
        chief_complaint: "Annual general checkup",
      }),
    });
    const created = await createRes.json();
    console.log("Created patient:", created.patient_number);
    targetPatientNumber = created.patient_number;
  } else {
    // If PDC-000001 is in the list or use the first available
    const hasPDC1 = listData.some((p: any) => p.patient_number === "PDC-000001");
    if (!hasPDC1) {
      targetPatientNumber = listData[0].patient_number;
    }
  }

  // 3. Call GET /api/patients/{targetPatientNumber}
  console.log(`\n--- Calling GET /api/patients/${targetPatientNumber} ---`);
  const detailRes = await fetch(`http://localhost:3000/api/patients/${targetPatientNumber}`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`Detail Response Status: ${detailRes.status} ${detailRes.statusText}`);
  const detailData = await detailRes.json();
  console.log("Detail Response Keys:", Object.keys(detailData));
  console.log("Detail Response Raw Structure (with sample data):", detailData);

  // 4. Compare fields with list item
  if (Array.isArray(listData) && listData.length > 0) {
    const listItem = listData.find((p: any) => p.patient_number === targetPatientNumber) || listData[0];
    console.log("\n--- Comparison between List Item and Detail Item ---");
    console.log("List Item Keys:  ", Object.keys(listItem).sort());
    console.log("Detail Item Keys:", Object.keys(detailData).sort());
    
    const extraInDetail = Object.keys(detailData).filter(k => !(k in listItem));
    const extraInList = Object.keys(listItem).filter(k => !(k in detailData));
    console.log("Extra keys in Detail:", extraInDetail);
    console.log("Extra keys in List:  ", extraInList);
  }

  // 5. Test nonexistent patient: GET /api/patients/PDC-999999
  console.log("\n--- Calling GET /api/patients/PDC-999999 (Nonexistent) ---");
  const nonExistentRes = await fetch("http://localhost:3000/api/patients/PDC-999999", {
    headers: { Cookie: cookieHeader },
  });
  console.log(`Nonexistent Response Status: ${nonExistentRes.status} ${nonExistentRes.statusText}`);
  const nonExistentData = await nonExistentRes.json().catch(() => null);
  console.log("Nonexistent Response Body:", nonExistentData);

  // 6. Test Inactive Patient Retrieval:
  // Create a temporary patient, deactivate them, and attempt GET /api/patients/{patient_number}
  console.log("\n--- Testing Inactive Patient Retrieval ---");
  const tempPatientRes = await fetch("http://localhost:3000/api/patients/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      name: "Temporary Deactivate Test",
      phone: "9123456789",
      dob: "1985-05-20",
      gender: "Male",
      address: "456 Temporary Rd",
      chief_complaint: "Deactivation test",
    }),
  });
  const tempPatient = await tempPatientRes.json();
  const tempNumber = tempPatient.patient_number;
  console.log(`Created temp patient for deactivation: ${tempNumber}`);

  // Deactivate the patient
  const deleteRes = await fetch(`http://localhost:3000/api/patients/${tempNumber}`, {
    method: "DELETE",
    headers: {
      Origin: "http://localhost:3000",
      Cookie: cookieHeader,
    },
  });
  console.log(`Deactivate Status: ${deleteRes.status} ${deleteRes.statusText}`);

  // Now attempt GET on deactivated patient
  const getDeactivatedRes = await fetch(`http://localhost:3000/api/patients/${tempNumber}`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`GET Deactivated Patient Status: ${getDeactivatedRes.status} ${getDeactivatedRes.statusText}`);
  const deactivatedBody = await getDeactivatedRes.json().catch(() => null);
  console.log("GET Deactivated Patient Body:", deactivatedBody);

  // Reactivate so we don't leave dirty test state
  const reactivateRes = await fetch(`http://localhost:3000/api/patients/${tempNumber}/reactivate`, {
    method: "PATCH",
    headers: {
      Origin: "http://localhost:3000",
      Cookie: cookieHeader,
    },
  });
  console.log(`Reactivation Status: ${reactivateRes.status} ${reactivateRes.statusText}`);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
