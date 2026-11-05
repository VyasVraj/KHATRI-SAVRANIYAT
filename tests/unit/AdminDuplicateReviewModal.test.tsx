/**
 * Unit Tests: AdminDuplicateReviewModal (Phase 13 Subtask 4)
 * (src/features/admin/components/AdminDuplicateReviewModal.tsx)
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminDuplicateReviewModal } from '@/features/admin/components/AdminDuplicateReviewModal'
import * as useAdminDuplicatesModule from '@/features/admin/hooks/useAdminDuplicates'
import type { AdminDuplicateItem } from '@/features/admin/types'

vi.mock('@/features/admin/hooks/useAdminDuplicates', () => ({
  useResolveAdminDuplicate: vi.fn(),
}))

const mockPersonFlag: AdminDuplicateItem = {
  id: 'flag-p-1',
  entity_type: 'PERSON',
  record_a_id: 'person-a-1111',
  record_b_id: 'person-b-2222',
  confidence: 'STRONG',
  status: 'OPEN',
  match_signals: ['Exact full name', 'Same birth date (1990-01-01)'],
  notes: 'Automated census scan',
  resolution_notes: null,
  flagged_by: 'user-system',
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-16T10:00:00Z',
  updated_at: '2026-10-16T10:00:00Z',
  record_a_preview: {
    id: 'person-a-1111',
    label: 'Aarav K. Sharma',
    first_name: 'Aarav',
    middle_name: 'K',
    last_name: 'Sharma',
    gender: 'MALE',
    date_of_birth: '1990-01-01',
    birth_place: 'Jaipur',
    gotra: 'Bharadwaj',
    nukh: 'Sharma',
    kul: 'Brahmin',
    status: 'ALIVE',
    verification_status: 'VERIFIED',
  },
  record_b_preview: {
    id: 'person-b-2222',
    label: 'Aarav Sharma',
    first_name: 'Aarav',
    middle_name: null,
    last_name: 'Sharma',
    gender: 'MALE',
    date_of_birth: '1990-01-01',
    birth_place: 'Jaipur, Rajasthan',
    gotra: 'Bharadwaj',
    nukh: 'Sharma',
    kul: 'Brahmin',
    status: 'ALIVE',
    verification_status: 'UNVERIFIED',
  },
}

const mockFamilyFlag: AdminDuplicateItem = {
  id: 'flag-f-2',
  entity_type: 'FAMILY',
  record_a_id: 'fam-a-3333',
  record_b_id: 'fam-b-4444',
  confidence: 'POSSIBLE',
  status: 'OPEN',
  match_signals: ['Same family name', 'Same city (Ahmedabad)'],
  notes: null,
  resolution_notes: null,
  flagged_by: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-16T11:00:00Z',
  updated_at: '2026-10-16T11:00:00Z',
  record_a_preview: {
    id: 'fam-a-3333',
    label: 'Patel Parivar',
    family_name: 'Patel Parivar',
    gotra: 'Kashyap',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    description: 'Ancestral lineage branch',
    verification_status: 'VERIFIED',
  },
  record_b_preview: {
    id: 'fam-b-4444',
    label: 'Patel Family Unit',
    family_name: 'Patel Family Unit',
    gotra: 'Kashyap',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    description: null,
    verification_status: 'UNVERIFIED',
  },
}

describe('AdminDuplicateReviewModal Component', () => {
  const mockOnClose = vi.fn()
  const mockOnResolved = vi.fn()

  it('renders nothing when isOpen is false', () => {
    vi.mocked(useAdminDuplicatesModule.useResolveAdminDuplicate).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useResolveAdminDuplicate>)

    const markup = renderToStaticMarkup(
      React.createElement(AdminDuplicateReviewModal, {
        isOpen: false,
        onClose: mockOnClose,
        flag: mockPersonFlag,
        onResolved: mockOnResolved,
      })
    )
    expect(markup).toBe('')
  })

  it('renders side-by-side safe Person comparison attributes and DETECT != MERGE notice', () => {
    vi.mocked(useAdminDuplicatesModule.useResolveAdminDuplicate).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useResolveAdminDuplicate>)

    const markup = renderToStaticMarkup(
      React.createElement(AdminDuplicateReviewModal, {
        isOpen: true,
        onClose: mockOnClose,
        flag: mockPersonFlag,
        onResolved: mockOnResolved,
      })
    )

    expect(markup).toContain('Review Potential Person Duplicate')
    expect(markup).toContain('Architectural Notice: DETECT ≠ MERGE')
    expect(markup).toContain('Candidate A')
    expect(markup).toContain('Aarav K. Sharma')
    expect(markup).toContain('Jaipur')
    expect(markup).toContain('Bharadwaj')
    expect(markup).toContain('Candidate B')
    expect(markup).toContain('Aarav Sharma')
    expect(markup).toContain('Jaipur, Rajasthan')
    expect(markup).toContain('Exact full name')
    expect(markup).toContain('Same birth date (1990-01-01)')
    expect(markup).toContain('Confirm Duplicate')
    expect(markup).toContain('Mark Not Duplicate')
  })

  it('renders safe Family comparison attributes for FAMILY entity flags', () => {
    vi.mocked(useAdminDuplicatesModule.useResolveAdminDuplicate).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useResolveAdminDuplicate>)

    const markup = renderToStaticMarkup(
      React.createElement(AdminDuplicateReviewModal, {
        isOpen: true,
        onClose: mockOnClose,
        flag: mockFamilyFlag,
        onResolved: mockOnResolved,
      })
    )

    expect(markup).toContain('Review Potential Family Duplicate')
    expect(markup).toContain('Patel Parivar')
    expect(markup).toContain('Ahmedabad, Gujarat, India')
    expect(markup).toContain('Ancestral lineage branch')
    expect(markup).toContain('Patel Family Unit')
  })

  it('renders read-only resolution status when flag was already resolved', () => {
    vi.mocked(useAdminDuplicatesModule.useResolveAdminDuplicate).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useResolveAdminDuplicate>)

    const resolvedFlag: AdminDuplicateItem = {
      ...mockPersonFlag,
      status: 'CONFIRMED_DUPLICATE',
      resolution_notes: 'Verified duplicate individual in census tree',
      reviewed_at: '2026-10-16T15:00:00Z',
    }

    const markup = renderToStaticMarkup(
      React.createElement(AdminDuplicateReviewModal, {
        isOpen: true,
        onClose: mockOnClose,
        flag: resolvedFlag,
        onResolved: mockOnResolved,
      })
    )

    expect(markup).toContain('Confirmed Duplicate')
    expect(markup).toContain('Reviewer Notes:')
    expect(markup).toContain('Verified duplicate individual in census tree')
    expect(markup).toContain('This flag is resolved. No further actions can be taken.')
    expect(markup).not.toContain('Confirm Duplicate</button>')
  })
})
