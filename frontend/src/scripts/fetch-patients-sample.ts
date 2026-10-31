/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchPatientSample() {
  const loginRes = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ phone: "9999999999", password: "AdminPass123" }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }

  const rawCookies: string[] = (loginRes.headers as any).getSetCookie
    ? (loginRes.headers as any).getSetCookie()
    : [loginRes.headers.get("set-cookie") || ""];

  const cookieHeader = rawCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  // Fetch initial list
  let patientsRes = await fetch("http://localhost:3000/api/patients/?page=1&limit=5", {
    headers: { Cookie: cookieHeader },
  });

  let data = await patientsRes.json();

  // If empty, create a temporary patient record to verify full field structure
  if (Array.isArray(data) && data.length === 0) {
    console.log("No existing patients in dev DB. Creating a sample record to verify contract schema...");
    const createRes = await fetch("http://localhost:3000/api/patients/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        name: "Sample Patient",
        phone: "9876543210",
        dob: "1988-06-15",
        gender: "Female",
        address: "123 Medical Center Way",
        chief_complaint: "Routine clinical checkup",
      }),
    });

    if (createRes.ok) {
      patientsRes = await fetch("http://localhost:3000/api/patients/?page=1&limit=5", {
        headers: { Cookie: cookieHeader },
      });
      data = await patientsRes.json();
    }
  }

  console.log("=== ACTUAL PATIENT LIST JSON RESPONSE ===");
  console.log("Response Type:", Array.isArray(data) ? "Array (Patient[])" : typeof data);
  console.log("Total Items Returned:", Array.isArray(data) ? data.length : 1);
  console.log("\nJSON Payload (Redacted Sample):");
  
  if (Array.isArray(data) && data.length > 0) {
    const redacted = data.map((p) => ({
      ...p,
      phone: "REDACTED-PHONE",
      address: "REDACTED-ADDRESS",
    }));
    console.log(JSON.stringify(redacted, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

fetchPatientSample().catch((err) => {
  console.error("Error fetching sample:", err);
  process.exit(1);
});
