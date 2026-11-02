import { NextResponse } from "next/server";
import { getSessionToken, clearSession } from "@/lib/auth/session";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    // If the token is missing/expired, clean up any remaining stale user cookies
    await clearSession();
    return NextResponse.json(
      { detail: "Not authenticated" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const backendUrl = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${backendUrl}/api/v1/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store", // Explicitly disable caching for authenticated profile fetch
    });

    if (response.status === 401) {
      await clearSession();
      return NextResponse.json(
        { detail: "Session expired" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return NextResponse.json(data, {
        status: response.status,
        headers: NO_STORE_HEADERS,
      });
    }

    return NextResponse.json(
      { detail: "Invalid response received from user service" },
      {
        status: response.status >= 400 ? response.status : 502,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    console.error("Auth me route error:", error);
    return NextResponse.json(
      { detail: "Failed to fetch user profile" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
