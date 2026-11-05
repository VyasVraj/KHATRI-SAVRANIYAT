/**
 * Unit tests for AddRelationshipModal component
 * (src/features/relationships/components/AddRelationshipModal.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddRelationshipModal } from '@/features/relationships/components/AddRelationshipModal'
import * as peopleHook from '@/features/people/hooks/usePersonList'
import * as relationshipMutationsHook from '@/features/relationships/hooks/useRelationshipMutations'

const TARGET_PERSON_ID = 'person-target-1'
const OTHER_PERSON_ID = 'person-other-2'
const THIRD_PERSON_ID = 'person-other-3'

const MOCK_PERSONS = [
  {
    id: TARGET_PERSON_ID,
    first_name: 'Target',
    last_name: 'Person',
    middle_name: null,
    maiden_name: null,
    gender: 'MALE' as const,
    date_of_birth: '1980-01-01',
    birth_place: null,
    date_of_death: null,
    gotra: null,
    kul: null,
    nukh: null,
    phone: null,
    phone_secondary: null,
    email_contact: null,
    profile_privacy: 'COMMUNITY' as const,
    contact_privacy: 'COMMUNITY' as const,
    dob_privacy: 'COMMUNITY' as const,
    status: 'ACTIVE' as const,
    verification_status: 'UNVERIFIED' as const,
    user_id: null,
    created_by: 'creator-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: OTHER_PERSON_ID,
    first_name: 'Suresh',
    last_name: 'Patel',
    middle_name: null,
    maiden_name: null,
    gender: 'MALE' as const,
    date_of_birth: '1955-01-01',
    birth_place: null,
    date_of_death: null,
    gotra: null,
    kul: null,
    nukh: null,
    phone: null,
    phone_secondary: null,
    email_contact: null,
    profile_privacy: 'COMMUNITY' as const,
    contact_privacy: 'COMMUNITY' as const,
    dob_privacy: 'COMMUNITY' as const,
    status: 'ACTIVE' as const,
    verification_status: 'UNVERIFIED' as const,
    user_id: null,
    created_by: 'creator-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: THIRD_PERSON_ID,
    first_name: 'Meena',
    last_name: 'Patel',
    middle_name: null,
    maiden_name: null,
    gender: 'FEMALE' as const,
    date_of_birth: '1958-01-01',
    birth_place: null,
    date_of_death: null,
    gotra: null,
    kul: null,
    nukh: null,
    phone: null,
    phone_secondary: null,
    email_contact: null,
    profile_privacy: 'COMMUNITY' as const,
    contact_privacy: 'COMMUNITY' as const,
    dob_privacy: 'COMMUNITY' as const,
    status: 'ACTIVE' as const,
    verification_status: 'UNVERIFIED' as const,
    user_id: null,
    created_by: 'creator-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
]

describe('AddRelationshipModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(relationshipMutationsHook, 'useAddRelationship').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders null when isOpen is false', () => {
    vi.spyOn(peopleHook, 'usePersonList').mockReturnValue({
      data: MOCK_PERSONS,
      isLoading: false,
    } as never)

    const html = renderToStaticMarkup(
      <AddRelationshipModal targetPersonId={TARGET_PERSON_ID} isOpen={false} onClose={vi.fn()} />
    )

    expect(html).toBe('')
  })

  it('renders dialog with role options and excludes target person from selector', () => {
    vi.spyOn(peopleHook, 'usePersonList').mockReturnValue({
      data: MOCK_PERSONS,
      isLoading: false,
    } as never)

    const html = renderToStaticMarkup(
      <AddRelationshipModal targetPersonId={TARGET_PERSON_ID} isOpen={true} onClose={vi.fn()} />
    )

    expect(html).toContain('Add Relationship')
    expect(html).toContain('Parent')
    expect(html).toContain('Child')
    expect(html).toContain('Spouse')
    expect(html).toContain('Sibling')

    // Excludes target person from options
    expect(html).not.toContain('value="person-target-1"')
    expect(html).toContain('value="person-other-2"')
    expect(html).toContain('Suresh Patel')
    expect(html).toContain('value="person-other-3"')
    expect(html).toContain('Meena Patel')
  })

  it('renders loading notice while person list is loading', () => {
    vi.spyOn(peopleHook, 'usePersonList').mockReturnValue({
      data: [],
      isLoading: true,
    } as never)

    const html = renderToStaticMarkup(
      <AddRelationshipModal targetPersonId={TARGET_PERSON_ID} isOpen={true} onClose={vi.fn()} />
    )

    expect(html).toContain('Loading census records…')
  })
})
