import { NextRequest, NextResponse } from "next/server";
import { getSessionToken, clearSession } from "@/lib/auth/session";
import { validateCsrfOrigin } from "@/lib/api/csrf";

const BACKEND_URL = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000";
const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const method = request.method.toUpperCase();

  // 1. Explicit HTTP Method Allowlist
  if (!ALLOWED_METHODS.includes(method as (typeof ALLOWED_METHODS)[number])) {
    return NextResponse.json(
      { detail: `Method ${request.method} Not Allowed` },
      { status: 405 }
    );
  }

  // 2. Finding A: CSRF Origin validation for state-changing operations
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (!validateCsrfOrigin(request)) {
      return NextResponse.json(
        { detail: "Forbidden: Invalid or missing Origin header" },
        { status: 403 }
      );
    }
  }

  const pathSegments = params.path || [];

  // 3. Finding B: Hardened Path Construction & Traversal Prevention
  for (const segment of pathSegments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.toLowerCase().includes("%2e")
    ) {
      return NextResponse.json(
        { detail: "Bad Request: Invalid path segment" },
        { status: 400 }
      );
    }
  }

  // Encode individual path segments
  const encodedSegments = pathSegments.map((seg) => encodeURIComponent(seg));
  let subPath = encodedSegments.join("/");

  // Preserve trailing slash if present in client request or single collection root
  if (request.nextUrl.pathname.endsWith("/") || pathSegments.length === 1) {
    if (!subPath.endsWith("/")) {
      subPath += "/";
    }
  }

  // Construct target URL safely bound to upstream backend origin
  let targetUrl: URL;
  try {
    const backendBase = new URL(BACKEND_URL);
    const normalizedPath = `/api/v1/${subPath}`.replace(/\/+/g, "/");
    targetUrl = new URL(normalizedPath, backendBase);

    // Verify upstream origin cannot be hijacked and stays strictly under /api/v1/
    if (
      targetUrl.origin !== backendBase.origin ||
      !targetUrl.pathname.startsWith("/api/v1/")
    ) {
      return NextResponse.json(
        { detail: "Forbidden: Target path escapes allowed boundary" },
        { status: 403 }
      );
    }

    targetUrl.search = request.nextUrl.search;
  } catch {
    return NextResponse.json(
      { detail: "Bad Request: Failed to construct upstream URL" },
      { status: 400 }
    );
  }

  // 4. Request Headers & Token Injection
  const headers = new Headers();
  headers.set("Accept", "application/json");

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const token = await getSessionToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // 5. Finding C: Explicitly disable caching for backend requests
  const fetchOptions: RequestInit = {
    method,
    headers,
    cache: "no-store", // Prevents accidental caching of user-specific data
  };

  // Attach body for mutation requests
  if (["POST", "PUT", "PATCH"].includes(method)) {
    try {
      const bodyText = await request.text();
      if (bodyText) {
        fetchOptions.body = bodyText;
      }
    } catch {
      // Body is empty or unreadable
    }
  }

  try {
    const backendResponse = await fetch(targetUrl.toString(), fetchOptions);

    // If backend returns 401 Unauthorized, automatically invalidate session cookies
    if (backendResponse.status === 401) {
      await clearSession();
    }

    // Handle 204 No Content
    if (backendResponse.status === 204) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      });
    }

    const responseContentType = backendResponse.headers.get("content-type") || "";
    const responseHeaders = new Headers();
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
    responseHeaders.set("Pragma", "no-cache");

    if (responseContentType.includes("application/json")) {
      const data = await backendResponse.json();
      return NextResponse.json(data, {
        status: backendResponse.status,
        headers: responseHeaders,
      });
    }

    const textData = await backendResponse.text();
    responseHeaders.set("Content-Type", responseContentType);
    return new NextResponse(textData, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("BFF proxy error:", error);
    return NextResponse.json(
      { detail: "Failed to connect to backend service" },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams);
}
