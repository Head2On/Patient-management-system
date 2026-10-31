import { NextRequest } from "next/server";

/**
 * Strictly parses and validates an origin string against security constraints:
 * - Must be a valid HTTP or HTTPS URL.
 * - Must NOT contain embedded credentials (user/password).
 * - Must NOT contain sub-paths, query parameters, or hash fragments.
 * - Must have a valid hostname.
 *
 * Returns the normalized origin (e.g. "https://clinic.example.com") or null if invalid.
 */
function parseStrictOrigin(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    // Accept only http: and https: protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    // Reject origins containing embedded credentials
    if (parsed.username || parsed.password) {
      return null;
    }

    // Must be strictly an origin: no sub-paths, queries, or fragments
    if (
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    // Must have a non-empty hostname
    if (!parsed.hostname) {
      return null;
    }

    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Builds the set of trusted application origins strictly from fixed configuration.
 *
 * SECURITY GUARANTEES:
 * 1. No dynamic trust of client headers (`Host`, `X-Forwarded-Host`, `request.nextUrl.origin`).
 * 2. Fail closed in production: A valid canonical origin (`NEXT_PUBLIC_APP_URL`) is MANDATORY
 *    in production. If it is missing or invalid, NO origins are trusted (not even ALLOWED_ORIGINS),
 *    causing all state-changing mutations to fail closed.
 * 3. Additional origins (`ALLOWED_ORIGINS`) can only expand an already valid canonical production
 *    configuration, never replace or bypass a missing canonical origin.
 * 4. Strict origin parsing: Rejects malformed values, embedded credentials, sub-paths, or non-HTTP(S) schemes.
 */
function getTrustedOrigins(): Set<string> {
  const trusted = new Set<string>();
  const isProduction = process.env.NODE_ENV === "production";

  // 1. Mandatory canonical application origin
  const canonicalOrigin = parseStrictOrigin(process.env.NEXT_PUBLIC_APP_URL);

  if (isProduction) {
    if (!canonicalOrigin) {
      // In production, fail closed immediately: do NOT process ALLOWED_ORIGINS or fall back
      console.error(
        "CRITICAL SECURITY ALERT: NEXT_PUBLIC_APP_URL is not set or invalid in production. CSRF validation fails closed; all mutations will be rejected."
      );
      return trusted; // Empty set -> All mutations rejected
    }
    trusted.add(canonicalOrigin);
  } else {
    // Non-production (development / test) environments
    if (canonicalOrigin) {
      trusted.add(canonicalOrigin);
    } else {
      trusted.add("http://localhost:3000");
    }
    // Permitted local loopback addresses for local testing
    trusted.add("http://localhost:3000");
    trusted.add("http://127.0.0.1:3000");
  }

  // 2. Explicitly configured additional trusted origins (expands the valid configuration)
  const additionalOrigins = process.env.ALLOWED_ORIGINS;
  if (additionalOrigins) {
    const entries = additionalOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const validOrigin = parseStrictOrigin(entry);
      if (validOrigin) {
        trusted.add(validOrigin);
      } else {
        console.warn(
          `SECURITY WARNING: Ignored invalid origin in ALLOWED_ORIGINS: "${entry}"`
        );
      }
    }
  }

  return trusted;
}

/**
 * Validates that incoming state-changing requests (POST, PUT, PATCH, DELETE)
 * originate from an explicitly trusted application origin.
 */
export function validateCsrfOrigin(request: NextRequest): boolean {
  const method = request.method.toUpperCase();

  // Safe read-only HTTP methods do not mutate state
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const trustedOrigins = getTrustedOrigins();

  // If no trusted origins are established (e.g. production misconfiguration), fail closed
  if (trustedOrigins.size === 0) {
    return false;
  }

  // 1. Primary check: Origin header (sent by modern browsers on state mutations)
  if (originHeader) {
    const origin = parseStrictOrigin(originHeader);
    return origin !== null && trustedOrigins.has(origin);
  }

  // 2. Secondary fallback: Referer header (when Origin is omitted in certain same-origin scenarios)
  if (refererHeader) {
    try {
      const parsedReferer = new URL(refererHeader);

      // Strictly reject Referer headers containing embedded credentials
      if (parsedReferer.username || parsedReferer.password) {
        return false;
      }

      // Strictly validate the Referer's origin
      const refererOrigin = parseStrictOrigin(parsedReferer.origin);
      return refererOrigin !== null && trustedOrigins.has(refererOrigin);
    } catch {
      return false;
    }
  }

  // Reject state-changing mutations when neither provides a valid trusted origin
  return false;
}
