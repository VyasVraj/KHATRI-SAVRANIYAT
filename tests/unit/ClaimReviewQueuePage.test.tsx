/**
 * Unit Tests: ClaimReviewQueuePage (Phase 8 Subtask 3)
 * (src/features/claims/pages/ClaimReviewQueuePage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClaimReviewQueuePage } from '@/features/claims/pages/ClaimReviewQueuePage'
import * as hooks from '@/features/claims/hooks/usePersonClaim'
import type { ClaimForReview } from '@/features/claims/types'

vi.mock('@/features/claims/hooks/usePersonClaim')

const CLAIM_ID_1 = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID_2 = '44444444-4444-4444-8444-444444444444'

const MOCK_CLAIMS: ClaimForReview[] = [
  {
    id: CLAIM_ID_1,
    person_id: '11111111-1111-1111-1111-111111111111',
    claimant_id: 'user-1',
    status: 'PENDING',
    evidence_notes: 'Birth certificate registered in Mumbai',
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-10-06T10:00:00Z',
    updated_at: '2026-10-06T10:00:00Z',
    person: {
      id: '11111111-1111-1111-1111-111111111111',
      first_name: 'Aarav',
      middle_name: 'K.',
      last_name: 'Patel',
      date_of_birth: '1990-05-15',
      birth_place: 'Mumbai',
      gotra: 'Kashyap',
      nukh: 'Shah',
      kul: null,
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      user_id: null,
    },
    claimant: {
      id: 'user-1',
      display_name: 'Aarav Patel',
      avatar_url: null,
      email: 'aarav@example.com',
    },
  },
  {
    id: CLAIM_ID_2,
    person_id: '22222222-2222-2222-2222-222222222222',
    claimant_id: 'user-2',
    status: 'PENDING',
    evidence_notes: null,
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-10-06T11:00:00Z',
    updated_at: '2026-10-06T11:00:00Z',
    person: {
      id: '22222222-2222-2222-2222-222222222222',
      first_name: 'Diya',
      middle_name: null,
      last_name: 'Mehta',
      date_of_birth: '1995-08-20',
      birth_place: 'Ahmedabad',
      gotra: 'Vatsa',
      nukh: null,
      kul: null,
      status: 'ACTIVE',
      verification_status: 'UNVERIFIED',
      user_id: null,
    },
    claimant: {
      id: 'user-2',
      display_name: 'Diya Mehta',
      avatar_url: null,
      email: 'diya@example.com',
    },
  },
]

describe('ClaimReviewQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(hooks, 'useReviewClaimMutations').mockReturnValue({
      approve: {
        mutateAsync: vi.fn(),
        isPending: false,
      } as unknown as ReturnType<typeof hooks.useReviewClaimMutations>['approve'],
      reject: {
        mutateAsync: vi.fn(),
        isPending: false,
      } as unknown as ReturnType<typeof hooks.useReviewClaimMutations>['reject'],
    })
  })

  it('renders loading state when isLoading is true', () => {
    vi.spyOn(hooks, 'usePendingClaimsReview').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      isFetching: true,
    } as unknown as ReturnType<typeof hooks.usePendingClaimsReview>)

    const html = renderToStaticMarkup(React.createElement(ClaimReviewQueuePage))
    expect(html).toContain('data-testid="claims-queue-loading"')
  })

  it('renders error state when error is returned', () => {
    vi.spyOn(hooks, 'usePendingClaimsReview').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Database permission denied'),
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof hooks.usePendingClaimsReview>)

    const html = renderToStaticMarkup(React.createElement(ClaimReviewQueuePage))
    expect(html).toContain('Unable to load review queue')
    expect(html).toContain('Database permission denied')
    expect(html).toContain('Try Again')
  })

  it('renders empty queue state when no pending claims exist', () => {
    vi.spyOn(hooks, 'usePendingClaimsReview').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof hooks.usePendingClaimsReview>)

    const html = renderToStaticMarkup(React.createElement(ClaimReviewQueuePage))
    expect(html).toContain('Claim Review Queue')
    expect(html).toContain('Review Queue is Clear')
    expect(html).toContain('There are currently no pending census record ownership claims')
  })

  it('renders claims list with count badge, details, and action buttons', () => {
    vi.spyOn(hooks, 'usePendingClaimsReview').mockReturnValue({
      data: MOCK_CLAIMS,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof hooks.usePendingClaimsReview>)

    const html = renderToStaticMarkup(React.createElement(ClaimReviewQueuePage))
    expect(html).toContain('Claim Review Queue')
    expect(html).toContain('2 pending')
    expect(html).toContain('Aarav K. Patel')
    expect(html).toContain('Diya Mehta')
    expect(html).toContain('Kashyap')
    expect(html).toContain('Vatsa')
    expect(html).toContain('Inspect &amp; Review')
    expect(html).toContain('Reject')
    expect(html).toContain('Approve')
  })
})
