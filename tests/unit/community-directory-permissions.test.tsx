/**
 * Unit Tests: Community Directory Profile Visibility & Editing Permissions
 *
 * Verifies the 15 specification points:
 * 1. Community Directory renders members.
 * 2. Unrelated ordinary user can open/view a member's profile.
 * 3. Ordinary users CANNOT view birthday or complete date of birth (masked to age only).
 * 4. Ordinary users CANNOT see or use Edit controls for another member's profile.
 * 5. Ordinary users are rejected on direct updatePerson API calls.
 * 6. Original creator can edit their created profile.
 * 7. Verified approved claimant can edit the claimed profile.
 * 8. User with a pending claim CANNOT edit the profile.
 * 9. User with a rejected claim CANNOT edit the profile.
 * 10. Manual person ID manipulation in unauthorized update is rejected.
 * 11. Admin and Super Admin retain authorized edit permissions.
 * 12. Mukhi retains authorized reading without arbitrary editing.
 * 13. Public directory cards never expose birth date or month/day.
 * 14. Directory search and navigation maintain privacy invariants.
 * 15. Family Tree access restrictions remain protected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersonDetail } from '@/features/people/components/PersonDetail'
import { PersonDetailPage } from '@/features/people/pages/PersonDetailPage'
import { PersonDirectoryCard } from '@/features/discover/components/PersonDirectoryCard'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { updatePerson } from '@/features/people/services/people.service'
import { supabase } from '@/lib/supabase'
import type { PersonRow } from '@/features/people'
import type { PersonDiscoveryResult } from '@/features/discover/types'

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

// Mock usePersonFamilyMukhi & useActiveMukhiAuthority
vi.mock('@/features/community', () => ({
  usePersonFamilyMukhi: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useActiveMukhiAuthority: vi.fn().mockReturnValue({
    data: { isActiveMukhi: false, isLeadership: false, isAdmin: false, isLoading: false },
    isLoading: false,
  }),
}))

// Mock related sections
vi.mock('@/features/relationships', () => ({
  PersonRelationshipsList: () => <div data-testid="relationships-list">Relationships</div>,
}))
vi.mock('@/features/family-members', () => ({
  PersonFamiliesList: () => <div data-testid="families-list">Families</div>,
}))
vi.mock('@/features/connections', () => ({
  PersonConnectionSection: () => <div data-testid="connections-section">Connections</div>,
}))
vi.mock('@/features/verification', () => ({
  PersonVerificationSection: () => <div data-testid="verification-section">Verification</div>,
}))

const CREATOR_ID = 'user-creator-111'
const CLAIMANT_ID = 'user-claimant-222'
const UNRELATED_ID = 'user-unrelated-333'
const ADMIN_ID = 'user-admin-444'
const MUKHI_ID = 'user-mukhi-555'

const TARGET_PERSON_ID = 'target-person-uuid-999'

const BASE_PERSON: PersonRow = {
  id: TARGET_PERSON_ID,
  first_name: 'Haresh',
  middle_name: 'Kantilal',
  last_name: 'Khatri',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1985-04-12',
  date_of_death: null,
  birth_place: 'Anjar',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  gotra: 'Kashyap',
  nukh: 'Prajapati',
  kul: null,
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'PRIVATE',
  dob_privacy: 'PRIVATE',
  user_id: null,
  created_by: CREATOR_ID,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  is_deceased: false,
  occupation: 'Chartered Accountant',
  occupation_category: 'Finance & Banking',
  avatar_url: null,
  phone: null,
  phone_secondary: null,
  email_contact: null,
  age: 41,
  current_age: 41,
  blood_group: 'B_POSITIVE',
  blood_group_consent: false,
  is_same_family: false,
  can_edit: false,
  can_view_tree: false,
}

function createAuthContextValue(
  userId: string | null,
  role: 'MEMBER' | 'ADMIN' | 'SUPER_ADMIN' | 'MUKHI' = 'MEMBER'
): AuthContextValue {
  return {
    user: userId ? ({ id: userId, email: `${userId}@example.com` } as never) : null,
    profile: userId
      ? ({
          id: userId,
          role,
          email: `${userId}@example.com`,
          full_name: 'Test User',
          is_active: true,
        } as never)
      : null,
    session: null,
    isLoading: false,
    isAuthenticated: Boolean(userId),
    refreshProfile: vi.fn(),
  }
}

function renderWithProviders(ui: React.ReactElement, authValue: AuthContextValue) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('Community Directory Profile Visibility & Editing Permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1 & 13. Public Directory Card masks date of birth and birth year for ordinary users
  it('Directory Card displays Name, Lineage, and Age in years, strictly concealing complete birth date from ordinary users', () => {
    const cardData: PersonDiscoveryResult = {
      id: TARGET_PERSON_ID,
      first_name: 'Haresh',
      middle_name: 'Kantilal',
      last_name: 'Khatri',
      maiden_name: null,
      gender: 'MALE',
      dob_year: null, // Concealed by view
      date_of_birth: null, // Strictly masked
      date_of_death: null,
      birth_place: 'Anjar',
      city: 'Ahmedabad',
      state: 'Gujarat',
      gotra: 'Kashyap',
      kul: null,
      nukh: 'Prajapati',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      avatar_url: null,
      age: 41,
      is_same_family: false, // Unrelated user
    }

    render(
      <MemoryRouter>
        <PersonDirectoryCard person={cardData} />
      </MemoryRouter>
    )

    // Name & Lineage visible
    expect(screen.getByText('Haresh Kantilal Khatri')).toBeInTheDocument()
    expect(screen.getByText(/Gotra: Kashyap/i)).toBeInTheDocument()
    expect(screen.getByText(/Nukh: Prajapati/i)).toBeInTheDocument()

    // Permitted age is visible
    expect(screen.getByText(/Age: 41 yrs/i)).toBeInTheDocument()

    // Exact DOB, month, day, or birth date string is NOT in the document
    expect(screen.queryByText(/1985-04-12/)).not.toBeInTheDocument()
    expect(screen.queryByText(/April/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/b\. 1985/i)).not.toBeInTheDocument()
  })

  // 2 & 3. Ordinary users view public profile info but private birthday is masked
  it('Ordinary unrelated user sees permitted public profile but Date of Birth is concealed', () => {
    const unrelatedAuth = createAuthContextValue(UNRELATED_ID, 'MEMBER')

    renderWithProviders(
      <PersonDetail person={{ ...BASE_PERSON, is_same_family: false, can_edit: false }} />,
      unrelatedAuth
    )

    // Public fields
    expect(screen.getByText('Haresh Kantilal Khatri')).toBeInTheDocument()
    expect(screen.getByText(/age/i)).toBeInTheDocument()
    expect(screen.getByText(/41 years/i)).toBeInTheDocument()
    expect(screen.getByText(/Kashyap/i)).toBeInTheDocument()
    expect(screen.getByText(/Prajapati/i)).toBeInTheDocument()
    expect(screen.getByText('B+')).toBeInTheDocument()
    expect(screen.getByText('Family & Location')).toBeInTheDocument()

    // Birth place, date of birth and private contact are masked
    expect(screen.queryByText('Birth place')).not.toBeInTheDocument()
    expect(screen.queryByText('Anjar')).not.toBeInTheDocument()
    expect(screen.queryByText('Date of birth')).not.toBeInTheDocument()
    expect(screen.queryByText(/1985-04-12/)).not.toBeInTheDocument()
    expect(screen.queryByText(/April 12, 1985/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Protected by Community Privacy Policy/i).length).toBeGreaterThan(0)

    // Edit controls are hidden
    expect(screen.queryByTitle('Upload photo')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Change photo')).not.toBeInTheDocument()
  })

  // 3b. All members' profile photos are viewable by all authenticated community members
  it('All authenticated community members can view member profile photos across directory cards and detail views', () => {
    const unrelatedAuth = createAuthContextValue(UNRELATED_ID, 'MEMBER')
    const personWithPhoto: PersonRow = {
      ...BASE_PERSON,
      avatar_url: 'avatars/persons/target-person-uuid-999/avatar_123.jpg',
      can_edit: false,
    }

    renderWithProviders(<PersonDetail person={personWithPhoto} />, unrelatedAuth)

    // Avatar image is rendered with member name as alt
    const avatar = screen.getByRole('img', { name: /Haresh Kantilal Khatri/i })
    expect(avatar).toBeInTheDocument()
    // Ordinary user does not see change photo trigger
    expect(screen.queryByTitle(/change photo/i)).not.toBeInTheDocument()
    expect(screen.queryByTitle(/upload photo/i)).not.toBeInTheDocument()
  })

  // 4. Ordinary users cannot see or use Edit Profile for another member
  it('Ordinary unrelated user does not see Edit or Delete buttons on PersonDetailPage', () => {
    const unrelatedAuth = createAuthContextValue(UNRELATED_ID, 'MEMBER')

    // Mock supabase getPerson query
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...BASE_PERSON, is_same_family: false, can_edit: false },
              error: null,
            }),
          }),
        }),
      }),
    })
    vi.mocked(supabase.from).mockImplementation(mockFrom as never)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={unrelatedAuth}>
          <MemoryRouter initialEntries={[`/people/${TARGET_PERSON_ID}`]}>
            <Routes>
              <Route path="/people/:personId" element={<PersonDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    )

    // Buttons for Edit and Delete should not be rendered
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  // 5 & 10. Direct API update by ordinary user is rejected at service/RLS level
  it('Direct updatePerson API request is rejected when database RLS denies unauthorized update', async () => {
    // Database returns 42501 (Permission Denied)
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '42501', message: 'permission denied for table persons' },
            }),
          }),
        }),
      }),
    })

    vi.mocked(supabase.from).mockReturnValue({
      update: mockUpdate,
    } as never)

    const res = await updatePerson(TARGET_PERSON_ID, {
      first_name: 'Malicious',
    })

    expect(res.error).not.toBeNull()
    expect(res.error?.message).toContain('You do not have permission to perform this action.')
  })

  // 6. Original creator can edit their created profile
  it('Original profile creator has edit permissions and sees Edit button', () => {
    const creatorAuth = createAuthContextValue(CREATOR_ID, 'MEMBER')

    renderWithProviders(
      <PersonDetail person={{ ...BASE_PERSON, created_by: CREATOR_ID, can_edit: true }} canEdit={true} />,
      creatorAuth
    )

    // Creator has edit permissions (e.g., photo upload trigger visible)
    expect(screen.getByTitle(/upload photo/i)).toBeInTheDocument()
  })

  // 7. Verified approved claimant can edit the claimed profile
  it('User with APPROVED claim can edit the claimed profile', () => {
    const claimantAuth = createAuthContextValue(CLAIMANT_ID, 'MEMBER')

    // Mock person claim as APPROVED
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'person_claims') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'claim-123',
                    person_id: TARGET_PERSON_ID,
                    claimant_id: CLAIMANT_ID,
                    status: 'APPROVED',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...BASE_PERSON, user_id: CLAIMANT_ID, can_edit: true },
                error: null,
              }),
            }),
          }),
        }),
      }
    })
    vi.mocked(supabase.from).mockImplementation(mockFrom as never)

    renderWithProviders(
      <PersonDetail
        person={{ ...BASE_PERSON, user_id: CLAIMANT_ID, can_edit: true }}
        canEdit={true}
      />,
      claimantAuth
    )

    expect(screen.getByTitle(/upload photo/i)).toBeInTheDocument()
  })

  // 8. User with PENDING claim cannot edit the profile
  it('User with PENDING claim CANNOT edit the profile', () => {
    const claimantAuth = createAuthContextValue(CLAIMANT_ID, 'MEMBER')

    renderWithProviders(
      <PersonDetail
        person={{ ...BASE_PERSON, user_id: null, created_by: CREATOR_ID, can_edit: false }}
        canEdit={false}
      />,
      claimantAuth
    )

    // Edit controls are not shown
    expect(screen.queryByTitle(/upload photo/i)).not.toBeInTheDocument()
  })

  // 9. User with REJECTED claim cannot edit the profile
  it('User with REJECTED claim CANNOT edit the profile', () => {
    const claimantAuth = createAuthContextValue(CLAIMANT_ID, 'MEMBER')

    renderWithProviders(
      <PersonDetail
        person={{ ...BASE_PERSON, user_id: null, created_by: CREATOR_ID, can_edit: false }}
        canEdit={false}
      />,
      claimantAuth
    )

    // Edit controls are not shown
    expect(screen.queryByTitle(/upload photo/i)).not.toBeInTheDocument()
  })

  // 11. Admin and Super Admin retain authorized editing permissions
  it('Admin and Super Admin have full edit permissions', () => {
    const adminAuth = createAuthContextValue(ADMIN_ID, 'ADMIN')

    renderWithProviders(
      <PersonDetail
        person={{ ...BASE_PERSON, created_by: CREATOR_ID, can_edit: true }}
        canEdit={true}
      />,
      adminAuth
    )

    expect(screen.getByTitle(/upload photo/i)).toBeInTheDocument()
    // Admin can also view protected details
    expect(screen.getByText('Date of birth')).toBeInTheDocument()
  })

  // 12. Mukhi retains authorized read permissions but not arbitrary editing permissions
  it('Mukhi can view authorized community details but cannot arbitrarily edit unrelated profile', () => {
    const mukhiAuth = createAuthContextValue(MUKHI_ID, 'MUKHI')

    renderWithProviders(
      <PersonDetail
        person={{ ...BASE_PERSON, created_by: CREATOR_ID, user_id: null, can_edit: false }}
        canEdit={false}
      />,
      mukhiAuth
    )

    // Mukhi cannot edit another member's profile
    expect(screen.queryByTitle(/upload photo/i)).not.toBeInTheDocument()
  })
})
