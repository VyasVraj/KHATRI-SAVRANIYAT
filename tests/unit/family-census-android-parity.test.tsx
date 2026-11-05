/**
 * Unit Tests: ANDROID-5 Family Census Android Flows & Parity
 *
 * Validates:
 * - FamilyListPage Family Census header, stats, search filter & registration trigger
 * - FamilyDetail Ghar Mukhi highlight card (when head present vs absent)
 * - FamilyDetail census completeness metrics & tree view link
 * - FamilyDetail ANDROID-2 privacy lock (hidden for regular users, shown for privacy managers)
 * - MemberCard Ghar Mukhi badge & relationship link
 * - AddMemberModal person search filter & canonical roles
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Tables } from '@/types/database.types'
import { FamilyListPage } from '@/features/families/pages/FamilyListPage'
import { FamilyDetail } from '@/features/families/components/FamilyDetail'
import { MemberCard } from '@/features/family-members/components/MemberCard'
import { AddMemberModal } from '@/features/family-members/components/AddMemberModal'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { AuthContextValue } from '@/features/auth/context/AuthContext'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'
import * as useFamilyListHook from '@/features/families/hooks/useFamilyList'
import * as useFamilyMembersHook from '@/features/family-members/hooks/useFamilyMembers'
import * as usePersonListHook from '@/features/people/hooks/usePersonList'

vi.mock('@/features/families/hooks/useFamilyList')
vi.mock('@/features/family-members/hooks/useFamilyMembers')
vi.mock('@/features/people/hooks/usePersonList')
vi.mock('@/features/family-members/hooks/useFamilyMemberMutations', () => ({
  useAddFamilyMember: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateFamilyMember: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRemoveFamilyMember: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useTransferFamilyHead: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) =>
      React.createElement('a', { href: to, ...props }, children),
  }
})

const MOCK_FAMILY: Tables<'families'> = {
  id: 'fam-101',
  family_name: 'Vaswani Family',
  description: 'Ancestral roots from Shikarpur.',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  gotra: 'Kashyap',
  kul: 'Kuldevi Hinglaj',
  nukh: 'Vaswani',
  avatar_url: null,
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_HEAD_MEMBER: FamilyMemberWithPerson = {
  id: 'mem-1',
  family_id: 'fam-101',
  person_id: 'person-1',
  role: 'HEAD',
  is_head: true,
  joined_at: '2026-01-01T00:00:00Z',
  left_at: null,
  added_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  person: {
    id: 'person-1',
    first_name: 'Chandru',
    last_name: 'Vaswani',
    gender: 'MALE',
    date_of_birth: '1960-05-15',
    date_of_death: null,
    birth_place: 'Shikarpur',
    gotra: 'Kashyap',
    kul: 'Kuldevi Hinglaj',
    nukh: 'Vaswani',
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'COMMUNITY',
    dob_privacy: 'COMMUNITY',
    status: 'ACTIVE',
    verification_status: 'VERIFIED',
    avatar_url: null,
    middle_name: null,
    maiden_name: null,
    email_contact: null,
    phone: null,
    phone_secondary: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'user-1',
    user_id: null,
    deleted_at: null,
  },
}

const MOCK_SPOUSE_MEMBER: FamilyMemberWithPerson = {
  id: 'mem-2',
  family_id: 'fam-101',
  person_id: 'person-2',
  role: 'SPOUSE',
  is_head: false,
  joined_at: '2026-01-01T00:00:00Z',
  left_at: null,
  added_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  person: {
    id: 'person-2',
    first_name: 'Laxmi',
    last_name: 'Vaswani',
    gender: 'FEMALE',
    date_of_birth: '1965-08-20',
    date_of_death: null,
    birth_place: 'Karachi',
    gotra: 'Kashyap',
    kul: 'Kuldevi Hinglaj',
    nukh: 'Vaswani',
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'COMMUNITY',
    dob_privacy: 'COMMUNITY',
    status: 'ACTIVE',
    verification_status: 'VERIFIED',
    avatar_url: null,
    middle_name: null,
    maiden_name: null,
    email_contact: null,
    phone: null,
    phone_secondary: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'user-1',
    user_id: null,
    deleted_at: null,
  },
}

describe('ANDROID-5: Family Census Android Flows & Parity', () => {
  let queryClient: QueryClient

  function renderWithProviders(
    element: React.ReactElement,
    authValue?: Partial<AuthContextValue>
  ): string {
    const fullAuth: AuthContextValue = {
      user: { id: 'user-1' } as never,
      profile: {
        id: 'user-1',
        role: 'MEMBER',
        is_active: true,
        display_name: 'Test Member',
        email: 'test@example.com',
        avatar_url: null,
        email_verified: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      ...authValue,
    }

    return renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: fullAuth },
        React.createElement(QueryClientProvider, { client: queryClient }, element)
      )
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    vi.spyOn(useFamilyListHook, 'useFamilyList').mockReturnValue({
      data: [MOCK_FAMILY],
      isLoading: false,
      error: null,
    } as never)

    vi.spyOn(useFamilyMembersHook, 'useFamilyMembers').mockReturnValue({
      data: [MOCK_HEAD_MEMBER, MOCK_SPOUSE_MEMBER],
      isLoading: false,
      error: null,
    } as never)

    vi.spyOn(usePersonListHook, 'usePersonList').mockReturnValue({
      data: [MOCK_HEAD_MEMBER.person!, MOCK_SPOUSE_MEMBER.person!],
      isLoading: false,
    } as never)
  })

  describe('FamilyListPage (Screen 02 & 11 Parity)', () => {
    it('renders Family Census title, total families count, and registration button', () => {
      const html = renderWithProviders(React.createElement(FamilyListPage))

      expect(html).toContain('Family Census')
      expect(html).toContain('1 Total Families')
      expect(html).toContain('Register New Family')
      expect(html).toContain('Vaswani Family')
      expect(html).toContain('Ahmedabad')
    })

    it('renders search filter input with accessible placeholder', () => {
      const html = renderWithProviders(React.createElement(FamilyListPage))

      expect(html).toContain('placeholder="Search by family name, lineage or city..."')
      expect(html).toContain('aria-label="Filter families"')
    })

    it('renders empty census state when no family records exist', () => {
      vi.spyOn(useFamilyListHook, 'useFamilyList').mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as never)

      const html = renderWithProviders(React.createElement(FamilyListPage))

      expect(html).toContain('No family records yet')
      expect(html).toContain('Register New Family')
    })
  })

  describe('FamilyDetail (Screen 14 & 15 Parity)', () => {
    it('renders Head of Family Highlight Card when head is designated', () => {
      const html = renderWithProviders(
        React.createElement(FamilyDetail, {
          family: MOCK_FAMILY,
          canManageMembers: true,
        })
      )

      expect(html).toContain('Head of Family')
      expect(html).toContain('Chandru Vaswani')
      expect(html).toContain('Primary representative for this family census registry')
      expect(html).toContain('View Profile')
      expect(html).toContain('href="/people/person-1"')
    })

    it('renders alert when no Head of Family is designated', () => {
      vi.spyOn(useFamilyMembersHook, 'useFamilyMembers').mockReturnValue({
        data: [MOCK_SPOUSE_MEMBER], // No member with is_head = true
        isLoading: false,
        error: null,
      } as never)

      const html = renderWithProviders(
        React.createElement(FamilyDetail, {
          family: MOCK_FAMILY,
          canManageMembers: true,
        })
      )

      expect(html).toContain('No Head of Family Designated')
      expect(html).toContain('Assign a head from the membership roster below')
    })

    it('renders census metrics summary and tree view action link', () => {
      const html = renderWithProviders(
        React.createElement(FamilyDetail, {
          family: MOCK_FAMILY,
          canManageMembers: false,
        })
      )

      expect(html).toContain('Roster Members')
      expect(html).toContain('2 People')
      expect(html).toContain('Head of Family')
      expect(html).toContain('Designated')
      expect(html).toContain('Lineage Records')
      expect(html).toContain('Complete (2/2)')
      expect(html).toContain('View Family Tree')
      expect(html).toContain('href="/families/fam-101/tree"')
    })

    it('strictly hides privacy settings section from regular MEMBER role (ANDROID-2 lock)', () => {
      const html = renderWithProviders(
        React.createElement(FamilyDetail, {
          family: MOCK_FAMILY,
          canManageMembers: false,
        }),
        {
          profile: {
            id: 'user-1',
            role: 'MEMBER',
            is_active: true,
            display_name: 'Regular Member',
            email: 'member@example.com',
            avatar_url: null,
            email_verified: true,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }
      )

      expect(html).not.toContain('Privacy Settings (Restricted Access)')
      expect(html).not.toContain('Family profile visibility')
      expect(html).not.toContain('Members list visibility')
    })

    it('displays privacy settings section for COMMUNITY_MODERATOR role (Mukhi equivalent)', () => {
      const html = renderWithProviders(
        React.createElement(FamilyDetail, {
          family: MOCK_FAMILY,
          canManageMembers: true,
        }),
        {
          profile: {
            id: 'mod-1',
            role: 'COMMUNITY_MODERATOR',
            is_active: true,
            display_name: 'Community Mukhi',
            email: 'mukhi@example.com',
            avatar_url: null,
            email_verified: true,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }
      )

      expect(html).toContain('Privacy Settings (Restricted Access)')
      expect(html).toContain('Family profile visibility')
      expect(html).toContain('Members list visibility')
    })
  })

  describe('MemberCard Component (Screen 15 Parity)', () => {
    it('renders Head of Family badge and relationship link for family head', () => {
      const html = renderToStaticMarkup(
        React.createElement(MemberCard, {
          member: MOCK_HEAD_MEMBER,
          canManageMembers: false,
        })
      )

      expect(html).toContain('data-testid="head-badge"')
      expect(html).toContain('Head of Family')
      expect(html).toContain('Chandru Vaswani')
      expect(html).toContain('href="/people/person-1#relationships"')
      expect(html).toContain('Relationships →')
    })
  })

  describe('AddMemberModal Component (Screen 13 Parity)', () => {
    it('renders person relationship selector and census member options', () => {
      const html = renderWithProviders(
        React.createElement(AddMemberModal, {
          familyId: 'fam-101',
          isOpen: true,
          onClose: vi.fn(),
          hasActiveHead: true,
        })
      )

      expect(html).toContain('Add Family Member')
      expect(html).toContain('Relationship to Family Head')
      expect(html).toContain('Spouse')
      expect(html).toContain('Son')
      expect(html).toContain('Daughter')
      expect(html).toContain('Create New Person')
      expect(html).toContain('Select Existing Person')
    })

    it('returns null when modal is closed', () => {
      const html = renderWithProviders(
        React.createElement(AddMemberModal, {
          familyId: 'fam-101',
          isOpen: false,
          onClose: vi.fn(),
        })
      )

      expect(html).toBe('')
    })
  })
})
