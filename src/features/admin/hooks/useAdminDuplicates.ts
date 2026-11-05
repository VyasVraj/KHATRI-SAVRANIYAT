/**
 * Admin Duplicate Review Queue Hooks
 *
 * Phase 13 — Subtask 4: Duplicate Review Queue & Resolution
 *
 * TanStack Query hooks for querying and resolving duplicate flags in the Admin Hub.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAdminDuplicates, resolveAdminDuplicate } from '../services/admin.service'
import type {
  AdminDuplicateFilterParams,
  AdminDuplicateListResponse,
  ResolveAdminDuplicateInput,
} from '../types'

/**
 * Query hook for paginated and filtered duplicate review queue.
 */
export function useAdminDuplicates(params: AdminDuplicateFilterParams = {}) {
  return useQuery<AdminDuplicateListResponse, Error>({
    queryKey: ['admin', 'duplicates', params],
    queryFn: () => listAdminDuplicates(params),
    staleTime: 30 * 1000,
  })
}

/**
 * Mutation hook for resolving a duplicate flag.
 * Invalidates duplicates queue and platform metrics on success.
 */
export function useResolveAdminDuplicate() {
  const queryClient = useQueryClient()

  return useMutation<boolean, Error, ResolveAdminDuplicateInput>({
    mutationFn: (input: ResolveAdminDuplicateInput) => resolveAdminDuplicate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'duplicates'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'platform-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['duplicate-flags'] })
    },
  })
}
