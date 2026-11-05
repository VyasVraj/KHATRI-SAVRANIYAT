/**
 * Unit tests for TransferHeadModal component
 *
 * Tests the transfer confirmation dialog, display of current vs new head,
 * non-atomic disclosure, and action buttons.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { TransferHeadModal } from '@/features/family-members/components/TransferHeadModal'
import * as mutationHooks from '@/features/family-members/hooks/useFamilyMemberMutations'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

const MOCK_CURRENT_HEAD_PERSON: PersonRow = {
  id: 'person-1111',
  first_name: 'Rajesh',
  last_name: 'Sharma',
  middle_name: null,
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1960-01-01',
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

const MOCK_NEW_HEAD_PERSON: PersonRow = {
  ...MOCK_CURRENT_HEAD_PERSON,
  id: 'person-2222',
  first_name: 'Aarav',
  last_name: 'Sharma',
}

const CURRENT_HEAD: FamilyMemberWithPerson = {
  id: 'member-001',
  family_id: 'family-001',
  person_id: 'person-1111',
  role: 'HEAD',
  is_head: true,
  joined_at: '2020-01-01T00:00:00Z',
  left_at: null,
  added_by: 'user-1',
  created_at: '2020-01-01T00:00:00Z',
  person: MOCK_CURRENT_HEAD_PERSON,
}

const NEW_HEAD: FamilyMemberWithPerson = {
  id: 'member-002',
  family_id: 'family-001',
  person_id: 'person-2222',
  role: 'CHILD',
  is_head: false,
  joined_at: '2021-01-01T00:00:00Z',
  left_at: null,
  added_by: 'user-1',
  created_at: '2021-01-01T00:00:00Z',
  person: MOCK_NEW_HEAD_PERSON,
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

describe('TransferHeadModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(mutationHooks, 'useTransferFamilyHead').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof mutationHooks.useTransferFamilyHead>)
  })

  it('renders nothing when isOpen is false', () => {
    const html = renderComponent(
      <TransferHeadModal
        familyId="family-001"
        newHeadMember={NEW_HEAD}
        currentHeadMember={CURRENT_HEAD}
        isOpen={false}
        onClose={vi.fn()}
      />
    )
    expect(html).toBe('')
  })

  it('renders title and names of current and proposed head when isOpen is true', () => {
    const html = renderComponent(
      <TransferHeadModal
        familyId="family-001"
        newHeadMember={NEW_HEAD}
        currentHeadMember={CURRENT_HEAD}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Transfer Head of Family')
    expect(html).toContain('Rajesh Sharma')
    expect(html).toContain('Aarav Sharma')
  })

  it('explains the sequential demote and promote process', () => {
    const html = renderComponent(
      <TransferHeadModal
        familyId="family-001"
        newHeadMember={NEW_HEAD}
        currentHeadMember={CURRENT_HEAD}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('automatically demote the current head')
    expect(html).toContain('executes sequentially')
  })

  it('renders Cancel and Confirm Transfer buttons', () => {
    const html = renderComponent(
      <TransferHeadModal
        familyId="family-001"
        newHeadMember={NEW_HEAD}
        currentHeadMember={CURRENT_HEAD}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Cancel')
    expect(html).toContain('Confirm Transfer')
  })
})
