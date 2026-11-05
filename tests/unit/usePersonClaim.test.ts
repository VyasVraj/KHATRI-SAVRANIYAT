/**
 * Unit Tests: Claims Domain React Hooks (Phase 8 Subtask 2)
 * (src/features/claims/hooks/usePersonClaim.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import {
  usePersonClaim,
  useMyClaims,
  useClaimMutations,
} from '@/features/claims/hooks/usePersonClaim'
import * as claimsService from '@/features/claims/services/claims.service'
import * as authContext from '@/features/auth/context/AuthContext'
import type { PersonClaim } from '@/features/claims/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/claims/services/claims.service')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const CLAIM_ID = '33333333-3333-4333-8333-333333333333'

const MOCK_CLAIM: PersonClaim = {
  id: CLAIM_ID,
  person_id: PERSON_ID,
  claimant_id: USER_ID,
  status: 'PENDING',
  evidence_notes: 'Evidence note',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
}

describe('Claims Hooks', () => {
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
      user: { id: USER_ID } as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  describe('usePersonClaim', () => {
    it('initializes query as fetching when authenticated and personId provided', () => {
      vi.spyOn(claimsService, 'getMyClaimForPerson').mockResolvedValue({
        data: MOCK_CLAIM,
        error: null,
      })

      const query = captureHook(() => usePersonClaim(PERSON_ID))
      expect(query.fetchStatus).toBe('fetching')
    })

    it('remains idle when unauthenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      const query = captureHook(() => usePersonClaim(PERSON_ID))
      expect(query.fetchStatus).toBe('idle')
    })

    it('remains idle when personId is undefined', () => {
      const query = captureHook(() => usePersonClaim(undefined))
      expect(query.fetchStatus).toBe('idle')
    })
  })

  describe('useMyClaims', () => {
    it('initializes query as fetching when authenticated', () => {
      vi.spyOn(claimsService, 'getMyClaims').mockResolvedValue({
        data: [MOCK_CLAIM],
        error: null,
      })

      const query = captureHook(() => useMyClaims())
      expect(query.fetchStatus).toBe('fetching')
    })

    it('remains idle when unauthenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      const query = captureHook(() => useMyClaims())
      expect(query.fetchStatus).toBe('idle')
    })
  })

  describe('useClaimMutations', () => {
    it('provides submitClaim and cancelClaim mutations', () => {
      const mutations = captureHook(() => useClaimMutations())
      expect(mutations.submitClaim).toBeDefined()
      expect(mutations.cancelClaim).toBeDefined()
      expect(typeof mutations.submitClaim.mutateAsync).toBe('function')
      expect(typeof mutations.cancelClaim.mutateAsync).toBe('function')
    })

    it('throws error when submitPersonClaim returns error', async () => {
      vi.spyOn(claimsService, 'submitPersonClaim').mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'Duplicate claim' },
      })

      const mutations = captureHook(() => useClaimMutations())
      await expect(
        mutations.submitClaim.mutateAsync({ personId: PERSON_ID })
      ).rejects.toThrow('Duplicate claim')
    })

    it('throws error when cancelPersonClaim returns error', async () => {
      vi.spyOn(claimsService, 'cancelPersonClaim').mockResolvedValue({
        data: null,
        error: { code: 'DB_ERROR', message: 'Unable to cancel' },
      })

      const mutations = captureHook(() => useClaimMutations())
      await expect(
        mutations.cancelClaim.mutateAsync({ claimId: CLAIM_ID, personId: PERSON_ID })
      ).rejects.toThrow('Unable to cancel')
    })
  })
})
