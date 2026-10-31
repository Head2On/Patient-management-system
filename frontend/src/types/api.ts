/**
 * Shared API & Network Types
 * Aligned with FastAPI backend OpenAPI schema
 */

export interface FastApiValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export interface FastApiHttpValidationError {
  detail: FastApiValidationErrorItem[];
}

export interface FastApiDetailError {
  detail: string;
}

export type FastApiErrorResponse = FastApiHttpValidationError | FastApiDetailError;

export interface PagePaginationParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface SkipLimitPaginationParams {
  skip?: number;
  limit?: number;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  token?: string;
}
