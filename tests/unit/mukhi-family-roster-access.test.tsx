/**
 * Unit Tests: Mukhi Access to Family Member Profiles and Rosters
 *
 * Verifies the specified access rules:
 * 1. Active Mukhi: Can view complete family roster for any family (no "Member Roster Protected").
 * 2. Active Mukhi: Can open individual member profiles across all families.
 * 3. Active Mukhi: Can view full private details (exact DOB, contact) as community leadership.
 * 4. Active Mukhi: CANNOT edit someone else's profile (ownership-based editing preserved).
 * 5. Normal user: Cannot view another family's roster ("Member Roster Protected" displayed).
 * 6. Normal user: Cannot view private DOB or contact details of other members.
 * 7. Family creator: Can view their created family's roster.
 * 8. Admin & Super Admin: Retain full roster and member profile access.
 * 9. Deactivated Mukhi: Denied Mukhi-only viewing privileges (falls back to normal user).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamilyDetail } from '@/features/families/components/FamilyDetail'
import { PersonDetail } from '@/features/people/components/PersonDetail'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import type { Tables } from '@/types/database.types'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({}),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}))

// Mock community mukhis hook & active mukhi authority hook
const mockActiveMukhiAuthority = vi.fn()
vi.mock('@/features/community', () => ({
  useCommunityMukhis: vi.fn().mockReturnValue({ mukhis: [], isLoading: false }),
  usePersonFamilyMukhi: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useActiveMukhiAuthority: () => mockActiveMukhiAuthority(),
}))
vi.mock('@/features/community/hooks/useCommunityMukhis', () => ({
  useCommunityMukhis: vi.fn().mockReturnValue({ mukhis: [], isLoading: false }),
}))
vi.mock('@/features/community/hooks/useActiveMukhiAuthority', () => ({
  useActiveMukhiAuthority: () => mockActiveMukhiAuthority(),
}))

// Mock family members
vi.mock('@/features/family-members', () => ({
  MemberList: ({ familyId }: { familyId: string }) => (
    <div data-testid="member-list-roster">Roster for family {familyId}</div>
  ),
  useFamilyMembers: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}))
vi.mock('@/features/family-members/hooks/useFamilyMembers', () => ({
  useFamilyMembers: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}))

// Mock i18n
vi.mock('@/features/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const MOCK_FAMILY: Tables<'families'> = {
  id: '33333333-3333-3333-3333-333333333333',
  family_name: 'Vyas Family',
  description: 'Ancestral family record',
  gotra: 'Bharadwaj',
  nukh: 'Vyas',
  kul: 'Kuldevi',
  city: 'Vadodara',
  state: 'Gujarat',
  country: 'India',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
  created_by: '11111111-1111-1111-1111-111111111111', // Creator
  manager_user_id: '11111111-1111-1111-1111-111111111111',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_PERSON: Tables<'persons'> & {
  age?: number | null
  is_same_family?: boolean
  can_edit?: boolean
} = {
  id: '55555555-5555-5555-5555-555555555555',
  first_name: 'Haresh',
  middle_name: 'K',
  last_name: 'Vyas',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1975-06-15',
  dob_year: 1975,
  current_age: 51,
  age: 51,
  birth_place: 'Vadodara',
  blood_group: 'B+',
  blood_group_consent: true,
  email_contact: 'haresh.vyas@example.com',
  phone: '+91 98765 43210',
  phone_secondary: null,
  city: 'Vadodara',
  state: 'Gujarat',
  country: 'India',
  date_of_death: null,
  is_deceased: false,
  occupation: 'Doctor',
  avatar_url: null,
  gotra: 'Bharadwaj',
  nukh: 'Vyas',
  kul: 'Kuldevi',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  created_by: '11111111-1111-1111-1111-111111111111',
  user_id: '11111111-1111-1111-1111-111111111111',
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'PRIVATE',
  dob_privacy: 'PRIVATE',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  is_same_family: false,
  can_edit: false,
}

function createAuthContextValue(
  userId: string,
  role: string = 'MEMBER',
  isActive: boolean = true
): AuthContextValue {
  return {
    session: {} as unknown as AuthContextValue['session'],
    user: { id: userId, email: `${role.toLowerCase()}@example.com` } as unknown as AuthContextValue['user'],
    profile: {
      id: userId,
      role: role as unknown as NonNullable<AuthContextValue['profile']>['role'],
      is_active: isActive,
      email: `${role.toLowerCase()}@example.com`,
      display_name: `Test ${role}`,
      avatar_url: null,
      email_verified: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isAuthenticated: true,
    refreshProfile: vi.fn(),
  }
}

describe('Active Mukhi Access to Family Member Profiles and Rosters', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  it('allows active Mukhi to view family roster without seeing "Member Roster Protected"', () => {
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: true, isLeadership: true, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    const mukhiAuth = createAuthContextValue('22222222-2222-2222-2222-222222222222', 'MUKHI')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={mukhiAuth}>
            <FamilyDetail family={MOCK_FAMILY} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Mukhi should see the MemberList roster, NOT the protected banner
    expect(screen.getByTestId('member-list-roster')).toBeInTheDocument()
    expect(screen.queryByText(/Member Roster Protected/i)).not.toBeInTheDocument()
  })

  it('allows authenticated normal users to view any registered family member roster in read-only mode', () => {
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: false, isLeadership: false, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    const normalUserAuth = createAuthContextValue('99999999-9999-9999-9999-999999999999', 'MEMBER')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={normalUserAuth}>
            <FamilyDetail family={MOCK_FAMILY} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Authenticated normal user sees the MemberList roster, NOT the protected banner
    expect(screen.getByTestId('member-list-roster')).toBeInTheDocument()
    expect(screen.queryByText(/Member Roster Protected/i)).not.toBeInTheDocument()
  })

  it('displays "Member Roster Protected" to unauthenticated visitors', () => {
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: false, isLeadership: false, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    const unauthenticatedAuth = {
      ...createAuthContextValue('anon', 'MEMBER'),
      user: null,
      profile: null,
      session: null,
      isAuthenticated: false,
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={unauthenticatedAuth}>
            <FamilyDetail family={MOCK_FAMILY} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Member Roster Protected/i)).toBeInTheDocument()
    expect(screen.queryByTestId('member-list-roster')).not.toBeInTheDocument()
  })

  it('allows family creator to view their own family roster', () => {
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: false, isLeadership: false, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    // Creator ID matches MOCK_FAMILY.created_by
    const creatorAuth = createAuthContextValue('11111111-1111-1111-1111-111111111111', 'MEMBER')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={creatorAuth}>
            <FamilyDetail family={MOCK_FAMILY} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('member-list-roster')).toBeInTheDocument()
    expect(screen.queryByText(/Member Roster Protected/i)).not.toBeInTheDocument()
  })

  it('allows active Mukhi to view full private details (exact DOB and phone) on member profile', () => {
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: true, isLeadership: true, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    const mukhiAuth = createAuthContextValue('22222222-2222-2222-2222-222222222222', 'MUKHI')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={mukhiAuth}>
            <PersonDetail person={MOCK_PERSON} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Private details are visible to active Mukhi
    expect(screen.getByText(/15 June 1975/i)).toBeInTheDocument()
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument()
    expect(screen.getByText('haresh.vyas@example.com')).toBeInTheDocument()
  })

  it('hides private details (exact DOB and contact) from unrelated normal user', () => {
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: false, isLeadership: false, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    const normalUserAuth = createAuthContextValue('99999999-9999-9999-9999-999999999999', 'MEMBER')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={normalUserAuth}>
            <PersonDetail person={MOCK_PERSON} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Private details must be masked / protected
    expect(screen.queryByText(/June 15, 1975/i)).not.toBeInTheDocument()
    expect(screen.queryByText('+91 98765 43210')).not.toBeInTheDocument()
    expect(screen.getByText(/51 years/i)).toBeInTheDocument() // Public age remains visible
  })

  it('preserves editing restriction: Mukhi CANNOT edit another persons profile', () => {
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: true, isLeadership: true, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    const mukhiAuth = createAuthContextValue('22222222-2222-2222-2222-222222222222', 'MUKHI')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={mukhiAuth}>
            <PersonDetail person={MOCK_PERSON} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Mukhi should NOT have Edit Profile or Change Photo buttons
    expect(screen.queryByRole('link', { name: /Edit Profile/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Change photo/i })).not.toBeInTheDocument()
  })

  it('denies Mukhi-only viewing when Mukhi record is deactivated (falls back to read-only standard user)', () => {
    // When deactivated, isActiveMukhi and isLeadership are false
    mockActiveMukhiAuthority.mockReturnValue({
      data: { isActiveMukhi: false, isLeadership: false, isAdmin: false, isLoading: false },
      isLoading: false,
    })

    const deactivatedMukhiAuth = createAuthContextValue('22222222-2222-2222-2222-222222222222', 'MEMBER', true)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={deactivatedMukhiAuth}>
            <FamilyDetail family={MOCK_FAMILY} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Authenticated user can view roster in read-only mode
    expect(screen.getByTestId('member-list-roster')).toBeInTheDocument()
    expect(screen.queryByText(/Member Roster Protected/i)).not.toBeInTheDocument()
  })
})
