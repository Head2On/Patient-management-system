import type { FastApiValidationErrorItem } from "@/types/api";

/**
 * Custom error class for handling FastAPI HTTP & network errors
 */
export class ApiClientError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly detail: unknown;
  public readonly validationErrors?: Record<string, string>;

  constructor(
    status: number,
    statusText: string,
    detail: unknown,
    validationErrors?: Record<string, string>
  ) {
    const message = ApiClientError.formatErrorMessage(status, statusText, detail);
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
    this.validationErrors = validationErrors;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isValidationError(): boolean {
    return this.status === 422;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  private static formatErrorMessage(
    status: number,
    statusText: string,
    detail: unknown
  ): string {
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      // 422 Unprocessable Entity
      const first = detail[0] as FastApiValidationErrorItem;
      if (first && first.msg) {
        const field = first.loc ? first.loc.filter((part) => part !== "body").join(".") : "";
        return field ? `${field}: ${first.msg}` : first.msg;
      }
    }
    if (detail && typeof detail === "object" && "detail" in detail) {
      const nested = (detail as { detail: unknown }).detail;
      if (typeof nested === "string") return nested;
    }
    return statusText || `Request failed with status ${status}`;
  }
}

/**
 * Type guard for ApiClientError
 */
export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/**
 * Extracts a user-friendly error message from any caught error
 */
export function getErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred. Please try again."
): string {
  if (isApiClientError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}

/**
 * Extracts key-value field validation errors from FastAPI 422 detail array
 */
export function parseValidationErrors(
  detail: unknown
): Record<string, string> | undefined {
  if (!Array.isArray(detail)) return undefined;

  const errors: Record<string, string> = {};
  for (const item of detail) {
    if (item && typeof item === "object" && "loc" in item && "msg" in item) {
      const loc = (item as FastApiValidationErrorItem).loc;
      // loc is usually ['body', 'field_name'] or ['query', 'field_name']
      const fieldName = loc
        .filter((part) => part !== "body" && part !== "query")
        .join(".");
      if (fieldName) {
        errors[fieldName] = (item as FastApiValidationErrorItem).msg;
      }
    }
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}
