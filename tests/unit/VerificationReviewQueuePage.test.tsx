/**
 * Unit Tests: VerificationReviewQueuePage (Phase 9 Subtask 3)
 * (src/features/verification/pages/VerificationReviewQueuePage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { VerificationReviewQueuePage } from '@/features/verification/pages/VerificationReviewQueuePage'
import * as reviewHooks from '@/features/verification/hooks/useVerificationReview'
import type { VerificationRequestForReview } from '@/features/verification/types'

vi.mock('@/features/verification/hooks/useVerificationReview')

const MOCK_ITEMS: VerificationRequestForReview[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    entity_type: 'PERSON',
    entity_id: '11111111-1111-4111-8111-111111111111',
    requester_id: '44444444-4444-4444-8444-444444444444',
    status: 'PENDING',
    supporting_notes: 'Valid family certificate provided.',
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-10-06T12:00:00Z',
    updated_at: '2026-10-06T12:00:00Z',
    person: {
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Dev',
      middle_name: null,
      last_name: 'Patel',
      gender: 'MALE',
      date_of_birth: '1985-05-20',
      date_of_death: null,
      birth_place: 'Surat',
      gotra: 'Kashyap',
      nukh: null,
      kul: null,
      status: 'ACTIVE',
      verification_status: 'PENDING',
    },
    family: null,
    requester: {
      id: '44444444-4444-4444-8444-444444444444',
      display_name: 'Rohan Patel',
      avatar_url: null,
      email: 'rohan@example.com',
    },
    reviewer: null,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    entity_type: 'FAMILY',
    entity_id: '22222222-2222-4222-8222-222222222222',
    requester_id: '44444444-4444-4444-8444-444444444444',
    status: 'PENDING',
    supporting_notes: 'Community elder confirmation.',
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-10-06T13:00:00Z',
    updated_at: '2026-10-06T13:00:00Z',
    person: null,
    family: {
      id: '22222222-2222-4222-8222-222222222222',
      family_name: 'Patel Heritage',
      description: 'Ancestral home',
      gotra: 'Kashyap',
      nukh: null,
      kul: null,
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
      status: 'ACTIVE',
      verification_status: 'PENDING',
    },
    requester: {
      id: '44444444-4444-4444-8444-444444444444',
      display_name: 'Rohan Patel',
      avatar_url: null,
      email: 'rohan@example.com',
    },
    reviewer: null,
  },
]

describe('VerificationReviewQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(reviewHooks.useVerificationReviewMutations).mockReturnValue({
      approve: { isPending: false, mutateAsync: vi.fn() } as unknown as ReturnType<typeof reviewHooks.useVerificationReviewMutations>['approve'],
      reject: { isPending: false, mutateAsync: vi.fn() } as unknown as ReturnType<typeof reviewHooks.useVerificationReviewMutations>['reject'],
    })
  })

  it('renders queue header, pending counter, and filter tabs', () => {
    vi.mocked(reviewHooks.useVerificationRequestsReview).mockReturnValue({
      data: MOCK_ITEMS,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof reviewHooks.useVerificationRequestsReview>)

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(VerificationReviewQueuePage)
      )
    )

    expect(html).toContain('Verification Review Queue')
    expect(html).toContain('2 pending')
    expect(html).toContain('data-testid="tab-verifications"')
    expect(html).toContain('data-testid="tab-duplicates"')
    expect(html).toContain('Pending')
    expect(html).toContain('All Requests')
    expect(html).toContain('Approved')
    expect(html).toContain('Rejected')
    expect(html).toContain('Persons')
    expect(html).toContain('Families')
  })


  it('renders list of pending requests with action buttons', () => {
    vi.mocked(reviewHooks.useVerificationRequestsReview).mockReturnValue({
      data: MOCK_ITEMS,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof reviewHooks.useVerificationRequestsReview>)

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(VerificationReviewQueuePage)
      )
    )

    expect(html).toContain('Dev Patel')
    expect(html).toContain('Patel Heritage')
    expect(html).toContain('Rohan Patel')
    expect(html).toContain('View Details')
    expect(html).toContain('Approve')
    expect(html).toContain('Reject')
  })

  it('renders empty state when there are no requests', () => {
    vi.mocked(reviewHooks.useVerificationRequestsReview).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof reviewHooks.useVerificationRequestsReview>)

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(VerificationReviewQueuePage)
      )
    )

    expect(html).toContain('No pending verification requests')
    expect(html).toContain('0 pending')
  })

  it('renders error state when query fails', () => {
    vi.mocked(reviewHooks.useVerificationRequestsReview).mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('Permission denied by database RLS'),
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof reviewHooks.useVerificationRequestsReview>)

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(VerificationReviewQueuePage)
      )
    )

    expect(html).toContain('Failed to load verification review queue')
    expect(html).toContain('Permission denied by database RLS')
    expect(html).toContain('Try Again')
  })
})
