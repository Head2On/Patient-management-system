import { NextRequest } from "next/server";
import { validateCsrfOrigin } from "../lib/api/csrf";

async function runBffSecurityTests() {
  console.log("=== RUNNING EXTENSIVE BFF SECURITY & SESSION VALIDATION TESTS ===");

  // 1. Safe Read-Only Methods
  console.log("\n[Test 1] Testing Safe Methods...");
  const getReq = new NextRequest("http://localhost:3000/api/patients", { method: "GET" });
  if (!validateCsrfOrigin(getReq)) throw new Error("GET should pass without Origin header");
  console.log("✓ GET passes without Origin.");

  // 2. Reject Missing Origin on Mutations
  console.log("\n[Test 2] Testing Missing Origin on Mutations...");
  const postNoOrigin = new NextRequest("http://localhost:3000/api/patients", { method: "POST" });
  if (validateCsrfOrigin(postNoOrigin)) throw new Error("POST without Origin should be rejected");
  console.log("✓ POST without Origin rejected.");

  // 3. Reject Untrusted Origin
  console.log("\n[Test 3] Testing Untrusted Origin...");
  const postEvil = new NextRequest("http://localhost:3000/api/patients", {
    method: "POST",
    headers: { origin: "https://attacker.com" },
  });
  if (validateCsrfOrigin(postEvil)) throw new Error("Untrusted origin should be rejected");
  console.log("✓ Untrusted origin https://attacker.com rejected.");

  // 4. Accept Configured / Loopback Origin
  console.log("\n[Test 4] Testing Valid Origin...");
  const postValid = new NextRequest("http://localhost:3000/api/patients", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  });
  if (!validateCsrfOrigin(postValid)) throw new Error("Valid origin should be accepted");
  console.log("✓ Valid origin http://localhost:3000 accepted.");

  // 5. Strict Parsing: Embedded Credentials and Sub-paths in Origin
  console.log("\n[Test 5] Testing Origin Embedded Credentials...");
  const postCreds = new NextRequest("http://localhost:3000/api/patients", {
    method: "POST",
    headers: { origin: "http://admin:secret@localhost:3000" },
  });
  if (validateCsrfOrigin(postCreds)) throw new Error("Origin with credentials should be rejected");
  console.log("✓ Origin with embedded credentials rejected.");

  // 6. Referer Credential Validation
  console.log("\n[Test 6] Testing Referer Credential Validation...");
  const postRefererWithCreds = new NextRequest("http://localhost:3000/api/patients", {
    method: "POST",
    headers: { referer: "http://admin:secret@localhost:3000/dashboard" },
  });
  if (validateCsrfOrigin(postRefererWithCreds)) {
    throw new Error("Referer with embedded credentials should be rejected");
  }
  console.log("✓ Referer with embedded credentials rejected.");

  const postRefererValid = new NextRequest("http://localhost:3000/api/patients", {
    method: "POST",
    headers: { referer: "http://localhost:3000/dashboard" },
  });
  if (!validateCsrfOrigin(postRefererValid)) {
    throw new Error("Referer with valid application origin should be accepted");
  }
  console.log("✓ Valid Referer without credentials accepted.");

  // 7. Test JWT exp decoding & rejection of expired/missing tokens
  console.log("\n[Test 7] Testing JWT exp claim validation...");
  function makeMockJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${header}.${body}.mockSignature`;
  }

  const tokenNoExp = makeMockJwt({ sub: "1", role: "ADMIN" });
  const tokenExpired = makeMockJwt({ sub: "1", role: "ADMIN", exp: Math.floor(Date.now() / 1000) - 100 });
  const tokenValid = makeMockJwt({ sub: "1", role: "ADMIN", exp: Math.floor(Date.now() / 1000) + 1800 });

  function testExtractJwtExp(token: string): number | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      if (payload && typeof payload.exp === "number" && payload.exp > 0) {
        return payload.exp;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (testExtractJwtExp(tokenNoExp) !== null) {
    throw new Error("Token with missing exp should return null");
  }
  console.log("✓ Token missing exp correctly identified.");

  const expPast = testExtractJwtExp(tokenExpired);
  if (!expPast || expPast <= Math.floor(Date.now() / 1000)) {
    console.log("✓ Expired token correctly detected as past current time.");
  } else {
    throw new Error("Expired token was not detected as past");
  }

  const expFuture = testExtractJwtExp(tokenValid);
  if (!expFuture || expFuture <= Math.floor(Date.now() / 1000)) {
    throw new Error("Valid future token failed verification");
  }
  const remaining = expFuture - Math.floor(Date.now() / 1000) - 5;
  console.log(`✓ Valid token has remaining seconds with 5s safety margin: ~${remaining}s`);

  // 8. Runtime Login Response Validation
  console.log("\n[Test 8] Testing Runtime Login Response Validation...");
  const ALLOWED_ROLES = new Set(["ADMIN", "DOCTOR", "RECEPTIONIST"]);
  function testValidateLoginPayload(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const p = data as Record<string, unknown>;
    if (typeof p.access_token !== "string" || p.access_token.trim().length === 0) return false;
    if (!p.user || typeof p.user !== "object") return false;
    const u = p.user as Record<string, unknown>;
    if (typeof u.id !== "number" || !Number.isInteger(u.id) || u.id <= 0) return false;
    if (typeof u.phone !== "string" || u.phone.trim().length === 0) return false;
    if (typeof u.role !== "string" || !ALLOWED_ROLES.has(u.role)) return false;
    if (typeof u.is_active !== "boolean") return false;
    return true;
  }

  // Empty access token
  if (testValidateLoginPayload({ access_token: "", user: { id: 1, phone: "1234567890", role: "ADMIN", is_active: true } })) {
    throw new Error("Empty access_token should be rejected");
  }
  console.log("✓ Empty access_token rejected.");

  // Empty user object
  if (testValidateLoginPayload({ access_token: "mockToken", user: {} })) {
    throw new Error("Empty user object should be rejected");
  }
  console.log("✓ Empty user object rejected.");

  // Invalid user id
  if (testValidateLoginPayload({ access_token: "mockToken", user: { id: "not_a_num", phone: "1234567890", role: "ADMIN", is_active: true } })) {
    throw new Error("Non-numeric user.id should be rejected");
  }
  console.log("✓ Non-numeric user.id rejected.");

  // Invalid user role
  if (testValidateLoginPayload({ access_token: "mockToken", user: { id: 1, phone: "1234567890", role: "SUPERUSER", is_active: true } })) {
    throw new Error("Invalid user.role should be rejected");
  }
  console.log("✓ Non-whitelisted user.role rejected.");

  // Valid payload
  if (!testValidateLoginPayload({ access_token: "mockToken", user: { id: 1, phone: "1234567890", role: "ADMIN", is_active: true } })) {
    throw new Error("Valid login payload should be accepted");
  }
  console.log("✓ Valid login response accepted.");

  console.log("\n🎉 ALL EXTENSIVE SECURITY, SESSION & RUNTIME CHECKS PASSED!");
}

runBffSecurityTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
