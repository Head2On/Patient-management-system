import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "caredesk_token";

// Routes that require authentication
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/patients",
  "/appointments",
  "/providers",
  "/users",
  "/profile",
];

// Routes reserved for unauthenticated users
const AUTH_ROUTES = ["/login"];

/**
 * Next.js 16 Proxy Convention (replaces middleware.ts)
 *
 * Responsibilities:
 * 1. Optimistic navigation guard: Redirect unauthenticated requests to /login.
 * 2. Redirect authenticated users away from /login to /dashboard.
 * 3. Exclude /api/* so BFF Route Handlers preserve direct JSON 401 responses.
 *
 * Security Note:
 * Cookie presence is purely an optimistic UX navigation check.
 * Authoritative authentication and RBAC are enforced by FastAPI via the Next.js BFF proxy.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Bypass API routes and Next.js internals
  if (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  // 2. Optimistic session check (protects against empty/cleared cookie values)
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = Boolean(token && token.trim().length > 0);

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);
  const isProtectedRoute =
    pathname === "/" ||
    PROTECTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

  // 3. Unauthenticated user trying to access protected routes
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    // Preserve requested destination for post-login redirection (skip root '/')
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. Authenticated user visiting /login or root /
  if (isAuthenticated && (isAuthRoute || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (/api and /api/*)
     * - Next.js internal static assets (_next/static, _next/image)
     * - favicon and common static file extensions (.ico, .png, .jpg, .svg, etc.)
     */
    "/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
