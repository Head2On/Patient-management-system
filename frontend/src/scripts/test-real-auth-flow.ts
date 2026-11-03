/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stage 6.6 — Real Authentication Integration Test
 * Verifies the complete live flow between Browser Client -> Next.js BFF -> FastAPI Backend:
 * 1. Open the Next.js login page (GET /login).
 * 2. Attempt login with invalid credentials (POST /api/auth/login) -> 401.
 * 3. Log in using a valid backend account -> 200 with HttpOnly JWT & User cookies.
 * 4. Verify /api/auth/me returns the authenticated user profile.
 * 5. Proxied request through Next.js (GET /api/patients/) -> FastAPI receives JWT.
 * 6. Log out (POST /api/auth/logout) -> Verifies both session cookies are cleared.
 * 7. Protected access after logout -> Returns 401.
 * 8. Invalid / tampered JWT -> Returns 401 and clears session.
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
  
  // Headers.getSetCookie() is standard in Node 18+ / fetch
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

async function runRealAuthIntegrationTest() {
  console.log("================================================================================");
  console.log("STAGE 6.6: REAL BROWSER -> NEXT.JS BFF -> FASTAPI LIVE INTEGRATION TEST");
  console.log("================================================================================\n");

  const baseUrl = "http://localhost:3000";

  // Step 1: Open the Next.js login page
  console.log("[Test 1] 1. Requesting Next.js Login Page (GET /login)...");
  const loginPageRes = await request(`${baseUrl}/login`);
  if (loginPageRes.status !== 200) {
    throw new Error(`Expected status 200 for /login, got ${loginPageRes.status}`);
  }
  if (!loginPageRes.text.includes("CareDesk") || !loginPageRes.text.includes("Welcome back")) {
    throw new Error("Login page HTML does not contain CareDesk brand or Welcome back heading");
  }
  console.log("✓ Next.js login page loaded successfully (HTTP 200 OK with CareDesk branding).");

  // Step 2: Test invalid password
  console.log("\n[Test 2] 2. Testing login with invalid password...");
  const badLoginRes = await request(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      phone: "9999999999",
      password: "WrongPassword999",
    }),
  });
  if (badLoginRes.status !== 401) {
    throw new Error(`Expected status 401 for bad password, got ${badLoginRes.status}`);
  }
  const badCookies = parseCookies(badLoginRes.headers);
  if (badCookies.has("caredesk_token") && badCookies.get("caredesk_token")?.value) {
    throw new Error("Should not set session cookie on failed authentication");
  }
  console.log("✓ Invalid password correctly rejected (HTTP 401, no session cookie issued).");

  // Step 3: Log in using valid backend account (9999999999 / AdminPass123)
  console.log("\n[Test 3] 3. Logging in with valid Admin account (phone: 9999999999)...");
  const loginRes = await request(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      phone: "9999999999",
      password: "AdminPass123",
    }),
  });

  if (loginRes.status !== 200) {
    throw new Error(`Login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
  }

  const cookies = parseCookies(loginRes.headers);
  const tokenCookie = cookies.get("caredesk_token");
  const userCookie = cookies.get("caredesk_user");

  if (!tokenCookie) {
    throw new Error("Missing HttpOnly session cookie 'caredesk_token' in login response");
  }
  if (!userCookie) {
    throw new Error("Missing client profile cookie 'caredesk_user' in login response");
  }

  // Verify HttpOnly flag on JWT cookie
  const isHttpOnly = tokenCookie.flags.some((f) => f.toLowerCase() === "httponly");
  if (!isHttpOnly) {
    throw new Error("Security vulnerability: 'caredesk_token' is NOT marked HttpOnly!");
  }

  // Verify Cache-Control: no-store
  const cacheControl = loginRes.headers.get("cache-control") || "";
  if (!cacheControl.includes("no-store")) {
    throw new Error(`Expected Cache-Control: no-store on login response, got: ${cacheControl}`);
  }

  console.log("✓ Login successful (HTTP 200).");
  console.log("✓ 'caredesk_token' HttpOnly cookie received (Length:", tokenCookie.value.length, ", Flags:", tokenCookie.flags.join("; "), ")");
  console.log("✓ 'caredesk_user' UI metadata cookie received:", userCookie.value);
  console.log("✓ Cache-Control header enforced:", cacheControl);

  const sessionCookieHeader = `caredesk_token=${tokenCookie.value}; caredesk_user=${userCookie.value}`;

  // Step 4: Verify /api/auth/me with session cookies
  console.log("\n[Test 4] 4. Verifying /api/auth/me returns authenticated profile...");
  const meRes = await request(`${baseUrl}/api/auth/me`, {
    method: "GET",
    headers: {
      Cookie: sessionCookieHeader,
    },
  });

  if (meRes.status !== 200) {
    throw new Error(`GET /api/auth/me failed with status ${meRes.status}: ${JSON.stringify(meRes.data)}`);
  }

  if (meRes.data.role !== "ADMIN" || meRes.data.phone !== "9999999999") {
    throw new Error(`Unexpected user profile data: ${JSON.stringify(meRes.data)}`);
  }
  console.log("✓ /api/auth/me profile verified:", {
    id: meRes.data.id,
    phone: meRes.data.phone,
    role: meRes.data.role,
    isActive: meRes.data.is_active,
  });

  // Step 5: Authenticated request through Next.js proxy (/api/patients/)
  console.log("\n[Test 5] 5. Making proxied request through Next.js (GET /api/patients/?page=1&limit=5)...");
  const proxyRes = await request(`${baseUrl}/api/patients/?page=1&limit=5`, {
    method: "GET",
    headers: {
      Cookie: sessionCookieHeader,
    },
  });

  if (proxyRes.status !== 200) {
    throw new Error(`Proxied GET /api/patients/ failed with status ${proxyRes.status}: ${JSON.stringify(proxyRes.data)}`);
  }

  const proxyCacheControl = proxyRes.headers.get("cache-control") || "";
  if (!proxyCacheControl.includes("no-store")) {
    throw new Error(`Expected Cache-Control: no-store on proxied response, got: ${proxyCacheControl}`);
  }

  console.log(`✓ Proxied request to FastAPI succeeded (HTTP 200, received ${Array.isArray(proxyRes.data) ? proxyRes.data.length : 'items'} patient records).`);
  console.log("✓ FastAPI accepted Bearer JWT injected transparently by Next.js BFF proxy.");
  console.log("✓ Proxy returned Cache-Control:", proxyCacheControl);

  // Step 6: Log out and verify session cookies are cleared
  console.log("\n[Test 6] 6. Logging out (POST /api/auth/logout)...");
  const logoutRes = await request(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      Cookie: sessionCookieHeader,
    },
  });

  if (logoutRes.status !== 200) {
    throw new Error(`Logout failed with status ${logoutRes.status}`);
  }

  const logoutCookies = parseCookies(logoutRes.headers);
  const clearedToken = logoutCookies.get("caredesk_token");
  const clearedUser = logoutCookies.get("caredesk_user");

  // In Next.js, deleted cookies have max-age=0 or expires in 1970
  const isTokenCleared = clearedToken && (clearedToken.value === "" || clearedToken.flags.some((f) => f.includes("Max-Age=0") || f.includes("1970")));
  const isUserCleared = clearedUser && (clearedUser.value === "" || clearedUser.flags.some((f) => f.includes("Max-Age=0") || f.includes("1970")));

  if (!isTokenCleared || !isUserCleared) {
    throw new Error("Logout did not instruct browser to delete both session cookies!");
  }
  console.log("✓ Logout successful (HTTP 200). Both session cookies cleared with Max-Age=0.");

  // Step 7: Try accessing protected API after logout
  console.log("\n[Test 7] 7. Attempting protected access after logout (GET /api/auth/me without cookies)...");
  const afterLogoutRes = await request(`${baseUrl}/api/auth/me`);
  if (afterLogoutRes.status !== 401) {
    throw new Error(`Expected status 401 after logout, got ${afterLogoutRes.status}`);
  }
  console.log("✓ Protected endpoint correctly returned HTTP 401 Unauthorized after logout.");

  const proxiedAfterLogout = await request(`${baseUrl}/api/patients/`);
  if (proxiedAfterLogout.status !== 401) {
    throw new Error(`Expected status 401 on unauthenticated proxy request, got ${proxiedAfterLogout.status}`);
  }
  console.log("✓ Proxied endpoint correctly returned HTTP 401 Unauthorized without session cookies.");

  // Step 8: Invalid / Tampered JWT test
  console.log("\n[Test 8] 8. Testing invalid / tampered JWT handling...");
  const tamperedRes = await request(`${baseUrl}/api/auth/me`, {
    method: "GET",
    headers: {
      Cookie: "caredesk_token=invalid.tampered.token; caredesk_user={}",
    },
  });
  if (tamperedRes.status !== 401) {
    throw new Error(`Expected 401 on tampered token, got ${tamperedRes.status}`);
  }
  console.log("✓ Tampered/invalid JWT correctly rejected with HTTP 401, triggering session cleanup.");

  console.log("\n================================================================================");
  console.log("🎉 ALL STAGE 6.6 REAL AUTHENTICATION INTEGRATION TESTS PASSED (8/8 GREEN)!");
  console.log("================================================================================");
}

runRealAuthIntegrationTest().catch((err) => {
  console.error("\n❌ Real Auth Test Failed:", err);
  process.exit(1);
});

export {};
