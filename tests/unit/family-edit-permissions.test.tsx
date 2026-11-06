/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit & Integration Tests: Family-Based Edit Permissions & Member Profile Redirection
 *
 * Verifies:
 * 1. MemberList clicking 'Edit' redirects directly to /people/:personId/edit with returnUrl state.
 * 2. FamilyDetailPage grants edit access to registered family members and blocks unrelated Mukhi/users.
 * 3. FamilyEditPage grants edit access to family members and blocks unauthorized users.
 * 4. PersonEditPage navigates back to family record on save and cancel, and blocks unauthorized users.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemberList } from '@/features/family-members/components/MemberList'
import { FamilyDetailPage } from '@/features/families/pages/FamilyDetailPage'
import { FamilyEditPage } from '@/features/families/pages/FamilyEditPage'
import { PersonEditPage } from '@/features/people/pages/PersonEditPage'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import * as familyMemberHooks from '@/features/family-members/hooks/useFamilyMembers'
import * as familyHooks from '@/features/families/hooks/useFamily'
import * as personHooks from '@/features/people/hooks/usePerson'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'
import type { Tables } from '@/types/database.types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

type PersonRow = Tables<'persons'>
type FamilyRow = Tables<'families'>

const MOCK_PERSON_HEAD: PersonRow = {
  id: 'person-head-1',
  first_name: 'Jayesh',
  last_name: 'Vyas',
  middle_name: null,
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1970-01-01',
  birth_place: 'Nadiad',
  date_of_death: null,
  gotra: 'Agastya',
  kul: null,
  nukh: 'Arora (Aroda)',
  phone: '9876543210',
  phone_secondary: null,
  email_contact: 'jayesh@example.com',
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'COMMUNITY',
  dob_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  user_id: 'user-jayesh',
  created_by: 'user-jayesh',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_PERSON_MEMBER: PersonRow = {
  id: 'person-vraj-2',
  first_name: 'Vraj',
  last_name: 'Vyas',
  middle_name: null,
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '2005-11-18',
  birth_place: 'Nadiad',
  date_of_death: null,
  gotra: 'Agastya',
  kul: null,
  nukh: 'Arora (Aroda)',
  phone: '9876543211',
  phone_secondary: null,
  email_contact: 'vraj@example.com',
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'COMMUNITY',
  dob_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  user_id: 'user-vraj',
  created_by: 'user-jayesh',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_FAMILY: FamilyRow = {
  id: 'family-vyas-100',
  family_name: 'Vyas Family',
  description: 'Historic family',
  city: 'Nadiad',
  state: 'Gujarat',
  country: 'India',
  gotra: 'Agastya',
  kul: null,
  nukh: 'Arora (Aroda)',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  manager_user_id: null,
  created_by: 'user-jayesh',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_ACTIVE_MEMBERS: FamilyMemberWithPerson[] = [
  {
    id: 'fm-1',
    family_id: 'family-vyas-100',
    person_id: 'person-head-1',
    role: 'HEAD',
    is_head: true,
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
    added_by: 'user-jayesh',
    created_at: '2026-01-01T00:00:00Z',
    person: MOCK_PERSON_HEAD,
  },
  {
    id: 'fm-2',
    family_id: 'family-vyas-100',
    person_id: 'person-vraj-2',
    role: 'CHILD',
    is_head: false,
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
    added_by: 'user-jayesh',
    created_at: '2026-01-01T00:00:00Z',
    person: MOCK_PERSON_MEMBER,
  },
]

function renderWithProviders(
  ui: React.ReactElement,
  authContextValue: Partial<AuthContextValue> = {},
  initialRoute = '/'
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const mergedAuth: AuthContextValue = {
    session: null,
    user: { id: 'user-vraj' } as unknown as NonNullable<AuthContextValue['user']>,
    profile: {
      id: 'profile-vraj',
      role: 'MEMBER',
      is_active: true,
      email: 'vraj@example.com',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    } as any,
    isLoading: false,
    isAuthenticated: true,
    ...authContextValue,
  }

  return render(
    <AuthContext.Provider value={mergedAuth}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  )
}

describe('Family-Based Edit Permissions & Member Profile Redirection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. MemberList: Edit button redirection', () => {
    it('redirects directly to /people/:personId/edit with returnUrl state when clicking Edit', () => {
      vi.spyOn(familyMemberHooks, 'useFamilyMembers').mockReturnValue({
        data: MOCK_ACTIVE_MEMBERS,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyMemberHooks.useFamilyMembers>)

      renderWithProviders(
        <MemberList familyId="family-vyas-100" canManageMembers={true} />
      )

      // Find Edit buttons for members
      const editButtons = screen.getAllByRole('button', { name: /Edit/i })
      expect(editButtons.length).toBeGreaterThan(0)

      // Click Edit on the first member (Jayesh Vyas, person-head-1)
      fireEvent.click(editButtons[0])

      expect(mockNavigate).toHaveBeenCalledWith('/people/person-head-1/edit', {
        state: { returnUrl: '/families/family-vyas-100' },
      })
    })
  })

  describe('2. FamilyDetailPage: Edit family and management permissions', () => {
    it('grants edit permissions to an active registered family member (user-vraj)', () => {
      vi.spyOn(familyHooks, 'useFamily').mockReturnValue({
        data: MOCK_FAMILY,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyHooks.useFamily>)

      vi.spyOn(familyMemberHooks, 'useFamilyMembers').mockReturnValue({
        data: MOCK_ACTIVE_MEMBERS,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyMemberHooks.useFamilyMembers>)

      // user-vraj is an active family member in MOCK_ACTIVE_MEMBERS
      renderWithProviders(<FamilyDetailPage />, {
        user: { id: 'user-vraj' } as unknown as NonNullable<AuthContextValue['user']>,
        profile: { id: 'p1', role: 'MEMBER', is_active: true } as any,
      })

      // Edit and Delete buttons should be present when user is authorized family member
      const editButtons = screen.getAllByRole('button', { name: /^Edit$/i })
      expect(editButtons.length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /^Delete$/i })).toBeDefined()
    })

    it('blocks edit access for unrelated Mukhi (COMMUNITY_MODERATOR) not belonging to the family', () => {
      vi.spyOn(familyHooks, 'useFamily').mockReturnValue({
        data: MOCK_FAMILY,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyHooks.useFamily>)

      vi.spyOn(familyMemberHooks, 'useFamilyMembers').mockReturnValue({
        data: MOCK_ACTIVE_MEMBERS,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyMemberHooks.useFamilyMembers>)

      // Unrelated Mukhi user
      renderWithProviders(<FamilyDetailPage />, {
        user: { id: 'user-mukhi-unrelated' } as unknown as NonNullable<AuthContextValue['user']>,
        profile: { id: 'p2', role: 'COMMUNITY_MODERATOR', is_active: true } as any,
      })

      // Edit and Delete buttons must NOT be present when unauthorized
      expect(screen.queryAllByRole('button', { name: /^Edit$/i }).length).toBe(0)
      expect(screen.queryByRole('button', { name: /^Delete$/i })).toBeNull()
    })
  })

  describe('3. FamilyEditPage: Permission enforcement', () => {
    it('allows active family member to view and edit family form', () => {
      vi.spyOn(familyHooks, 'useFamily').mockReturnValue({
        data: MOCK_FAMILY,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyHooks.useFamily>)

      vi.spyOn(familyMemberHooks, 'useFamilyMembers').mockReturnValue({
        data: MOCK_ACTIVE_MEMBERS,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyMemberHooks.useFamilyMembers>)

      renderWithProviders(<FamilyEditPage />, {
        user: { id: 'user-vraj' } as unknown as NonNullable<AuthContextValue['user']>,
        profile: { id: 'p1', role: 'MEMBER', is_active: true } as any,
      })

      expect(screen.getByText(/Edit family/i)).toBeDefined()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('displays unauthorized notice when an unrelated user tries to access FamilyEditPage', () => {
      vi.spyOn(familyHooks, 'useFamily').mockReturnValue({
        data: MOCK_FAMILY,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyHooks.useFamily>)

      vi.spyOn(familyMemberHooks, 'useFamilyMembers').mockReturnValue({
        data: MOCK_ACTIVE_MEMBERS,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof familyMemberHooks.useFamilyMembers>)

      renderWithProviders(<FamilyEditPage />, {
        user: { id: 'user-stranger' } as unknown as NonNullable<AuthContextValue['user']>,
        profile: { id: 'p3', role: 'MEMBER', is_active: true } as any,
      })

      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Unauthorized: You do not have permission to edit this family record')
    })
  })

  describe('4. PersonEditPage: Navigation and ReturnUrl handling', () => {
    it('navigates back to family record on "Back to family record" click when returnUrl is set', () => {
      vi.spyOn(personHooks, 'usePerson').mockReturnValue({
        data: { ...MOCK_PERSON_MEMBER, can_edit: true },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof personHooks.usePerson>)

      render(
        <AuthContext.Provider
          value={{
            session: null,
            user: { id: 'user-vraj' } as any,
            profile: null,
            isLoading: false,
            isAuthenticated: true,
          }}
        >
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter
              initialEntries={[
                {
                  pathname: '/people/person-vraj-2/edit',
                  state: { returnUrl: '/families/family-vyas-100' },
                },
              ]}
            >
              <Routes>
                <Route path="/people/:personId/edit" element={<PersonEditPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </AuthContext.Provider>
      )

      const backBtn = screen.getByRole('button', { name: /Back to family record/i })
      expect(backBtn).toBeDefined()
      fireEvent.click(backBtn)

      expect(mockNavigate).toHaveBeenCalledWith('/families/family-vyas-100')
    })

    it('blocks editing when can_edit is false', () => {
      vi.spyOn(personHooks, 'usePerson').mockReturnValue({
        data: { ...MOCK_PERSON_HEAD, can_edit: false },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof personHooks.usePerson>)

      render(
        <AuthContext.Provider
          value={{
            session: null,
            user: { id: 'user-stranger' } as any,
            profile: null,
            isLoading: false,
            isAuthenticated: true,
          }}
        >
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={['/people/person-head-1/edit']}>
              <Routes>
                <Route path="/people/:personId/edit" element={<PersonEditPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </AuthContext.Provider>
      )

      expect(screen.getByRole('alert').textContent).toContain('Unauthorized: You do not have permission to edit this person')
    })
  })
})
