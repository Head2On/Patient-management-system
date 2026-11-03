"use client";

import * as React from "react";
import type { SessionUser, UserRole } from "@/types/auth";

const emptySubscribe = () => () => {};

/**
 * Hook to safely read user session metadata from the client-side caredesk_user cookie.
 * React 19 / Turbopack compliant: returns a primitive string snapshot from useSyncExternalStore
 * to maintain snapshot reference stability, then parses and memoizes the SessionUser.
 */
export function useCurrentSessionUser(): SessionUser | null | undefined {
  const rawCookie = React.useSyncExternalStore(
    emptySubscribe,
    () => {
      if (typeof document === "undefined") return undefined;
      const match = document.cookie.match(/(?:^|;\s*)caredesk_user=([^;]+)/);
      return match && match[1] ? match[1] : null;
    },
    () => undefined
  );

  return React.useMemo(() => {
    if (rawCookie === undefined) return undefined;
    if (rawCookie === null) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(rawCookie));
      if (
        parsed &&
        typeof parsed.id === "number" &&
        typeof parsed.role === "string"
      ) {
        return parsed as SessionUser;
      }
      return null;
    } catch {
      return null;
    }
  }, [rawCookie]);
}

/**
 * Hook to safely read current user role string.
 */
export function useCurrentUserRole(): UserRole | null {
  const user = useCurrentSessionUser();
  return user?.role ?? null;
}
