import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUsers,
  getUser,
  getUserByPhone,
  createUser,
  updateUser,
  adminUpdateUser,
  deactivateUser,
  reactivateUser,
  type GetUsersParams,
} from "@/features/users/api/users-api";
import type {
  UserResponse,
  UserCreateRequest,
  UserUpdateRequest,
  UserAdminUpdateRequest,
} from "@/types/auth";
import type { ApiClientError } from "@/lib/api/errors";

/**
 * Centralized Staff User Query Key Factory
 *
 * Establishes consistent, structured cache keys for queries and invalidations:
 * - userKeys.all: Root key for all user-related queries
 * - userKeys.lists(): Base key for all user listing queries
 * - userKeys.list(params): Specific cache key for a parameter combination
 * - userKeys.details(): Base key for user detail queries
 * - userKeys.detail(id): Specific cache key for a single user by database ID
 * - userKeys.byPhones(): Base key for user queries by phone number
 * - userKeys.byPhone(phone): Specific cache key for a user by phone number
 */
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params?: GetUsersParams) =>
    [...userKeys.lists(), params ?? {}] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (userId: number) => [...userKeys.details(), userId] as const,
  byPhones: () => [...userKeys.all, "by-phone"] as const,
  byPhone: (phone: string) => [...userKeys.byPhones(), phone] as const,
};

/**
 * React Query hook to fetch a list of staff user accounts with optional skip/limit pagination.
 * Restricted to Administrator role.
 *
 * @param params - Optional skip and limit pagination parameters.
 * @param options - Optional configuration such as enabling/disabling the query.
 * @returns TanStack Query result containing UserResponse[] array and request states.
 */
export function useUsers(
  params?: GetUsersParams,
  options?: { enabled?: boolean }
) {
  return useQuery<UserResponse[], ApiClientError>({
    queryKey: userKeys.list(params),
    queryFn: () => getUsers(params),
    enabled: options?.enabled ?? true,
  });
}

/**
 * React Query hook to fetch a single staff user by their database integer ID.
 * Allowed for the user themselves or an Administrator.
 *
 * Guarded against invalid IDs (must be a positive safe integer).
 *
 * @param userId - The internal database integer ID of the user.
 * @param options - Optional configuration such as enabling/disabling the query.
 * @returns TanStack Query result containing the UserResponse record.
 */
export function useUser(
  userId: number,
  options?: { enabled?: boolean }
) {
  return useQuery<UserResponse, ApiClientError>({
    queryKey: userKeys.detail(userId),
    queryFn: () => getUser(userId),
    enabled:
      (options?.enabled ?? true) &&
      Number.isSafeInteger(userId) &&
      userId > 0,
  });
}

/**
 * React Query hook to fetch a staff user by their unique primary phone number.
 * Restricted to Administrator role.
 *
 * Guarded against empty or whitespace-only phone strings.
 *
 * @param phone - Unique phone number of the user.
 * @param options - Optional configuration such as enabling/disabling the query.
 * @returns TanStack Query result containing the UserResponse record.
 */
export function useUserByPhone(
  phone: string,
  options?: { enabled?: boolean }
) {
  const trimmedPhone = phone?.trim() ?? "";

  return useQuery<UserResponse, ApiClientError>({
    queryKey: userKeys.byPhone(trimmedPhone),
    queryFn: () => getUserByPhone(trimmedPhone),
    enabled:
      (options?.enabled ?? true) &&
      trimmedPhone.length > 0,
  });
}

/**
 * React Query mutation hook to create a new staff account (Admin, Doctor, or Receptionist).
 * Restricted to Administrator role.
 *
 * Automatically invalidates user list queries on success.
 *
 * @returns TanStack Mutation result for user creation.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserResponse, ApiClientError, UserCreateRequest>({
    mutationFn: (data: UserCreateRequest) => createUser(data),
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: userKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.byPhones(),
        }),
      ]);
    },
  });
}

export interface UpdateUserVariables {
  userId: number;
  data: UserUpdateRequest;
}

/**
 * React Query mutation hook to update an ordinary user profile (phone, email, password).
 * Allowed for self or an Administrator.
 *
 * Invalidates both the specific user detail query, directory lists, and phone lookups on success.
 *
 * @returns TanStack Mutation result for user profile update.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserResponse, ApiClientError, UpdateUserVariables>({
    mutationFn: ({ userId, data }: UpdateUserVariables) =>
      updateUser(userId, data),
    onSuccess: (_updatedUser, { userId }) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: userKeys.detail(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.byPhones(),
        }),
      ]);
    },
  });
}

export interface AdminUpdateUserVariables {
  userId: number;
  data: UserAdminUpdateRequest;
}

/**
 * React Query mutation hook to update privileged user attributes (role and/or linked provider).
 * Restricted to Administrator role.
 *
 * Keeps administrative changes strictly separated from ordinary profile updates.
 * Invalidates both the specific user detail query, directory lists, and phone lookups on success.
 *
 * @returns TanStack Mutation result for administrative user update.
 */
export function useAdminUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserResponse, ApiClientError, AdminUpdateUserVariables>({
    mutationFn: ({ userId, data }: AdminUpdateUserVariables) =>
      adminUpdateUser(userId, data),
    onSuccess: (_updatedUser, { userId }) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: userKeys.detail(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.byPhones(),
        }),
      ]);
    },
  });
}

/**
 * React Query mutation hook to deactivate a staff user account (soft-delete / lock access).
 * Restricted to Administrator and Receptionist roles.
 *
 * Invalidates both the specific user detail query, directory lists, and phone lookups on success.
 *
 * @returns TanStack Mutation result for user deactivation.
 */
export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserResponse, ApiClientError, number>({
    mutationFn: (userId: number) => deactivateUser(userId),
    onSuccess: (_deactivatedUser, userId) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: userKeys.detail(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.byPhones(),
        }),
      ]);
    },
  });
}

/**
 * React Query mutation hook to reactivate a deactivated staff user account.
 * Restricted to Administrator and Receptionist roles.
 *
 * Invalidates both the specific user detail query, directory lists, and phone lookups on success.
 *
 * @returns TanStack Mutation result for user reactivation.
 */
export function useReactivateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserResponse, ApiClientError, number>({
    mutationFn: (userId: number) => reactivateUser(userId),
    onSuccess: (_reactivatedUser, userId) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: userKeys.detail(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: userKeys.byPhones(),
        }),
      ]);
    },
  });
}
