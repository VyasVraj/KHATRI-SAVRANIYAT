/**
 * Unit tests for RemoveRelationshipDialog component
 * (src/features/relationships/components/RemoveRelationshipDialog.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RemoveRelationshipDialog } from '@/features/relationships/components/RemoveRelationshipDialog'
import type { PersonRelationshipItem } from '@/features/relationships/types'
import * as relationshipMutationsHook from '@/features/relationships/hooks/useRelationshipMutations'

const MOCK_ITEM: PersonRelationshipItem = {
  role: 'sibling',
  relatedPerson: {
    id: 'person-sibling',
    first_name: 'Vikram',
    middle_name: null,
    last_name: 'Shah',
    gender: 'MALE',
    date_of_birth: '1985-07-20',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE' as const,
  },
  relationship: {
    id: 'rel-sibling-1',
    person_a_id: 'person-1',
    person_b_id: 'person-sibling',
    relationship_type: 'SIBLING',
    verification_status: 'UNVERIFIED',
    notes: null,
    created_by: 'creator-1',
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

describe('RemoveRelationshipDialog Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(relationshipMutationsHook, 'useSoftDeleteRelationship').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <RemoveRelationshipDialog item={MOCK_ITEM} isOpen={false} onClose={vi.fn()} />
    )
    expect(html).toBe('')
  })

  it('renders null when item is null', () => {
    const html = renderToStaticMarkup(
      <RemoveRelationshipDialog item={null} isOpen={true} onClose={vi.fn()} />
    )
    expect(html).toBe('')
  })

  it('renders confirmation dialog with relative name, role, and soft-delete note', () => {
    const html = renderToStaticMarkup(
      <RemoveRelationshipDialog item={MOCK_ITEM} isOpen={true} onClose={vi.fn()} />
    )

    expect(html).toContain('Remove Relationship')
    expect(html).toContain('Sibling')
    expect(html).toContain('Vikram Shah')
    expect(html).toContain('soft-delete the relationship')
    expect(html).toContain('Confirm remove')
    expect(html).toContain('Cancel')
  })
})
