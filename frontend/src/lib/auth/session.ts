import { cookies } from "next/headers";
import type { UserResponse, SessionUser } from "@/types/auth";

export const SESSION_COOKIE_NAME = "caredesk_token";
export const USER_COOKIE_NAME = "caredesk_user";

/**
 * Safety margin subtracted from the JWT's remaining lifetime (in seconds)
 * to prevent the session cookie from ever outliving the JWT due to request/response latency.
 */
const SAFETY_MARGIN_SECONDS = 5;

/**
 * Safely decodes the `exp` claim (expiration epoch timestamp in seconds) from a JWT.
 *
 * SECURITY NOTE:
 * Decoding `exp` here is exclusively used to synchronize cookie lifetime with the token's
 * issued lifetime. Cryptographic signature verification and authentication are strictly
 * enforced upstream by the FastAPI backend.
 */
function extractJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson);
    if (payload && typeof payload.exp === "number" && payload.exp > 0) {
      return payload.exp;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Stores the authentication JWT in a secure, HttpOnly cookie
 * and user metadata in a separate client-readable cookie.
 *
 * STRICT EXPIRATION ENFORCEMENT:
 * - Missing or invalid `exp` claim -> Rejects session creation.
 * - Expired JWT (`exp <= now`) -> Rejects session creation.
 * - Valid `exp` -> Sets cookie maxAge to (remainingSeconds - 5s safety margin).
 * - Never falls back to a static lifetime for invalid or expired tokens.
 *
 * NOTE: The client-readable `caredesk_user` cookie contains non-sensitive display
 * metadata strictly for client-side UI hydration (such as sidebar name and badge).
 * It is NEVER used for authorization or privilege decisions on the server or in BFF proxy.
 */
export async function setSession(token: string, user: UserResponse) {
  const jwtExp = extractJwtExp(token);

  // 1. Missing or invalid exp claim: reject session creation
  if (!jwtExp) {
    throw new Error("Cannot establish session: JWT is missing a valid expiration claim (exp)");
  }

  const currentSeconds = Math.floor(Date.now() / 1000);
  const secondsRemaining = jwtExp - currentSeconds;

  // 2. Expired JWT: reject session creation
  if (secondsRemaining <= 0) {
    throw new Error("Cannot establish session: JWT has already expired");
  }

  // 3. Subtract safety margin so the cookie never outlives the token
  const cookieMaxAge = secondsRemaining - SAFETY_MARGIN_SECONDS;
  if (cookieMaxAge <= 0) {
    throw new Error("Cannot establish session: JWT lifetime is insufficient for session creation");
  }

  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";

  // 1. Secure, HttpOnly JWT cookie (inaccessible to browser JavaScript)
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });

  // 2. Client-readable user display metadata for instantaneous UI hydration
  const sessionUser: SessionUser = {
    id: user.id,
    phone: user.phone,
    email: user.email,
    role: user.role,
    provider_id: user.provider_id,
  };

  cookieStore.set(USER_COOKIE_NAME, JSON.stringify(sessionUser), {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });
}

/**
 * Retrieves the raw JWT token from the HttpOnly session cookie (server-side only)
 */
export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Retrieves the session user profile from the cookie
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(USER_COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Destroys both session cookies on logout or session invalidation
 */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(USER_COOKIE_NAME);
}
