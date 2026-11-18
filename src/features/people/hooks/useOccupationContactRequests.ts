/**
 * React Query Hooks for Occupation Contact Requests (Admin & Mukhi)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminOccupationContactRequests,
  getOccupationContactRequestCounts,
  submitOccupationAdminContactRequest,
  updateOccupationContactStatus,
  type AdminContactFilters,
  type SubmitAdminContactRequestInput,
  type OccupationContactStatus,
} from '../services/public-occupation.service'

export const OCCUPATION_CONTACT_REQUESTS_KEY = ['occupation-contact-requests']
export const OCCUPATION_CONTACT_COUNTS_KEY = ['occupation-contact-counts']

export function useAdminOccupationContactRequests(filters: AdminContactFilters = {}) {
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
    } as unknown as ReturnType<typeof useQuery<import('../services/public-occupation.service').AdminOccupationContactRequestItem[]>>
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryKey: [...OCCUPATION_CONTACT_REQUESTS_KEY, filters],
    queryFn: () => getAdminOccupationContactRequests(filters),
    staleTime: 1000 * 30,
  })
}

export function useOccupationContactCounts(channel: string = 'ADMIN') {
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
      data: { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0, resolved: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof useQuery<import('../services/public-occupation.service').OccupationContactCounts>>
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryKey: [...OCCUPATION_CONTACT_COUNTS_KEY, channel],
    queryFn: () => getOccupationContactRequestCounts(channel),
    staleTime: 1000 * 30,
  })
}

export function useOccupationContactMutations() {
  let queryClient: ReturnType<typeof useQueryClient> | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    queryClient = useQueryClient()
  } catch {
    // Fallback
  }

  const invalidateAll = () => {
    if (!queryClient) return
    queryClient.invalidateQueries({ queryKey: OCCUPATION_CONTACT_REQUESTS_KEY })
    queryClient.invalidateQueries({ queryKey: OCCUPATION_CONTACT_COUNTS_KEY })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const submitAdminContactMutation = useMutation({
    mutationFn: (input: SubmitAdminContactRequestInput) => submitOccupationAdminContactRequest(input),
    onSuccess: invalidateAll,
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({
      requestId,
      status,
      adminNote,
      rejectionReason,
    }: {
      requestId: string
      status: OccupationContactStatus
      adminNote?: string
      rejectionReason?: string
    }) => updateOccupationContactStatus(requestId, status, adminNote, rejectionReason),
    onSuccess: invalidateAll,
  })

  return {
    submitAdminContact: submitAdminContactMutation,
    updateStatus: updateStatusMutation,
  }
}
