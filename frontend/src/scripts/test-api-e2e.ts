import { createBackendClient, ApiClient } from "../lib/api/client";
import { isApiClientError } from "../lib/api/errors";
import type { UserResponse, Patient } from "../types";

async function runE2eTest() {
  console.log("=== RUNNING STEP 6.6 REAL END-TO-END API TEST ===");
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6IkFETUlOIiwiZXhwIjoxNzkzMjAyMTg2fQ.G9zU31uj76t8OQOOQVdYXRiIz3RodVXg-dR3eeQfKaY";

  // 1. Test public root endpoint
  console.log("\n[Test 1] Testing Root Endpoint GET / ...");
  const publicClient = new ApiClient({ baseUrl: "http://127.0.0.1:8000" });
  const rootRes = await publicClient.get<{ message: string }>("/");
  console.log("✓ Root response:", rootRes);
  if (rootRes.message !== "Patient Management System API") {
    throw new Error("Unexpected root message: " + JSON.stringify(rootRes));
  }

  // 2. Test authenticated endpoint: GET /api/v1/users/me
  console.log("\n[Test 2] Testing Authenticated GET /api/v1/users/me with Bearer token ...");
  process.env.FASTAPI_BACKEND_URL = "http://127.0.0.1:8000";
  const authClient = createBackendClient(token);
  const userMe = await authClient.get<UserResponse>("/api/v1/users/me");
  console.log("✓ User Me profile received:", {
    id: userMe.id,
    phone: userMe.phone,
    role: userMe.role,
    isActive: userMe.is_active,
  });
  if (userMe.role !== "ADMIN") {
    throw new Error("Expected ADMIN role, got: " + userMe.role);
  }

  // 3. Test list query with pagination parameters: GET /api/v1/patients/?page=1&limit=5
  console.log("\n[Test 3] Testing Query Parameters GET /api/v1/patients/ ...");
  const patients = await authClient.get<Patient[]>("/api/v1/patients/", {
    params: { page: 1, limit: 5 },
  });
  console.log(`✓ Patients list query returned array of length: ${patients.length}`);

  // 4. Test 404 Not Found error handling: GET /api/v1/patients/PDC-999999
  console.log("\n[Test 4] Testing 404 error handling on non-existent patient ...");
  try {
    await authClient.get("/api/v1/patients/PDC-999999");
    throw new Error("Should have failed with 404");
  } catch (err) {
    if (isApiClientError(err)) {
      console.log(`✓ Caught expected ApiClientError: status=${err.status}, isNotFound=${err.isNotFound}, message="${err.message}"`);
      if (!err.isNotFound || err.status !== 404) {
        throw new Error(`Expected isNotFound=true and status=404, got status=${err.status}`);
      }
    } else {
      throw err;
    }
  }

  // 5. Test 401 Unauthorized handling with invalid token
  console.log("\n[Test 5] Testing 401 Unauthorized error handling with invalid token ...");
  const badClient = createBackendClient("invalid.bad.token");
  try {
    await badClient.get("/api/v1/users/me");
    throw new Error("Should have failed with 401");
  } catch (err) {
    if (isApiClientError(err)) {
      console.log(`✓ Caught expected ApiClientError: status=${err.status}, isUnauthorized=${err.isUnauthorized}, message="${err.message}"`);
      if (!err.isUnauthorized || err.status !== 401) {
        throw new Error(`Expected isUnauthorized=true and status=401, got status=${err.status}`);
      }
    } else {
      throw err;
    }
  }

  console.log("\n🎉 ALL STEP 6.6 END-TO-END TESTS PASSED SUCCESSFULLY!");
}

runE2eTest().catch((err) => {
  console.error("❌ E2E Test Failed:", err);
  process.exit(1);
});
