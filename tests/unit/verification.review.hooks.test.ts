/**
 * Unit Tests: Verification Review Hooks (Phase 9 Subtask 3)
 * (src/features/verification/hooks/useVerificationReview.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useVerificationRequestsReview,
  useVerificationRequestDetailReview,
  useVerificationReviewMutations,
} from '@/features/verification/hooks/useVerificationReview'
import * as reviewService from '@/features/verification/services/verification.review.service'
import * as authContext from '@/features/auth/context/AuthContext'
import type { ProfileRow } from '@/types'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/verification/services/verification.review.service')
vi.mock('@/features/auth/context/AuthContext')

const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const MODERATOR_ID = '99999999-9999-4999-8999-999999999999'

describe('Verification Review Hooks', () => {
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

    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: MODERATOR_ID } as User,
      profile: {
        id: MODERATOR_ID,
        role: 'COMMUNITY_MODERATOR',
        display_name: 'Moderator',
      } as ProfileRow,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  describe('useVerificationRequestsReview', () => {
    it('is enabled for users with COMMUNITY_MODERATOR role', () => {
      vi.mocked(reviewService.listVerificationRequestsForReview).mockResolvedValue({
        data: [],
        error: null,
      })

      const query = captureHook(() => useVerificationRequestsReview({ status: 'PENDING' }))
      expect(query.fetchStatus).not.toBe('idle')
    })

    it('is disabled for regular members without administrative role', () => {
      vi.mocked(authContext.useAuthContext).mockReturnValue({
        user: { id: 'regular-user' } as User,
        profile: {
          id: 'regular-user',
          role: 'MEMBER',
        } as ProfileRow,
        session: null,
        isAuthenticated: true,
        isLoading: false,
      })

      const query = captureHook(() => useVerificationRequestsReview())
      expect(query.fetchStatus).toBe('idle')
    })
  })

  describe('useVerificationRequestDetailReview', () => {
    it('is enabled when moderator is authenticated and requestId is provided', () => {
      vi.mocked(reviewService.getVerificationRequestForReview).mockResolvedValue({
        data: null,
        error: null,
      })

      const query = captureHook(() => useVerificationRequestDetailReview(REQUEST_ID))
      expect(query.fetchStatus).not.toBe('idle')
    })

    it('is disabled when requestId is undefined', () => {
      const query = captureHook(() => useVerificationRequestDetailReview(undefined))
      expect(query.fetchStatus).toBe('idle')
    })
  })

  describe('useVerificationReviewMutations', () => {
    it('approves verification request and invalidates queries', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(reviewService.approveVerificationRequest).mockResolvedValue({
        data: { success: true },
        error: null,
      })

      const { approve } = captureHook(() => useVerificationReviewMutations())
      await approve.mutateAsync({ requestId: REQUEST_ID })

      expect(reviewService.approveVerificationRequest).toHaveBeenCalledWith(
        { requestId: REQUEST_ID },
        MODERATOR_ID
      )
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['verification-requests-review'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['persons'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['families'] })
    })

    it('rejects verification request and invalidates queries', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(reviewService.rejectVerificationRequest).mockResolvedValue({
        data: { success: true },
        error: null,
      })

      const { reject } = captureHook(() => useVerificationReviewMutations())
      await reject.mutateAsync({
        requestId: REQUEST_ID,
        reason: 'Incomplete documentation',
      })

      expect(reviewService.rejectVerificationRequest).toHaveBeenCalledWith(
        { requestId: REQUEST_ID, reason: 'Incomplete documentation' },
        MODERATOR_ID
      )
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['verification-requests-review'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['persons'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['families'] })
    })
  })
})
