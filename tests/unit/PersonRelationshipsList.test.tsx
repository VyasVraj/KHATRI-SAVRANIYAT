/**
 * Unit tests for PersonRelationshipsList component
 * (src/features/relationships/components/PersonRelationshipsList.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersonRelationshipsList } from '@/features/relationships/components/PersonRelationshipsList'
import * as relationshipsHook from '@/features/relationships/hooks/usePersonRelationships'
import * as authContext from '@/features/auth/context/AuthContext'
import type { PersonRelationshipsSummary, PersonRelationshipItem } from '@/features/relationships/types'
import React from 'react'

const PERSON_ID = 'person-target-1'
const MOCK_USER_ID = 'user-0001'

const PARENT_ITEM: PersonRelationshipItem = {
  role: 'parent',
  relatedPerson: {
    id: 'person-parent',
    first_name: 'Dinesh',
    middle_name: null,
    last_name: 'Shah',
    gender: 'MALE',
    date_of_birth: '1952-01-01',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE' as const,
  },
  relationship: {
    id: 'rel-parent',
    person_a_id: 'person-parent',
    person_b_id: PERSON_ID,
    relationship_type: 'PARENT',
    verification_status: 'UNVERIFIED',
    notes: null,
    created_by: MOCK_USER_ID,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

const CHILD_ITEM: PersonRelationshipItem = {
  role: 'child',
  relatedPerson: {
    id: 'person-child',
    first_name: 'Aarav',
    middle_name: null,
    last_name: 'Shah',
    gender: 'MALE',
    date_of_birth: '2010-01-01',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE' as const,
  },
  relationship: {
    id: 'rel-child',
    person_a_id: PERSON_ID,
    person_b_id: 'person-child',
    relationship_type: 'PARENT',
    verification_status: 'UNVERIFIED',
    notes: null,
    created_by: MOCK_USER_ID,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

const SPOUSE_ITEM: PersonRelationshipItem = {
  role: 'spouse',
  relatedPerson: {
    id: 'person-spouse',
    first_name: 'Meena',
    middle_name: null,
    last_name: 'Shah',
    gender: 'FEMALE',
    date_of_birth: '1982-01-01',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE' as const,
  },
  relationship: {
    id: 'rel-spouse',
    person_a_id: PERSON_ID,
    person_b_id: 'person-spouse',
    relationship_type: 'SPOUSE',
    verification_status: 'UNVERIFIED',
    notes: 'Married 2008',
    created_by: MOCK_USER_ID,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

const SIBLING_ITEM: PersonRelationshipItem = {
  role: 'sibling',
  relatedPerson: {
    id: 'person-sibling',
    first_name: 'Rajesh',
    middle_name: null,
    last_name: 'Shah',
    gender: 'MALE',
    date_of_birth: '1984-01-01',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE' as const,
  },
  relationship: {
    id: 'rel-sibling',
    person_a_id: PERSON_ID,
    person_b_id: 'person-sibling',
    relationship_type: 'SIBLING',
    verification_status: 'UNVERIFIED',
    notes: null,
    created_by: MOCK_USER_ID,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  },
}

function renderComponent(ui: React.ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PersonRelationshipsList Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Gate 1 Privacy / Unauthenticated Access', () => {
    it('renders null when user is unauthenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        isAuthenticated: false,
        user: null,
        profile: null,
      } as never)

      vi.spyOn(relationshipsHook, 'usePersonRelationships').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      } as never)

      const html = renderComponent(<PersonRelationshipsList personId={PERSON_ID} />)

      // Must be completely null (empty string), zero elements rendered
      expect(html).toBe('')
    })
  })

  describe('Authenticated States', () => {
    beforeEach(() => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        isAuthenticated: true,
        user: { id: MOCK_USER_ID },
        profile: { role: 'MEMBER' },
      } as never)
    })

    it('renders loading state', () => {
      vi.spyOn(relationshipsHook, 'usePersonRelationships').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as never)

      const html = renderComponent(<PersonRelationshipsList personId={PERSON_ID} />)

      expect(html).toContain('Interpersonal Relationships')
      expect(html).toContain('Loading relationships…')
    })

    it('renders error state with alert role', () => {
      vi.spyOn(relationshipsHook, 'usePersonRelationships').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Could not load relationships.' },
      } as never)

      const html = renderComponent(<PersonRelationshipsList personId={PERSON_ID} />)

      expect(html).toContain('role="alert"')
      expect(html).toContain('Could not load relationships.')
    })

    it('renders empty state when there are no relationships', () => {
      const emptySummary: PersonRelationshipsSummary = {
        personId: PERSON_ID,
        parents: [],
        children: [],
        spouses: [],
        siblings: [],
        all: [],
      }

      vi.spyOn(relationshipsHook, 'usePersonRelationships').mockReturnValue({
        data: emptySummary,
        isLoading: false,
        error: null,
      } as never)

      const html = renderComponent(<PersonRelationshipsList personId={PERSON_ID} />)

      expect(html).toContain('No interpersonal relationships recorded yet.')
      expect(html).toContain('Add relationship')
    })

    it('renders categorized relationships with section counts and cards', () => {
      const summary: PersonRelationshipsSummary = {
        personId: PERSON_ID,
        parents: [PARENT_ITEM],
        children: [CHILD_ITEM],
        spouses: [SPOUSE_ITEM],
        siblings: [SIBLING_ITEM],
        all: [PARENT_ITEM, CHILD_ITEM, SPOUSE_ITEM, SIBLING_ITEM],
      }

      vi.spyOn(relationshipsHook, 'usePersonRelationships').mockReturnValue({
        data: summary,
        isLoading: false,
        error: null,
      } as never)

      const html = renderComponent(<PersonRelationshipsList personId={PERSON_ID} />)

      // Section headings with counts
      expect(html).toContain('Parents (1)')
      expect(html).toContain('Children (1)')
      expect(html).toContain('Spouses (1)')
      expect(html).toContain('Siblings (1)')

      // Person names
      expect(html).toContain('Dinesh Shah')
      expect(html).toContain('Aarav Shah')
      expect(html).toContain('Meena Shah')
      expect(html).toContain('Rajesh Shah')

      // Notes
      expect(html).toContain('Married 2008')
    })
  })
})
