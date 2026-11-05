/**
 * Verification Review Hooks — Moderator React Query hooks (Phase 9 — Subtask 3)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { ADMIN_ROLES } from '@/constants/app'
import {
  listVerificationRequestsForReview,
  getVerificationRequestForReview,
  approveVerificationRequest,
  rejectVerificationRequest,
} from '../services/verification.review.service'
import type {
  ApproveVerificationRequestInput,
  RejectVerificationRequestInput,
  VerificationReviewFilters,
} from '../types'

/**
 * Hook to retrieve verification requests for moderator review.
 * Only active when the authenticated user holds an administrative/moderator role.
 *
 * @param filters - Optional filters (status, entityType, search query)
 */
export function useVerificationRequestsReview(filters?: VerificationReviewFilters) {
  const { user, profile, isAuthenticated } = useAuthContext()
  const isModerator = Boolean(
    isAuthenticated && profile?.role && ADMIN_ROLES.includes(profile.role)
  )

  return useQuery({
    queryKey: ['verification-requests-review', filters],
    queryFn: async () => {
      const res = await listVerificationRequestsForReview(filters, user?.id)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data ?? []
    },
    enabled: isModerator,
    staleTime: 1000 * 10, // 10 seconds
  })
}

/**
 * Hook to retrieve a single verification request with full target details for modal inspection.
 *
 * @param requestId - UUID of the verification request
 */
export function useVerificationRequestDetailReview(requestId: string | undefined) {
  const { user, profile, isAuthenticated } = useAuthContext()
  const isModerator = Boolean(
    isAuthenticated && profile?.role && ADMIN_ROLES.includes(profile.role)
  )

  return useQuery({
    queryKey: ['verification-request-review-detail', requestId],
    queryFn: async () => {
      if (!requestId) return null
      const res = await getVerificationRequestForReview(requestId, user?.id)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: Boolean(isModerator && requestId),
    staleTime: 1000 * 10,
  })
}

/**
 * Hook providing mutations for approving or rejecting verification requests.
 * Invalidates review queues, person records, family records, and directories upon success.
 */
export function useVerificationReviewMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  const approve = useMutation({
    mutationFn: async (input: ApproveVerificationRequestInput) => {
      const res = await approveVerificationRequest(input, user?.id)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-requests-review'] })
      queryClient.invalidateQueries({ queryKey: ['verification-request-review-detail'] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      queryClient.invalidateQueries({ queryKey: ['person'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['families'] })
      queryClient.invalidateQueries({ queryKey: ['family'] })
      queryClient.invalidateQueries({ queryKey: ['people-directory'] })
      queryClient.invalidateQueries({ queryKey: ['family-directory'] })
    },
  })

  const reject = useMutation({
    mutationFn: async (input: RejectVerificationRequestInput) => {
      const res = await rejectVerificationRequest(input, user?.id)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-requests-review'] })
      queryClient.invalidateQueries({ queryKey: ['verification-request-review-detail'] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      queryClient.invalidateQueries({ queryKey: ['person'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['families'] })
      queryClient.invalidateQueries({ queryKey: ['family'] })
      queryClient.invalidateQueries({ queryKey: ['people-directory'] })
      queryClient.invalidateQueries({ queryKey: ['family-directory'] })
    },
  })

  return {
    approve,
    reject,
  }
}
