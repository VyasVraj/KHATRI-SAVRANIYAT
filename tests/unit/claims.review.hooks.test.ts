/**
 * Unit Tests: Claim Review Hooks (Phase 8 Subtask 3)
 * (src/features/claims/hooks/usePersonClaim.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import {
  usePendingClaimsReview,
  useClaimForReview,
  useReviewClaimMutations,
} from '@/features/claims/hooks/usePersonClaim'
import * as claimsService from '@/features/claims/services/claims.service'
import * as authContext from '@/features/auth/context/AuthContext'
import type { ProfileRow } from '@/types'
import type { ClaimForReview } from '@/features/claims/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/claims/services/claims.service')

const MODERATOR_ID = '99999999-9999-4999-8999-999999999999'
const CLAIM_ID = '33333333-3333-4333-8333-333333333333'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'

const MOCK_CLAIM_REVIEW: ClaimForReview = {
  id: CLAIM_ID,
  person_id: PERSON_ID,
  claimant_id: '11111111-1111-4111-8111-111111111111',
  status: 'PENDING',
  evidence_notes: 'Evidence note',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
  person: {
    id: PERSON_ID,
    first_name: 'Aarav',
    middle_name: null,
    last_name: 'Patel',
    date_of_birth: '1990-01-01',
    birth_place: null,
    gotra: null,
    nukh: null,
    kul: null,
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
  },
  claimant: {
    id: '11111111-1111-4111-8111-111111111111',
    display_name: 'Aarav Patel',
    avatar_url: null,
    email: 'aarav@example.com',
  },
}

describe('Claim Review Hooks', () => {
  let queryClient: QueryClient

  function captureHook<T>(hookFn: () => T): T {
    let captured!: T
    function TestComponent() {
      captured = hookFn()
      return null
    }
    renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(TestComponent)
      )
    )
    return captured
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MODERATOR_ID } as User,
      profile: { id: MODERATOR_ID, role: 'COMMUNITY_MODERATOR' } as ProfileRow,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  describe('usePendingClaimsReview', () => {
    it('initializes query as fetching when caller has COMMUNITY_MODERATOR role', () => {
      vi.spyOn(claimsService, 'listPendingClaimsForReview').mockResolvedValue({
        data: [MOCK_CLAIM_REVIEW],
        error: null,
      })

      const query = captureHook(() => usePendingClaimsReview())
      expect(query.fetchStatus).toBe('fetching')
    })

    it('initializes query as fetching when caller has ADMIN or SUPER_ADMIN role', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: MODERATOR_ID } as User,
        profile: { id: MODERATOR_ID, role: 'SUPER_ADMIN' } as ProfileRow,
        session: null,
        isAuthenticated: true,
        isLoading: false,
      })
      vi.spyOn(claimsService, 'listPendingClaimsForReview').mockResolvedValue({
        data: [],
        error: null,
      })

      const query = captureHook(() => usePendingClaimsReview())
      expect(query.fetchStatus).toBe('fetching')
    })

    it('remains idle when user is a regular MEMBER (not moderator)', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: MODERATOR_ID } as User,
        profile: { id: MODERATOR_ID, role: 'MEMBER' } as ProfileRow,
        session: null,
        isAuthenticated: true,
        isLoading: false,
      })

      const query = captureHook(() => usePendingClaimsReview())
      expect(query.fetchStatus).toBe('idle')
    })

    it('remains idle when user is unauthenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      const query = captureHook(() => usePendingClaimsReview())
      expect(query.fetchStatus).toBe('idle')
    })
  })

  describe('useClaimForReview', () => {
    it('fetches claim when moderator and claimId provided', () => {
      vi.spyOn(claimsService, 'getClaimForReview').mockResolvedValue({
        data: MOCK_CLAIM_REVIEW,
        error: null,
      })

      const query = captureHook(() => useClaimForReview(CLAIM_ID))
      expect(query.fetchStatus).toBe('fetching')
    })

    it('remains idle when claimId is undefined', () => {
      const query = captureHook(() => useClaimForReview(undefined))
      expect(query.fetchStatus).toBe('idle')
    })

    it('remains idle when user has MEMBER role', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: MODERATOR_ID } as User,
        profile: { id: MODERATOR_ID, role: 'MEMBER' } as ProfileRow,
        session: null,
        isAuthenticated: true,
        isLoading: false,
      })

      const query = captureHook(() => useClaimForReview(CLAIM_ID))
      expect(query.fetchStatus).toBe('idle')
    })
  })

  describe('useReviewClaimMutations', () => {
    it('provides approve and reject mutations', () => {
      const mutations = captureHook(() => useReviewClaimMutations())
      expect(mutations.approve).toBeDefined()
      expect(mutations.reject).toBeDefined()
      expect(typeof mutations.approve.mutateAsync).toBe('function')
      expect(typeof mutations.reject.mutateAsync).toBe('function')
    })

    it('approve mutation calls service and invalidates caches on success', async () => {
      vi.spyOn(claimsService, 'approveClaim').mockResolvedValue({
        data: { success: true },
        error: null,
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const mutations = captureHook(() => useReviewClaimMutations())
      await mutations.approve.mutateAsync({ claimId: CLAIM_ID })

      expect(claimsService.approveClaim).toHaveBeenCalledWith({ claimId: CLAIM_ID }, MODERATOR_ID)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['claims-review-queue'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['person-claim'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['person'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['persons'] })
    })

    it('reject mutation calls service and invalidates review queues on success', async () => {
      vi.spyOn(claimsService, 'rejectClaim').mockResolvedValue({
        data: { success: true },
        error: null,
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const mutations = captureHook(() => useReviewClaimMutations())
      await mutations.reject.mutateAsync({
        claimId: CLAIM_ID,
        reason: 'Duplicate record exists.',
      })

      expect(claimsService.rejectClaim).toHaveBeenCalledWith(
        { claimId: CLAIM_ID, reason: 'Duplicate record exists.' },
        MODERATOR_ID
      )
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['claims-review-queue'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['person-claim'] })
    })

    it('throws error when approveClaim returns an error', async () => {
      vi.spyOn(claimsService, 'approveClaim').mockResolvedValue({
        data: null,
        error: { code: 'ALREADY_REVIEWED', message: 'Claim has already been reviewed.' },
      })

      const mutations = captureHook(() => useReviewClaimMutations())
      await expect(mutations.approve.mutateAsync({ claimId: CLAIM_ID })).rejects.toThrow(
        'Claim has already been reviewed.'
      )
    })

    it('throws error when rejectClaim returns an error', async () => {
      vi.spyOn(claimsService, 'rejectClaim').mockResolvedValue({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required.' },
      })

      const mutations = captureHook(() => useReviewClaimMutations())
      await expect(
        mutations.reject.mutateAsync({ claimId: CLAIM_ID, reason: '' })
      ).rejects.toThrow('Rejection reason is required.')
    })
  })
})
