import type { RequestOptions } from "@/types/api";
import { ApiClientError, parseValidationErrors } from "./errors";

export interface ApiClientConfig {
  baseUrl?: string;
  defaultHeaders?: HeadersInit;
}

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;

  constructor(config: ApiClientConfig = {}) {
    // Default to /api for client-side calling Next.js BFF route handlers
    this.baseUrl = config.baseUrl ?? "";
    this.defaultHeaders = config.defaultHeaders ?? {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Builds the query string from an object, omitting null and undefined values
   */
  private buildQueryString(params?: Record<string, string | number | boolean | undefined | null>): string {
    if (!params) return "";
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    }

    const query = searchParams.toString();
    return query ? `?${query}` : "";
  }

  /**
   * Core request method
   */
  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, body, headers, token, ...customConfig } = options;

    const queryString = this.buildQueryString(params);
    const url = `${this.baseUrl}${endpoint}${queryString}`;

    const requestHeaders = new Headers(this.defaultHeaders);

    if (headers) {
      new Headers(headers).forEach((value, key) => {
        requestHeaders.set(key, value);
      });
    }

    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    const config: RequestInit = {
      ...customConfig,
      headers: requestHeaders,
    };

    if (body !== undefined) {
      config.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (networkError) {
      throw new ApiClientError(
        0,
        "Network Error",
        networkError instanceof Error ? networkError.message : "Failed to connect to server"
      );
    }

    // Handle No Content / Empty responses
    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get("content-type");
    let responseData: unknown = null;

    if (contentType && contentType.includes("application/json")) {
      try {
        responseData = await response.json();
      } catch {
        responseData = null;
      }
    } else {
      try {
        responseData = await response.text();
      } catch {
        responseData = null;
      }
    }

    if (!response.ok) {
      let detail: unknown = responseData;
      let validationErrors: Record<string, string> | undefined;

      if (responseData && typeof responseData === "object" && "detail" in responseData) {
        detail = (responseData as { detail: unknown }).detail;
        if (response.status === 422) {
          validationErrors = parseValidationErrors(detail);
        }
      }

      throw new ApiClientError(
        response.status,
        response.statusText,
        detail,
        validationErrors
      );
    }

    return responseData as T;
  }

  public get<T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  public post<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "POST", body });
  }

  public put<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PUT", body });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PATCH", body });
  }

  public delete<T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

// Client-side singleton targeting Next.js BFF routes (/api/*).
// In browser components, auth credentials are never handled manually; they are managed
// transparently via HttpOnly session cookies forwarded to the BFF proxy.
export const apiClient = new ApiClient({
  baseUrl: "/api",
});

/**
 * Factory for direct backend communication (server-side only).
 * Intended exclusively for Route Handlers, Server Components, and CLI scripts
 * connecting directly to FastAPI. Tokens passed here must remain strictly on the server.
 */
export function createBackendClient(token?: string) {
  const backendUrl = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000";
  return new ApiClient({
    baseUrl: backendUrl,
    defaultHeaders: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export { ApiClient };
