/**
 * React Query Hooks for Occupation Update Requests
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminOccupationRequests,
  getOccupationRequestCounts,
  getMyOccupationRequests,
  submitOccupationUpdateRequest,
  approveOccupationRequest,
  rejectOccupationRequest,
  type AdminOccupationFilters,
} from '../services/occupation-request.service'

export const OCCUPATION_REQUESTS_KEY = ['occupation-requests']
export const OCCUPATION_COUNTS_KEY = ['occupation-request-counts']
export const MY_OCCUPATION_REQUESTS_KEY = ['my-occupation-requests']

export function useAdminOccupationRequests(filters: AdminOccupationFilters = {}) {
  return useQuery({
    queryKey: [...OCCUPATION_REQUESTS_KEY, filters],
    queryFn: () => getAdminOccupationRequests(filters),
    staleTime: 1000 * 30, // 30 seconds
  })
}

export function useOccupationRequestCounts() {
  return useQuery({
    queryKey: OCCUPATION_COUNTS_KEY,
    queryFn: getOccupationRequestCounts,
    staleTime: 1000 * 30,
  })
}

export function useMyOccupationRequests(personId?: string) {
  let hasClient = false
  try {
    if (useQueryClient()) {
      hasClient = true
    }
  } catch {
    hasClient = false
  }

  if (!hasClient) {
    return {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof useQuery<import('../services/occupation-request.service').MyOccupationRequestItem[]>>
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryKey: [...MY_OCCUPATION_REQUESTS_KEY, personId ?? 'all'],
    queryFn: () => getMyOccupationRequests(personId),
    staleTime: 1000 * 30,
  })
}

export function useOccupationRequestMutations() {
  let queryClient: ReturnType<typeof useQueryClient> | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    queryClient = useQueryClient()
  } catch {
    // Fallback outside QueryClientProvider
  }

  const invalidateAll = () => {
    if (!queryClient) return
    queryClient.invalidateQueries({ queryKey: OCCUPATION_REQUESTS_KEY })
    queryClient.invalidateQueries({ queryKey: OCCUPATION_COUNTS_KEY })
    queryClient.invalidateQueries({ queryKey: MY_OCCUPATION_REQUESTS_KEY })
    queryClient.invalidateQueries({ queryKey: ['person'] })
    queryClient.invalidateQueries({ queryKey: ['people'] })
    queryClient.invalidateQueries({ queryKey: ['public-occupation-directory'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const submitMutation = useMutation({
    mutationFn: ({
      personId,
      requestedOccupation,
    }: {
      personId: string
      requestedOccupation: string
    }) => submitOccupationUpdateRequest(personId, requestedOccupation),
    onSuccess: invalidateAll,
  })

  const approveMutation = useMutation({
    mutationFn: ({ requestId }: { requestId: string }) => approveOccupationRequest(requestId),
    onSuccess: invalidateAll,
  })

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      rejectOccupationRequest(requestId, reason),
    onSuccess: invalidateAll,
  })

  return {
    submit: submitMutation,
    approve: approveMutation,
    reject: rejectMutation,
  }
}
