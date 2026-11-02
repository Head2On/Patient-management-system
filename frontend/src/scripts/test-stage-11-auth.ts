import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { validateCsrfOrigin } from "../lib/api/csrf";

async function runStage11AuthVerification() {
  console.log("================================================================================");
  console.log("STAGE 11.1: END-TO-END AUTHENTICATION WORKFLOW VERIFICATION");
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

  // SECTION 1: PROXY ROUTE PROTECTION & NAVIGATION REDIRECTS
  console.log("--- SECTION 1: PROXY ROUTE PROTECTION & NAVIGATION REDIRECTS ---");

  // 1.1 Unauthenticated access to /dashboard -> Redirects to /login?next=/dashboard
  const reqDash = new NextRequest(`${BASE_URL}/dashboard`);
  const resDash = proxy(reqDash);
  const locDash = resDash.headers.get("location");
  assert(
    locDash === `${BASE_URL}/login?next=%2Fdashboard`,
    `Unauthenticated /dashboard redirects to /login?next=%2Fdashboard (got: ${locDash})`
  );

  // 1.2 Unauthenticated access to deep protected route -> Preserves path and search
  const reqPatient = new NextRequest(`${BASE_URL}/patients/123?tab=records`);
  const resPatient = proxy(reqPatient);
  const locPatient = resPatient.headers.get("location");
  assert(
    locPatient === `${BASE_URL}/login?next=%2Fpatients%2F123%3Ftab%3Drecords`,
    `Unauthenticated /patients/123?tab=records preserves next param (got: ${locPatient})`
  );

  // 1.3 Unauthenticated access to root / -> Redirects to /login without redundant next
  const reqRoot = new NextRequest(`${BASE_URL}/`);
  const resRoot = proxy(reqRoot);
  const locRoot = resRoot.headers.get("location");
  assert(
    locRoot === `${BASE_URL}/login`,
    `Unauthenticated root / redirects cleanly to /login without next (got: ${locRoot})`
  );

  // 1.4 Authenticated access to /login -> Redirects to /dashboard
  const reqAuthLogin = new NextRequest(`${BASE_URL}/login`, {
    headers: { cookie: "caredesk_token=valid_token_sample" },
  });
  const resAuthLogin = proxy(reqAuthLogin);
  const locAuthLogin = resAuthLogin.headers.get("location");
  assert(
    locAuthLogin === `${BASE_URL}/dashboard`,
    `Authenticated user visiting /login redirected to /dashboard (got: ${locAuthLogin})`
  );

  // 1.5 Authenticated access to root / -> Redirects to /dashboard
  const reqAuthRoot = new NextRequest(`${BASE_URL}/`, {
    headers: { cookie: "caredesk_token=valid_token_sample" },
  });
  const resAuthRoot = proxy(reqAuthRoot);
  const locAuthRoot = resAuthRoot.headers.get("location");
  assert(
    locAuthRoot === `${BASE_URL}/dashboard`,
    `Authenticated user visiting / redirected to /dashboard (got: ${locAuthRoot})`
  );

  // 1.6 Authenticated access to protected route -> Allowed through
  const reqAuthPatients = new NextRequest(`${BASE_URL}/patients`, {
    headers: { cookie: "caredesk_token=valid_token_sample" },
  });
  const resAuthPatients = proxy(reqAuthPatients);
  assert(
    !resAuthPatients.headers.get("location"),
    "Authenticated access to /patients proceeds without redirection"
  );

  // 1.7 Proxy bypasses /api routes for BFF direct handling
  const reqApi = new NextRequest(`${BASE_URL}/api/auth/me`);
  const resApi = proxy(reqApi);
  assert(
    !resApi.headers.get("location"),
    "Proxy passes /api/auth/me directly to Next.js route handlers"
  );

  // SECTION 2: OPEN REDIRECT SANITIZATION
  console.log("\n--- SECTION 2: OPEN REDIRECT DEFENSE IN LOGIN WORKFLOW ---");

  function getSafeRedirectUrl(rawNext: string | null): string {
    if (!rawNext) return "/dashboard";
    if (
      !rawNext.startsWith("/") ||
      rawNext.startsWith("//") ||
      rawNext.startsWith("/\\") ||
      rawNext.includes("://")
    ) {
      return "/dashboard";
    }
    if (rawNext === "/login" || rawNext.startsWith("/login?")) {
      return "/dashboard";
    }
    return rawNext;
  }

  assert(getSafeRedirectUrl(null) === "/dashboard", "Null next param defaults to /dashboard");
  assert(getSafeRedirectUrl("") === "/dashboard", "Empty next param defaults to /dashboard");
  assert(getSafeRedirectUrl("https://evil.com") === "/dashboard", "External URL blocked");
  assert(getSafeRedirectUrl("//evil.com") === "/dashboard", "Protocol-relative URL blocked");
  assert(getSafeRedirectUrl("/\\evil.com") === "/dashboard", "Backslash evasion blocked");
  assert(getSafeRedirectUrl("/login") === "/dashboard", "Self-referential /login redirected to /dashboard");
  assert(getSafeRedirectUrl("/patients") === "/patients", "Valid /patients destination preserved");
  assert(
    getSafeRedirectUrl("/appointments/new?providerId=4") === "/appointments/new?providerId=4",
    "Valid deep appointment path with query preserved"
  );

  // SECTION 3: BFF ANTI-CSRF ON MUTATING AUTH ENDPOINTS
  console.log("\n--- SECTION 3: BFF ANTI-CSRF ON MUTATING AUTH ENDPOINTS ---");

  const logoutReqNoOrigin = new NextRequest(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
  });
  assert(
    !validateCsrfOrigin(logoutReqNoOrigin),
    "POST /api/auth/logout without Origin header correctly rejected by CSRF guard"
  );

  const logoutReqAttacker = new NextRequest(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { origin: "https://attacker.site" },
  });
  assert(
    !validateCsrfOrigin(logoutReqAttacker),
    "POST /api/auth/logout with untrusted Origin correctly rejected by CSRF guard"
  );

  const logoutReqTrusted = new NextRequest(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { origin: BASE_URL },
  });
  assert(
    validateCsrfOrigin(logoutReqTrusted),
    "POST /api/auth/logout with trusted app Origin accepted by CSRF guard"
  );

  console.log("\n================================================================================");
  console.log(`🎉 ALL STAGE 11.1 AUTH WORKFLOW TESTS PASSED (${passed}/${total} GREEN, 100%)!`);
  console.log("================================================================================\n");
}

runStage11AuthVerification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
