/**
 * Unit tests for EditRelationshipModal component
 * (src/features/relationships/components/EditRelationshipModal.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EditRelationshipModal } from '@/features/relationships/components/EditRelationshipModal'
import type { PersonRelationshipItem } from '@/features/relationships/types'
import * as relationshipMutationsHook from '@/features/relationships/hooks/useRelationshipMutations'

const MOCK_ITEM: PersonRelationshipItem = {
  role: 'spouse',
  relatedPerson: {
    id: 'person-spouse',
    first_name: 'Kavita',
    middle_name: null,
    last_name: 'Shah',
    gender: 'FEMALE',
    date_of_birth: '1982-03-15',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE' as const,
  },
  relationship: {
    id: 'rel-spouse-1',
    person_a_id: 'person-1',
    person_b_id: 'person-spouse',
    relationship_type: 'SPOUSE',
    verification_status: 'UNVERIFIED',
    notes: 'Married in 2005',
    created_by: 'creator-1',
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

describe('EditRelationshipModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(relationshipMutationsHook, 'useUpdateRelationship').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <EditRelationshipModal item={MOCK_ITEM} isOpen={false} onClose={vi.fn()} />
    )
    expect(html).toBe('')
  })

  it('renders null when item is null', () => {
    const html = renderToStaticMarkup(
      <EditRelationshipModal item={null} isOpen={true} onClose={vi.fn()} />
    )
    expect(html).toBe('')
  })

  it('renders modal with read-only context and pre-filled notes', () => {
    const html = renderToStaticMarkup(
      <EditRelationshipModal item={MOCK_ITEM} isOpen={true} onClose={vi.fn()} />
    )

    expect(html).toContain('Edit Relationship Notes')
    expect(html).toContain('Spouse with')
    expect(html).toContain('Kavita Shah')
    expect(html).toContain('endpoints and types are immutable')
    expect(html).toContain('Married in 2005')
    expect(html).toContain('Save changes')
    expect(html).toContain('Cancel')
  })
})
