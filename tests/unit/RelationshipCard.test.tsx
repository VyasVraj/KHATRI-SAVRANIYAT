/**
 * Unit tests for RelationshipCard component
 * (src/features/relationships/components/RelationshipCard.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { RelationshipCard } from '@/features/relationships/components/RelationshipCard'
import type { PersonRelationshipItem } from '@/features/relationships/types'
import * as authContext from '@/features/auth/context/AuthContext'
import React from 'react'

const MOCK_CREATOR_ID = '00000000-0000-0000-0000-000000000001'
const MOCK_OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'

const MOCK_ITEM_PARENT: PersonRelationshipItem = {
  role: 'parent',
  relatedPerson: {
    id: 'person-parent',
    first_name: 'Ramesh',
    middle_name: null,
    last_name: 'Shah',
    gender: 'MALE',
    date_of_birth: '1950-01-01',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE' as const,
  },
  relationship: {
    id: 'rel-parent',
    person_a_id: 'person-parent',
    person_b_id: 'person-child',
    relationship_type: 'PARENT',
    verification_status: 'UNVERIFIED',
    notes: 'Father of child',
    created_by: MOCK_CREATOR_ID,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

const MOCK_ITEM_UNAVAILABLE: PersonRelationshipItem = {
  role: 'spouse',
  relatedPerson: null,
  relationship: {
    id: 'rel-spouse-hidden',
    person_a_id: 'person-1',
    person_b_id: 'person-2',
    relationship_type: 'SPOUSE',
    verification_status: 'UNVERIFIED',
    notes: null,
    created_by: MOCK_CREATOR_ID,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

function renderCard(element: React.ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>)
}

describe('RelationshipCard Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders related person name linked to person detail page', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_OTHER_USER_ID },
      profile: { role: 'MEMBER' },
      isAuthenticated: true,
    } as never)

    const html = renderCard(<RelationshipCard item={MOCK_ITEM_PARENT} />)

    expect(html).toContain('Ramesh Shah')
    expect(html).toContain('href="/people/person-parent"')
    expect(html).toContain('Parent')
    expect(html).toContain('(male)')
    expect(html).toContain('Father of child')
  })

  it('renders neutral Unavailable Record without broken link when relatedPerson is null', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_OTHER_USER_ID },
      profile: { role: 'MEMBER' },
      isAuthenticated: true,
    } as never)

    const html = renderCard(<RelationshipCard item={MOCK_ITEM_UNAVAILABLE} />)

    expect(html).toContain('Unavailable Record')
    expect(html).not.toContain('href="/people/')
    expect(html).toContain('Spouse')
  })

  it('renders action buttons when current user is creator', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_CREATOR_ID },
      profile: { role: 'MEMBER' },
      isAuthenticated: true,
    } as never)

    const onEdit = vi.fn()
    const onRemove = vi.fn()

    const html = renderCard(
      <RelationshipCard item={MOCK_ITEM_PARENT} onEdit={onEdit} onRemove={onRemove} />
    )

    expect(html).toContain('Edit')
    expect(html).toContain('Remove')
  })

  it('renders action buttons when current user is a moderator', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_OTHER_USER_ID },
      profile: { role: 'COMMUNITY_MODERATOR' },
      isAuthenticated: true,
    } as never)

    const onEdit = vi.fn()
    const onRemove = vi.fn()

    const html = renderCard(
      <RelationshipCard item={MOCK_ITEM_PARENT} onEdit={onEdit} onRemove={onRemove} />
    )

    expect(html).toContain('Edit')
    expect(html).toContain('Remove')
  })

  it('hides action buttons when user is neither creator nor moderator', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_OTHER_USER_ID },
      profile: { role: 'MEMBER' },
      isAuthenticated: true,
    } as never)

    const onEdit = vi.fn()
    const onRemove = vi.fn()

    const html = renderCard(
      <RelationshipCard item={MOCK_ITEM_PARENT} onEdit={onEdit} onRemove={onRemove} />
    )

    expect(html).not.toContain('Edit')
    expect(html).not.toContain('Remove')
  })
})
