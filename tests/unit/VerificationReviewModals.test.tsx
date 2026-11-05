/**
 * Unit Tests: Verification Review Modals (Phase 9 Subtask 3)
 * (src/features/verification/components/VerificationReviewDetailModal.tsx)
 * (src/features/verification/components/VerificationReviewRejectModal.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerificationReviewRejectModal } from '@/features/verification/components/VerificationReviewRejectModal'
import { VerificationReviewDetailModal } from '@/features/verification/components/VerificationReviewDetailModal'
import * as reviewHooks from '@/features/verification/hooks/useVerificationReview'
import type { VerificationRequestForReview } from '@/features/verification/types'

vi.mock('@/features/verification/hooks/useVerificationReview')

const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const PERSON_ID = '11111111-1111-4111-8111-111111111111'
const FAMILY_ID = '22222222-2222-4222-8222-222222222222'
const REQUESTER_ID = '44444444-4444-4444-8444-444444444444'

const MOCK_PENDING_PERSON_REQUEST: VerificationRequestForReview = {
  id: REQUEST_ID,
  entity_type: 'PERSON',
  entity_id: PERSON_ID,
  requester_id: REQUESTER_ID,
  status: 'PENDING',
  supporting_notes: 'Community elder witnessed lineage records.',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T12:00:00Z',
  updated_at: '2026-10-06T12:00:00Z',
  person: {
    id: PERSON_ID,
    first_name: 'Dev',
    middle_name: null,
    last_name: 'Patel',
    gender: 'MALE',
    date_of_birth: '1985-05-20',
    date_of_death: null,
    birth_place: 'Surat',
    gotra: 'Kashyap',
    nukh: 'Shah',
    kul: null,
    status: 'ACTIVE',
    verification_status: 'PENDING',
  },
  family: null,
  requester: {
    id: REQUESTER_ID,
    display_name: 'Aarav Patel',
    avatar_url: null,
    email: 'aarav@example.com',
  },
  reviewer: null,
}

const MOCK_REJECTED_FAMILY_REQUEST: VerificationRequestForReview = {
  id: '55555555-5555-4555-8555-555555555555',
  entity_type: 'FAMILY',
  entity_id: FAMILY_ID,
  requester_id: REQUESTER_ID,
  status: 'REJECTED',
  supporting_notes: 'Family tree records provided.',
  rejection_reason: 'Lineage could not be verified by committee.',
  reviewed_by: 'reviewer-user-id',
  reviewed_at: '2026-10-06T14:00:00Z',
  created_at: '2026-10-06T13:00:00Z',
  updated_at: '2026-10-06T14:00:00Z',
  person: null,
  family: {
    id: FAMILY_ID,
    family_name: 'Patel Heritage',
    description: 'Ancestral home in Gujarat',
    gotra: 'Kashyap',
    nukh: null,
    kul: null,
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
  },
  requester: {
    id: REQUESTER_ID,
    display_name: 'Aarav Patel',
    avatar_url: null,
    email: 'aarav@example.com',
  },
  reviewer: {
    id: 'reviewer-user-id',
    display_name: 'Chief Moderator',
  },
}

describe('VerificationReviewRejectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(reviewHooks.useVerificationReviewMutations).mockReturnValue({
      approve: { isPending: false, mutateAsync: vi.fn() } as unknown as ReturnType<typeof reviewHooks.useVerificationReviewMutations>['approve'],
      reject: { isPending: false, mutateAsync: vi.fn() } as unknown as ReturnType<typeof reviewHooks.useVerificationReviewMutations>['reject'],
    })
  })

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationReviewRejectModal, {
        requestId: REQUEST_ID,
        targetName: 'Dev Patel',
        entityType: 'PERSON',
        requesterName: 'Aarav Patel',
        isOpen: false,
        onClose: vi.fn(),
      })
    )
    expect(html).toBe('')
  })

  it('renders modal dialog with target details and reason textarea when isOpen is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationReviewRejectModal, {
        requestId: REQUEST_ID,
        targetName: 'Dev Patel',
        entityType: 'PERSON',
        requesterName: 'Aarav Patel',
        isOpen: true,
        onClose: vi.fn(),
      })
    )
    expect(html).toContain('Reject Person Verification')
    expect(html).toContain('Dev Patel')
    expect(html).toContain('Aarav Patel')
    expect(html).toContain('Rejection Reason')
    expect(html).toContain('Confirm Rejection')
  })
})

describe('VerificationReviewDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(reviewHooks.useVerificationReviewMutations).mockReturnValue({
      approve: { isPending: false, mutateAsync: vi.fn() } as unknown as ReturnType<typeof reviewHooks.useVerificationReviewMutations>['approve'],
      reject: { isPending: false, mutateAsync: vi.fn() } as unknown as ReturnType<typeof reviewHooks.useVerificationReviewMutations>['reject'],
    })
  })

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationReviewDetailModal, {
        request: MOCK_PENDING_PERSON_REQUEST,
        isOpen: false,
        onClose: vi.fn(),
      })
    )
    expect(html).toBe('')
  })

  it('renders person verification details with actions when status is PENDING', () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationReviewDetailModal, {
        request: MOCK_PENDING_PERSON_REQUEST,
        isOpen: true,
        onClose: vi.fn(),
      })
    )
    expect(html).toContain('Review Person Verification Request')
    expect(html).toContain('Dev Patel')
    expect(html).toContain('Surat')
    expect(html).toContain('Gotra: Kashyap')
    expect(html).toContain('Community elder witnessed lineage records.')
    expect(html).toContain('Approve &amp; Verify')
    expect(html).toContain('Reject Request')
  })

  it('renders family verification review history and rejection reason when status is REJECTED', () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationReviewDetailModal, {
        request: MOCK_REJECTED_FAMILY_REQUEST,
        isOpen: true,
        onClose: vi.fn(),
      })
    )
    expect(html).toContain('Review Family Verification Request')
    expect(html).toContain('Patel Heritage')
    expect(html).toContain('Ahmedabad')
    expect(html).toContain('Chief Moderator')
    expect(html).toContain('Lineage could not be verified by committee.')
    // Action buttons are NOT present for terminal state
    expect(html).not.toContain('Approve &amp; Verify')
  })
})
