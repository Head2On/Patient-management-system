import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { validateCsrfOrigin } from "@/lib/api/csrf";

export async function POST(request: NextRequest) {
  // Validate request origin against application origin to protect against CSRF
  if (!validateCsrfOrigin(request)) {
    return NextResponse.json(
      { detail: "Forbidden: Invalid or missing Origin header" },
      { status: 403 }
    );
  }

  await clearSession();
  return NextResponse.json({ message: "Logged out successfully" });
}
