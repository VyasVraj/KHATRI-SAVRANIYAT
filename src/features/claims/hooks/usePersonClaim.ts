/**
 * React Query hooks for Person Claims domain (Phase 8)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { ADMIN_ROLES } from '@/constants/app'
import {
  getMyClaimForPerson,
  getMyClaims,
  submitPersonClaim,
  cancelPersonClaim,
  listPendingClaimsForReview,
  getClaimForReview,
  approveClaim,
  rejectClaim,
} from '../services/claims.service'
import type {
  SubmitClaimInput,
  CancelClaimInput,
  ApproveClaimInput,
  RejectClaimInput,
} from '../types'

/**
 * Hook to retrieve the current user's claim status for a specific person.
 *
 * @param personId - Target census person record UUID
 */
export function usePersonClaim(personId: string | undefined) {
  const { user, isAuthenticated } = useAuthContext()
  const claimantId = user?.id

  return useQuery({
    queryKey: ['person-claim', personId, claimantId],
    queryFn: async () => {
      if (!personId || !claimantId) return null
      const res = await getMyClaimForPerson(personId, claimantId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: Boolean(personId && isAuthenticated && claimantId),
    staleTime: 1000 * 30, // 30 seconds
  })
}

/**
 * Hook to retrieve all claims submitted by the current authenticated user.
 */
export function useMyClaims() {
  const { user, isAuthenticated } = useAuthContext()
  const claimantId = user?.id

  return useQuery({
    queryKey: ['my-claims', claimantId],
    queryFn: async () => {
      if (!claimantId) return []
      const res = await getMyClaims(claimantId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: Boolean(isAuthenticated && claimantId),
    staleTime: 1000 * 30,
  })
}

/**
 * Hook providing mutations to submit and cancel claims for regular users.
 */
export function useClaimMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()
  const claimantId = user?.id

  const submitClaim = useMutation({
    mutationFn: async (input: SubmitClaimInput) => {
      const res = await submitPersonClaim(input, claimantId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['person-claim', data.person_id] })
        queryClient.invalidateQueries({ queryKey: ['person', data.person_id] })
      }
      queryClient.invalidateQueries({ queryKey: ['my-claims', claimantId] })
    },
  })

  const cancelClaim = useMutation({
    mutationFn: async (input: CancelClaimInput) => {
      const res = await cancelPersonClaim(input, claimantId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['person-claim', data.person_id] })
        queryClient.invalidateQueries({ queryKey: ['person', data.person_id] })
      }
      queryClient.invalidateQueries({ queryKey: ['my-claims', claimantId] })
    },
  })

  return {
    submitClaim,
    cancelClaim,
  }
}

// ---------------------------------------------------------------------------
// Moderator Review Hooks (Phase 8 Subtask 3)
// ---------------------------------------------------------------------------

/**
 * Hook to fetch the queue of pending claims for moderator review.
 * Only enabled when the current authenticated user holds an administrative/moderator role.
 */
export function usePendingClaimsReview() {
  const { user, profile, isAuthenticated } = useAuthContext()
  const isModerator = Boolean(
    isAuthenticated && profile?.role && ADMIN_ROLES.includes(profile.role)
  )

  return useQuery({
    queryKey: ['claims-review-queue'],
    queryFn: async () => {
      const res = await listPendingClaimsForReview(user?.id)
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
 * Hook to fetch a single claim record for review inspection.
 *
 * @param claimId - UUID of the claim
 */
export function useClaimForReview(claimId: string | undefined) {
  const { user, profile, isAuthenticated } = useAuthContext()
  const isModerator = Boolean(
    isAuthenticated && profile?.role && ADMIN_ROLES.includes(profile.role)
  )

  return useQuery({
    queryKey: ['claim-review-detail', claimId],
    queryFn: async () => {
      if (!claimId) return null
      const res = await getClaimForReview(claimId, user?.id)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: Boolean(isModerator && claimId),
    staleTime: 1000 * 10,
  })
}

/**
 * Hook providing mutations for approving or rejecting claims in the moderator workflow.
 */
export function useReviewClaimMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  const approve = useMutation({
    mutationFn: async (input: ApproveClaimInput) => {
      const res = await approveClaim(input, user?.id)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims-review-queue'] })
      queryClient.invalidateQueries({ queryKey: ['claim-review-detail'] })
      queryClient.invalidateQueries({ queryKey: ['person-claim'] })
      queryClient.invalidateQueries({ queryKey: ['person'] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })

  const reject = useMutation({
    mutationFn: async (input: RejectClaimInput) => {
      const res = await rejectClaim(input, user?.id)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims-review-queue'] })
      queryClient.invalidateQueries({ queryKey: ['claim-review-detail'] })
      queryClient.invalidateQueries({ queryKey: ['person-claim'] })
    },
  })

  return {
    approve,
    reject,
  }
}
