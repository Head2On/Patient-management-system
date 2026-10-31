import { NextRequest, NextResponse } from "next/server";
import { setSession } from "@/lib/auth/session";
import { validateCsrfOrigin } from "@/lib/api/csrf";
import type { UserLoginResponse, UserRole } from "@/types/auth";

const ALLOWED_USER_ROLES = new Set<UserRole>(["ADMIN", "DOCTOR", "RECEPTIONIST"]);

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

/**
 * Validates the runtime shape of the authentication success response from FastAPI.
 * Guarantees that empty tokens or empty/incomplete user objects cannot create a session.
 */
function isValidLoginResponse(data: unknown): data is UserLoginResponse {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as Record<string, unknown>;

  // 1. access_token must be a non-empty string
  if (
    typeof payload.access_token !== "string" ||
    payload.access_token.trim().length === 0
  ) {
    return false;
  }

  // 2. user must be a non-null object
  if (!payload.user || typeof payload.user !== "object") {
    return false;
  }

  const user = payload.user as Record<string, unknown>;

  // 3. user.id must be a valid positive integer
  if (typeof user.id !== "number" || !Number.isInteger(user.id) || user.id <= 0) {
    return false;
  }

  // 4. user.phone must be a non-empty string
  if (typeof user.phone !== "string" || user.phone.trim().length === 0) {
    return false;
  }

  // 5. user.role must be a valid UserRole (ADMIN, DOCTOR, or RECEPTIONIST)
  if (
    typeof user.role !== "string" ||
    !ALLOWED_USER_ROLES.has(user.role as UserRole)
  ) {
    return false;
  }

  // 6. user.is_active must be a boolean
  if (typeof user.is_active !== "boolean") {
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  // Validate request origin against application origin to protect against CSRF
  if (!validateCsrfOrigin(request)) {
    return NextResponse.json(
      { detail: "Forbidden: Invalid or missing Origin header" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { detail: "Invalid JSON request body" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const backendUrl = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000";

    const response = await fetch(`${backendUrl}/api/v1/users/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const responseContentType = response.headers.get("content-type") || "";

    // Reject non-JSON responses with a sanitized error message (prevent upstream HTML/trace leaks)
    if (!responseContentType.includes("application/json")) {
      return NextResponse.json(
        { detail: "Invalid response received from authentication server" },
        {
          status: response.status >= 400 ? response.status : 502,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return NextResponse.json(
        { detail: "Failed to parse authentication response" },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    if (!response.ok) {
      return NextResponse.json(data, {
        status: response.status,
        headers: NO_STORE_HEADERS,
      });
    }

    // Strict runtime data validation: reject empty tokens or malformed/incomplete user payloads
    if (!isValidLoginResponse(data)) {
      console.error("Malformed authentication payload received from backend:", data);
      return NextResponse.json(
        { detail: "Malformed authentication response from server" },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    // Persist JWT into secure HttpOnly cookie and user profile in client cookie
    try {
      await setSession(data.access_token, data.user);
    } catch (sessionError) {
      console.error("Session establishment failed:", sessionError);
      return NextResponse.json(
        { detail: "Failed to establish secure session" },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        user: data.user,
        message: "Authentication successful",
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    // Log internal error for server observability without leaking raw details to client
    console.error("Login route handler error:", error);
    return NextResponse.json(
      { detail: "An unexpected error occurred during authentication" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
