import { QueryClient } from "@tanstack/react-query";
import { isApiClientError } from "./api/errors";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Clinical workspace data defaults
        staleTime: 60 * 1000, // 1 minute fresh window
        gcTime: 5 * 60 * 1000, // 5 minutes garbage collection time
        refetchOnWindowFocus: false, // Prevent unexpected refetches during active form entry
        retry: (failureCount, error) => {
          // Never retry authorization, validation, or not found errors
          if (isApiClientError(error)) {
            if (
              error.isUnauthorized ||
              error.isForbidden ||
              error.isNotFound ||
              error.isValidationError ||
              error.isConflict
            ) {
              return false;
            }
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false, // Do not auto-retry mutations to prevent accidental duplicates
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: always make a new query client for each request
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
  }
}
