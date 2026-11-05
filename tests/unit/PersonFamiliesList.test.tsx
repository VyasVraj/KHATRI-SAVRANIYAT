/**
 * Unit tests for PersonFamiliesList component
 *
 * Tests the component's logical states: loading, error, empty, active family list,
 * former memberships, head indicator, and location display.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PersonFamiliesList } from '@/features/family-members/components/PersonFamiliesList'
import * as personFamiliesHook from '@/features/family-members/hooks/usePersonFamilies'
import type { FamilyMemberWithFamily } from '@/features/family-members/services/family-members.service'

const MOCK_PERSON_ID = 'person-2222'

const MOCK_ACTIVE_HEAD_MEMBERSHIP: FamilyMemberWithFamily = {
  id: 'member-001',
  family_id: 'family-1111',
  person_id: MOCK_PERSON_ID,
  role: 'HEAD',
  is_head: true,
  joined_at: '2020-01-01T00:00:00Z',
  left_at: null,
  added_by: 'user-0001',
  created_at: '2020-01-01T00:00:00Z',
  family: {
    id: 'family-1111',
    family_name: 'Sharma Parivar',
    city: 'Jaipur',
    state: 'Rajasthan',
    profile_privacy: 'COMMUNITY',
  },
}

const MOCK_ACTIVE_MEMBER_NO_LOCATION: FamilyMemberWithFamily = {
  id: 'member-002',
  family_id: 'family-3333',
  person_id: MOCK_PERSON_ID,
  role: 'SPOUSE',
  is_head: false,
  joined_at: '2021-03-15T00:00:00Z',
  left_at: null,
  added_by: 'user-0001',
  created_at: '2021-03-15T00:00:00Z',
  family: {
    id: 'family-3333',
    family_name: 'Gupta Household',
    city: null,
    state: null,
    profile_privacy: 'PUBLIC',
  },
}

const MOCK_FORMER_MEMBERSHIP: FamilyMemberWithFamily = {
  id: 'member-003',
  family_id: 'family-2222',
  person_id: MOCK_PERSON_ID,
  role: 'CHILD',
  is_head: false,
  joined_at: '2015-06-01T00:00:00Z',
  left_at: '2023-01-01T00:00:00Z',
  added_by: 'user-0001',
  created_at: '2015-06-01T00:00:00Z',
  family: {
    id: 'family-2222',
    family_name: 'Old Family Household',
    city: 'Udaipur',
    state: 'Rajasthan',
    profile_privacy: 'COMMUNITY',
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

describe('PersonFamiliesList Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state when query is loading', () => {
    vi.spyOn(personFamiliesHook, 'usePersonFamilies').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof personFamiliesHook.usePersonFamilies>)

    const html = renderComponent(<PersonFamiliesList personId={MOCK_PERSON_ID} />)

    expect(html).toContain('Loading family memberships')
    expect(html).toContain('Show former memberships')
  })

  it('renders error state when query encounters an error', () => {
    vi.spyOn(personFamiliesHook, 'usePersonFamilies').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Failed to fetch family records.' },
    } as unknown as ReturnType<typeof personFamiliesHook.usePersonFamilies>)

    const html = renderComponent(<PersonFamiliesList personId={MOCK_PERSON_ID} />)

    expect(html).toContain('Failed to fetch family records.')
    expect(html).toContain('role="alert"')
  })

  it('renders default error fallback message when error has no message', () => {
    vi.spyOn(personFamiliesHook, 'usePersonFamilies').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: {},
    } as unknown as ReturnType<typeof personFamiliesHook.usePersonFamilies>)

    const html = renderComponent(<PersonFamiliesList personId={MOCK_PERSON_ID} />)

    expect(html).toContain('Could not load family memberships.')
  })

  it('renders empty state when person has no family records', () => {
    vi.spyOn(personFamiliesHook, 'usePersonFamilies').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof personFamiliesHook.usePersonFamilies>)

    const html = renderComponent(<PersonFamiliesList personId={MOCK_PERSON_ID} />)

    expect(html).toContain('Not currently listed in any family records')
  })

  it('renders active family memberships with details', () => {
    vi.spyOn(personFamiliesHook, 'usePersonFamilies').mockReturnValue({
      data: [MOCK_ACTIVE_HEAD_MEMBERSHIP, MOCK_ACTIVE_MEMBER_NO_LOCATION],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof personFamiliesHook.usePersonFamilies>)

    const html = renderComponent(<PersonFamiliesList personId={MOCK_PERSON_ID} />)

    // Family 1: Head with location
    expect(html).toContain('Sharma Parivar')
    expect(html).toContain('/families/family-1111')
    expect(html).toContain('Head of Family')
    expect(html).toContain('Head') // Crown badge text
    expect(html).toContain('Jaipur, Rajasthan')
    expect(html).toContain('Joined')

    // Family 2: Member without location
    expect(html).toContain('Gupta Household')
    expect(html).toContain('/families/family-3333')
    expect(html).toContain('Spouse')
  })

  it('renders former membership badge and left date', () => {
    vi.spyOn(personFamiliesHook, 'usePersonFamilies').mockReturnValue({
      data: [MOCK_FORMER_MEMBERSHIP],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof personFamiliesHook.usePersonFamilies>)

    const html = renderComponent(<PersonFamiliesList personId={MOCK_PERSON_ID} />)

    expect(html).toContain('Old Family Household')
    expect(html).toContain('Child')
    expect(html).toContain('Former Member')
    expect(html).toContain('Left')
    // Head badge should NOT be displayed for departed member even if is_head was true
    expect(html).not.toContain('bg-amber-100')
  })

  it('renders fallback when family summary is null', () => {
    const membershipWithoutFamily: FamilyMemberWithFamily = {
      ...MOCK_ACTIVE_HEAD_MEMBERSHIP,
      family: null,
    }
    vi.spyOn(personFamiliesHook, 'usePersonFamilies').mockReturnValue({
      data: [membershipWithoutFamily],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof personFamiliesHook.usePersonFamilies>)

    const html = renderComponent(<PersonFamiliesList personId={MOCK_PERSON_ID} />)

    expect(html).toContain('Family record')
  })
})
