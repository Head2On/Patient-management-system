import { apiClient } from "@/lib/api/client";
import type {
  UserResponse,
  UserCreateRequest,
  UserUpdateRequest,
  UserAdminUpdateRequest,
} from "@/types/auth";
import type { SkipLimitPaginationParams } from "@/types/api";

export type GetUsersParams = SkipLimitPaginationParams;

/**
 * User & Staff Management API Service
 * Encapsulates user/staff HTTP endpoints via the Next.js BFF apiClient.
 */

/**
 * Fetch a list of staff user accounts with optional skip/limit pagination.
 * Restricted to Administrator role.
 *
 * @param params - Optional skip and limit pagination parameters.
 * @returns Array of UserResponse records.
 */
export async function getUsers(
  params?: GetUsersParams
): Promise<UserResponse[]> {
  return apiClient.get<UserResponse[]>("/users/", {
    params: {
      skip: params?.skip,
      limit: params?.limit,
    },
  });
}

/**
 * Fetch a single staff user by their database integer ID.
 * Allowed for the user themselves or an Administrator.
 *
 * @param userId - The internal database ID of the user.
 * @returns The UserResponse record.
 */
export async function getUser(userId: number): Promise<UserResponse> {
  return apiClient.get<UserResponse>(
    `/users/${encodeURIComponent(userId)}`
  );
}

/**
 * Fetch a staff user by their unique primary phone number.
 * Restricted to Administrator role.
 *
 * @param phone - Unique phone number of the user.
 * @returns The UserResponse record.
 */
export async function getUserByPhone(phone: string): Promise<UserResponse> {
  return apiClient.get<UserResponse>(
    `/users/phone/${encodeURIComponent(phone)}`
  );
}

/**
 * Create a new staff account (Admin, Doctor, or Receptionist).
 * Restricted to Administrator role.
 *
 * @param data - User creation payload (phone, password, role, optional email, optional provider_id).
 * @returns The created UserResponse record.
 */
export async function createUser(
  data: UserCreateRequest
): Promise<UserResponse> {
  return apiClient.post<UserResponse>("/users/", data);
}

/**
 * Update an ordinary user profile (phone, email, password).
 * Allowed for self or an Administrator. Does not allow role or provider alterations.
 *
 * @param userId - The internal database ID of the user.
 * @param data - Profile fields to update.
 * @returns The updated UserResponse record.
 */
export async function updateUser(
  userId: number,
  data: UserUpdateRequest
): Promise<UserResponse> {
  return apiClient.patch<UserResponse>(
    `/users/${encodeURIComponent(userId)}`,
    data
  );
}

/**
 * Update privileged user attributes (role and/or linked provider).
 * Restricted to Administrator role.
 *
 * @param userId - The internal database ID of the user.
 * @param data - Administrative fields to update (role, provider_id).
 * @returns The updated UserResponse record.
 */
export async function adminUpdateUser(
  userId: number,
  data: UserAdminUpdateRequest
): Promise<UserResponse> {
  return apiClient.patch<UserResponse>(
    `/users/${encodeURIComponent(userId)}/admin`,
    data
  );
}

/**
 * Deactivate a staff user account (soft-delete / lock access).
 * Restricted to Administrator and Receptionist roles (cannot deactivate Admins unless Admin).
 *
 * @param userId - The internal database ID of the user.
 * @returns The deactivated UserResponse record.
 */
export async function deactivateUser(userId: number): Promise<UserResponse> {
  return apiClient.delete<UserResponse>(
    `/users/${encodeURIComponent(userId)}/deactivate`
  );
}

/**
 * Reactivate a deactivated staff user account.
 * Restricted to Administrator and Receptionist roles.
 *
 * @param userId - The internal database ID of the user.
 * @returns The reactivated UserResponse record.
 */
export async function reactivateUser(userId: number): Promise<UserResponse> {
  return apiClient.post<UserResponse>(
    `/users/${encodeURIComponent(userId)}/reactivate`
  );
}

export const usersApi = {
  getUsers,
  getUser,
  getUserByPhone,
  createUser,
  updateUser,
  adminUpdateUser,
  deactivateUser,
  reactivateUser,
};
