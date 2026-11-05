/**
 * Unit Tests: DuplicateReviewModal UI Component (Phase 9 — Subtask 4)
 * (src/features/verification/components/DuplicateReviewModal.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DuplicateReviewModal } from '@/features/verification/components/DuplicateReviewModal'
import type { EnrichedDuplicateFlag } from '@/features/verification/types/duplicate.types'
import type { PersonRow } from '@/types'

vi.mock('@/features/verification/hooks/useDuplicateDetection', () => ({
  useResolveDuplicate: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}))

describe('DuplicateReviewModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockFlag: EnrichedDuplicateFlag = {
    id: 'flag-uuid-123',
    entity_type: 'PERSON',
    record_a_id: '11111111-1111-4111-8111-111111111111',
    record_b_id: '22222222-2222-4222-8222-222222222222',
    confidence: 'STRONG',
    status: 'OPEN',
    match_reasons: ['Identical full name', 'Identical birth date'],
    flagged_by: 'user-1',
    flagged_at: '2026-10-06T10:00:00Z',
    resolved_by: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: '2026-10-06T10:00:00Z',
    updated_at: '2026-10-06T10:00:00Z',
    recordA: {
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Aarav',
      last_name: 'Patel',
      gender: 'MALE',
      date_of_birth: '1990-05-15',
      gotra: 'Kashyap',
      status: 'ACTIVE',
      verification_status: 'UNVERIFIED',
    } as PersonRow,
    recordB: {
      id: '22222222-2222-4222-8222-222222222222',
      first_name: 'Aarav',
      last_name: 'Patel',
      gender: 'MALE',
      date_of_birth: '1990-05-15',
      gotra: 'Kashyap',
      status: 'ACTIVE',
      verification_status: 'UNVERIFIED',
    } as PersonRow,
  }

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(DuplicateReviewModal, {
        isOpen: false,
        onClose: vi.fn(),
        flag: mockFlag,
      })
    )
    expect(html).toBe('')
  })

  it('renders side-by-side cards, safety notice, and action buttons when open', () => {
    const html = renderToStaticMarkup(
      React.createElement(DuplicateReviewModal, {
        isOpen: true,
        onClose: vi.fn(),
        flag: mockFlag,
      })
    )

    expect(html).toContain('data-testid="duplicate-review-modal"')
    expect(html).toContain('data-testid="duplicate-record-a-card"')
    expect(html).toContain('data-testid="duplicate-record-b-card"')
    expect(html).toContain('data-testid="confirm-duplicate-button"')
    expect(html).toContain('data-testid="dismiss-duplicate-button"')
    expect(html).toContain('DETECT != MERGE Guarantee')
    expect(html).toContain('Identical full name')
    expect(html).toContain('STRONG')
  })
})
