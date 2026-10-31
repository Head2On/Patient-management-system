/**
 * Authentication & User domain types
 * Derived from FastAPI OpenAPI schema
 */

export type UserRole = "ADMIN" | "DOCTOR" | "RECEPTIONIST";

export interface UserResponse {
  id: number;
  phone: string;
  email: string | null;
  role: UserRole;
  provider_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface UserLoginRequest {
  phone: string;
  password: string;
}

export interface UserLoginResponse {
  access_token: string;
  token_type?: string;
  user: UserResponse;
}

export interface UserCreateRequest {
  phone: string;
  email?: string | null;
  password: string;
  role: UserRole;
  provider_id?: number | null;
}

export interface UserUpdateRequest {
  phone?: string | null;
  email?: string | null;
  password?: string | null;
}

export interface UserAdminUpdateRequest {
  role?: UserRole | null;
  provider_id?: number | null;
}

export interface UserRoleUpdateRequest {
  role: UserRole;
}

export interface UserProviderLinkUpdateRequest {
  provider_id?: number | null;
}

export interface SessionUser {
  id: number;
  phone: string;
  email: string | null;
  role: UserRole;
  provider_id: number | null;
}
