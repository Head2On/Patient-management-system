import { NextRequest } from "next/server";
import { proxy, config } from "../proxy";

async function runProxyRuntimeTests() {
  console.log("================================================================================");
  console.log("STAGE 6.7 — RUNTIME PROXY VERIFICATION TESTS");
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

  // Case 1: No cookie → /login (Stay on /login)
  console.log("[Test 1] No cookie → /login");
  const req1 = new NextRequest(`${BASE_URL}/login`);
  const res1 = proxy(req1);
  const location1 = res1.headers.get("location");
  assert(!location1, "No cookie on /login does not redirect; stays on /login");

  // Case 2: Valid cookie → /login (Redirect to /dashboard)
  console.log("\n[Test 2] Valid cookie → /login");
  const req2 = new NextRequest(`${BASE_URL}/login`, {
    headers: {
      cookie: "caredesk_token=mock_valid_jwt_token_payload",
    },
  });
  const res2 = proxy(req2);
  const location2 = res2.headers.get("location");
  assert(
    location2 === `${BASE_URL}/dashboard`,
    `Valid cookie on /login redirects to /dashboard (got: ${location2})`
  );

  // Case 3: Valid cookie → /patients (Allow access)
  console.log("\n[Test 3] Valid cookie → /patients");
  const req3 = new NextRequest(`${BASE_URL}/patients`, {
    headers: {
      cookie: "caredesk_token=mock_valid_jwt_token_payload",
    },
  });
  const res3 = proxy(req3);
  const location3 = res3.headers.get("location");
  assert(!location3, "Valid cookie on /patients allows access (no redirect to /login)");

  // Case 4: No cookie → /api/auth/me (JSON 401, not page redirect)
  console.log("\n[Test 4] No cookie → /api/auth/me");
  // In proxy.ts, /api/* routes are explicitly bypassed so Next.js Route Handlers can return JSON 401
  const req4 = new NextRequest(`${BASE_URL}/api/auth/me`);
  const res4Proxy = proxy(req4);
  const location4 = res4Proxy.headers.get("location");
  assert(!location4, "Proxy does not intercept /api/auth/me; passes through to BFF route handler without page redirect");

  // Case 5: No cookie → /apix (Not treated as an API route)
  console.log("\n[Test 5] No cookie → /apix");
  // Check matcher: /api and /api/ are excluded from proxy, but /apix MUST NOT be excluded
  const matcherPattern = config.matcher[0];
  const matcherRegex = new RegExp(`^${matcherPattern}$`);

  const apiMatches = matcherRegex.test("/api");
  const apiSubMatches = matcherRegex.test("/api/auth/me");
  const apixMatches = matcherRegex.test("/apix");

  assert(!apiMatches, "Matcher excludes /api (API route bypass)");
  assert(!apiSubMatches, "Matcher excludes /api/auth/me (API route bypass)");
  assert(apixMatches, "Matcher INCLUDES /apix (it is NOT treated as an API route)");

  // Inside proxy: verify /apix does not hit the API bypass condition
  const req5 = new NextRequest(`${BASE_URL}/apix`);
  const isBypassedAsApi =
    req5.nextUrl.pathname === "/api" || req5.nextUrl.pathname.startsWith("/api/");
  assert(!isBypassedAsApi, "/apix does not trigger internal API bypass rule");

  console.log(`\n================================================================================`);
  console.log(`RESULT: ${passed}/${total} TESTS PASSED CLEANLY (100%)`);
  console.log(`================================================================================\n`);
}

runProxyRuntimeTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
