/**
 * Unit tests for EditMemberModal component
 *
 * Tests the edit dialog for changing a family member's role and head status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { EditMemberModal } from '@/features/family-members/components/EditMemberModal'
import * as mutationHooks from '@/features/family-members/hooks/useFamilyMemberMutations'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

const MOCK_PERSON: PersonRow = {
  id: 'person-1111',
  first_name: 'Priya',
  last_name: 'Sharma',
  middle_name: null,
  maiden_name: null,
  gender: 'FEMALE',
  date_of_birth: '1988-03-25',
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
  created_by: 'user-1',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_MEMBER: FamilyMemberWithPerson = {
  id: 'member-001',
  family_id: 'family-001',
  person_id: 'person-1111',
  role: 'SPOUSE',
  is_head: false,
  joined_at: '2020-01-01T00:00:00Z',
  left_at: null,
  added_by: 'user-1',
  created_at: '2020-01-01T00:00:00Z',
  person: MOCK_PERSON,
}

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

describe('EditMemberModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(mutationHooks, 'useUpdateFamilyMember').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof mutationHooks.useUpdateFamilyMember>)
  })

  it('renders nothing when isOpen is false', () => {
    const html = renderComponent(
      <EditMemberModal
        member={MOCK_MEMBER}
        familyId="family-001"
        isOpen={false}
        onClose={vi.fn()}
      />
    )
    expect(html).toBe('')
  })

  it('renders nothing when member is null', () => {
    const html = renderComponent(
      <EditMemberModal
        member={null}
        familyId="family-001"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toBe('')
  })

  it('renders Edit Member title and person name when isOpen is true', () => {
    const html = renderComponent(
      <EditMemberModal
        member={MOCK_MEMBER}
        familyId="family-001"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Edit Member')
    expect(html).toContain('Priya Sharma')
    expect(html).toContain('Family Role')
  })

  it('renders Head of Family checkbox and Save Changes button', () => {
    const html = renderComponent(
      <EditMemberModal
        member={MOCK_MEMBER}
        familyId="family-001"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Head of Family')
    expect(html).toContain('Cancel')
    expect(html).toContain('Save Changes')
  })
})
