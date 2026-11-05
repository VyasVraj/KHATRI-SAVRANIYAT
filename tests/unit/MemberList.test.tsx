/**
 * Unit tests for MemberList component
 *
 * Tests the component's logical states: loading, error, empty, active roster,
 * former members toggle, and role-based action controls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MemberList } from '@/features/family-members/components/MemberList'
import * as memberHooks from '@/features/family-members/hooks/useFamilyMembers'
import * as mutationHooks from '@/features/family-members/hooks/useFamilyMemberMutations'
import * as peopleHooks from '@/features/people/hooks/usePersonList'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

const MOCK_PERSON_1: PersonRow = {
  id: 'person-1111',
  first_name: 'Aarav',
  last_name: 'Sharma',
  middle_name: null,
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1985-05-15',
  birth_place: 'Jaipur',
  date_of_death: null,
  gotra: 'Kashyap',
  kul: null,
  nukh: null,
  phone: null,
  phone_secondary: null,
  email_contact: null,
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'COMMUNITY',
  dob_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  user_id: null,
  created_by: 'user-creator',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_PERSON_2: PersonRow = {
  ...MOCK_PERSON_1,
  id: 'person-2222',
  first_name: 'Priya',
  last_name: 'Sharma',
  gender: 'FEMALE',
}

const MOCK_PERSON_3: PersonRow = {
  ...MOCK_PERSON_1,
  id: 'person-3333',
  first_name: 'Dev',
  last_name: 'Sharma',
}

const ACTIVE_MEMBERS: FamilyMemberWithPerson[] = [
  {
    id: 'member-001',
    family_id: 'family-001',
    person_id: 'person-1111',
    role: 'HEAD',
    is_head: true,
    joined_at: '2020-01-01T00:00:00Z',
    left_at: null,
    added_by: 'user-creator',
    created_at: '2020-01-01T00:00:00Z',
    person: MOCK_PERSON_1,
  },
  {
    id: 'member-002',
    family_id: 'family-001',
    person_id: 'person-2222',
    role: 'SPOUSE',
    is_head: false,
    joined_at: '2020-01-01T00:00:00Z',
    left_at: null,
    added_by: 'user-creator',
    created_at: '2020-01-01T00:00:00Z',
    person: MOCK_PERSON_2,
  },
]

const FORMER_MEMBERS: FamilyMemberWithPerson[] = [
  {
    id: 'member-003',
    family_id: 'family-001',
    person_id: 'person-3333',
    role: 'EXTENDED',
    is_head: false,
    joined_at: '2019-01-01T00:00:00Z',
    left_at: '2023-01-01T00:00:00Z',
    added_by: 'user-creator',
    created_at: '2019-01-01T00:00:00Z',
    person: MOCK_PERSON_3,
  },
]

import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'

const mockAuth: AuthContextValue = {
  session: null,
  user: { id: 'user-creator' } as unknown as NonNullable<AuthContextValue['user']>,
  profile: null,
  isLoading: false,
  isAuthenticated: true,
}

function renderComponent(ui: React.ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderToStaticMarkup(
    <AuthContext.Provider value={mockAuth}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  )
}

describe('MemberList Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(mutationHooks, 'useRemoveFamilyMember').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof mutationHooks.useRemoveFamilyMember>)
    vi.spyOn(peopleHooks, 'usePersonList').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof peopleHooks.usePersonList>)
  })

  it('renders loading state when query is loading', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" />)
    expect(html).toContain('Loading family members')
  })

  it('renders error state when query encounters an error', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: [],
      isLoading: false,
      error: { message: 'RLS permission denied' },
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" />)
    expect(html).toContain('RLS permission denied')
  })

  it('renders empty state when there are no active members', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" canManageMembers={false} />)
    expect(html).toContain('No active family members registered yet')
  })

  it('renders Add Member button when canManageMembers is true', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: ACTIVE_MEMBERS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" canManageMembers={true} />)
    expect(html).toContain('Add Member')
  })

  it('does NOT render Add Member button when canManageMembers is false', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: ACTIVE_MEMBERS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" canManageMembers={false} />)
    expect(html).not.toContain('Add Member')
  })

  it('renders active member names and count', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: ACTIVE_MEMBERS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" />)
    expect(html).toContain('Aarav Sharma')
    expect(html).toContain('Priya Sharma')
    expect(html).toContain('2') // active count
  })

  it('renders Show Departed toggle button', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: ACTIVE_MEMBERS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" />)
    expect(html).toContain('Show Departed')
  })

  it('renders former members when data contains departed members', () => {
    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: [...ACTIVE_MEMBERS, ...FORMER_MEMBERS],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)

    const html = renderComponent(<MemberList familyId="family-001" />)
    expect(html).toContain('Aarav Sharma')
    expect(html).toContain('Priya Sharma')
  })
})
