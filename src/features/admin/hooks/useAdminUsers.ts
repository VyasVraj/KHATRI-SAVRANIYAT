/**
 * useAdminUsers — TanStack Query hooks for platform user administration
 *
 * Phase 13 — Subtask 3: User Administration & Audit Viewer
 *
 * Invariants:
 * - Reads from public.profiles (via listAdminUsers).
 * - Mutations route through server-authoritative RPCs (admin_update_user_role, admin_set_user_status).
 * - Automatic query cache invalidation on successful mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { UserRole } from '@/types'
import type { AdminUserFilterParams, AdminUserListResponse } from '../types'
import {
  listAdminUsers,
  updateUserRole,
  setUserStatus,
} from '../services/admin.service'

/**
 * Hook to fetch paginated platform users with administrative filters.
 */
export function useAdminUsers(params: AdminUserFilterParams = {}) {
  return useQuery<AdminUserListResponse, Error>({
    queryKey: ['admin', 'users', params],
    queryFn: () => listAdminUsers(params),
    staleTime: 30_000,
  })
}

/**
 * Hook providing mutations for updating user roles and active status.
 */
export function useAdminUserMutations() {
  const queryClient = useQueryClient()

  const updateRoleMutation = useMutation<
    boolean,
    Error,
    { userId: string; newRole: UserRole }
  >({
    mutationFn: ({ userId, newRole }) => updateUserRole(userId, newRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const setStatusMutation = useMutation<
    boolean,
    Error,
    { userId: string; isActive: boolean; reason?: string }
  >({
    mutationFn: ({ userId, isActive, reason }) =>
      setUserStatus(userId, isActive, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  return {
    updateRole: updateRoleMutation,
    setStatus: setStatusMutation,
  }
}
