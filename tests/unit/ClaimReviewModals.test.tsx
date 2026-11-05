/**
 * Unit Tests: Claim Review Modals (Phase 8 Subtask 3)
 * (src/features/claims/components/ClaimReviewRejectModal.tsx & ClaimReviewDetailModal.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClaimReviewRejectModal } from '@/features/claims/components/ClaimReviewRejectModal'
import { ClaimReviewDetailModal } from '@/features/claims/components/ClaimReviewDetailModal'
import * as hooks from '@/features/claims/hooks/usePersonClaim'
import type { ClaimForReview } from '@/features/claims/types'

vi.mock('@/features/claims/hooks/usePersonClaim')

const CLAIM_ID = '33333333-3333-4333-8333-333333333333'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'

const MOCK_CLAIM: ClaimForReview = {
  id: CLAIM_ID,
  person_id: PERSON_ID,
  claimant_id: '11111111-1111-4111-8111-111111111111',
  status: 'PENDING',
  evidence_notes: 'I possess the physical lineage registry and birth certificate.',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
  person: {
    id: PERSON_ID,
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
    id: '11111111-1111-4111-8111-111111111111',
    display_name: 'Aarav Patel',
    avatar_url: null,
    email: 'aarav@example.com',
  },
}

describe('Claim Review Modals', () => {
  const mockApproveMutateAsync = vi.fn().mockResolvedValue({ success: true })
  const mockRejectMutateAsync = vi.fn().mockResolvedValue({ success: true })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(hooks, 'useReviewClaimMutations').mockReturnValue({
      approve: {
        mutateAsync: mockApproveMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof hooks.useReviewClaimMutations>['approve'],
      reject: {
        mutateAsync: mockRejectMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof hooks.useReviewClaimMutations>['reject'],
    })
  })

  describe('ClaimReviewRejectModal', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimReviewRejectModal, {
          claimId: CLAIM_ID,
          personName: 'Aarav Patel',
          claimantName: 'Aarav Patel',
          isOpen: false,
          onClose: vi.fn(),
        })
      )
      expect(html).toBe('')
    })

    it('renders reject dialog with title, description, and textarea when open', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimReviewRejectModal, {
          claimId: CLAIM_ID,
          personName: 'Aarav Patel',
          claimantName: 'Aarav Patel',
          isOpen: true,
          onClose: vi.fn(),
        })
      )
      expect(html).toContain('Reject Person Claim')
      expect(html).toContain('Aarav Patel')
      expect(html).toContain('Rejection Reason')
      expect(html).toContain('Confirm Rejection')
    })
  })

  describe('ClaimReviewDetailModal', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimReviewDetailModal, {
          claim: MOCK_CLAIM,
          isOpen: false,
          onClose: vi.fn(),
        })
      )
      expect(html).toBe('')
    })

    it('returns null when claim is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimReviewDetailModal, {
          claim: null,
          isOpen: true,
          onClose: vi.fn(),
        })
      )
      expect(html).toBe('')
    })

    it('renders person details, claimant info, and evidence notes', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimReviewDetailModal, {
          claim: MOCK_CLAIM,
          isOpen: true,
          onClose: vi.fn(),
        })
      )
      expect(html).toContain('Review Census Record Claim')
      expect(html).toContain('Aarav K. Patel')
      expect(html).toContain('Mumbai')
      expect(html).toContain('Kashyap')
      expect(html).toContain('Shah')
      expect(html).toContain('aarav@example.com')
      expect(html).toContain('I possess the physical lineage registry and birth certificate.')
      expect(html).toContain('Approve Claim')
      expect(html).toContain('Reject Claim…')
    })

    it('handles claim without optional claimant email and middle name gracefully', () => {
      const minimalClaim: ClaimForReview = {
        ...MOCK_CLAIM,
        person: MOCK_CLAIM.person
          ? {
              ...MOCK_CLAIM.person,
              middle_name: null,
              birth_place: null,
              gotra: null,
              nukh: null,
            }
          : null,
        claimant: {
          id: '11111111-1111-4111-8111-111111111111',
          display_name: null,
          avatar_url: null,
          email: null,
        },
        evidence_notes: null,
      }

      const html = renderToStaticMarkup(
        React.createElement(ClaimReviewDetailModal, {
          claim: minimalClaim,
          isOpen: true,
          onClose: vi.fn(),
        })
      )
      expect(html).toContain('Aarav Patel')
      expect(html).toContain('No additional evidence notes were provided.')
    })
  })
})
