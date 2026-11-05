/**
 * Unit tests for AddMemberModal component
 *
 * Tests modal visibility, relationship selection, new vs existing mode,
 * standardized name inputs, gotra/nukh selection, and save actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { AddMemberModal } from '@/features/family-members/components/AddMemberModal'
import * as peopleHooks from '@/features/people/hooks/usePersonList'
import * as memberHooks from '@/features/family-members/hooks/useFamilyMembers'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

const MOCK_PERSONS: PersonRow[] = [
  {
    id: 'person-1',
    first_name: 'Vikram',
    last_name: 'Malhotra',
    middle_name: null,
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1978-02-10',
    birth_place: 'Delhi',
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
  },
  {
    id: 'person-head',
    first_name: 'Prakash',
    last_name: 'Keria',
    middle_name: null,
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1965-05-15',
    birth_place: 'Mumbai',
    date_of_death: null,
    gotra: 'Sudarshan',
    kul: null,
    nukh: 'Keria',
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
  },
]

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

describe('AddMemberModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(peopleHooks, 'usePersonList').mockReturnValue({
      data: MOCK_PERSONS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof peopleHooks.usePersonList>)

    vi.spyOn(memberHooks, 'useFamilyMembers').mockReturnValue({
      data: [
        {
          id: 'member-head',
          family_id: 'family-1',
          person_id: 'person-head',
          role: 'HEAD',
          is_head: true,
          joined_at: '2026-01-01',
          left_at: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          person: {
            id: 'person-head',
            first_name: 'Prakash',
            last_name: 'Keria',
            gender: 'MALE',
            gotra: 'Sudarshan',
            nukh: 'Keria',
          },
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof memberHooks.useFamilyMembers>)
  })

  it('renders nothing when isOpen is false', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={false}
        onClose={vi.fn()}
      />
    )
    expect(html).toBe('')
  })

  it('renders modal header and relationship selector when isOpen is true', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Add Family Member')
    expect(html).toContain('Relationship to Family Head')
    expect(html).toContain('Create New Person')
    expect(html).toContain('Select Existing Person')
  })

  it('renders standard name ordering inputs: First, Middle, Last, Maiden', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('1. First Name')
    expect(html).toContain('2. Middle Name')
    expect(html).toContain('3. Last Name / Surname')
    expect(html).toContain('4. Maiden Name (if applicable)')
  })

  it('renders Gotra and Nukh dependent selector', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Gotra')
    expect(html).toContain('Nukh')
    expect(html).not.toContain('label="Kul"')
  })

  it('renders action buttons: Done, Save Member, and Save & Add Another', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Done')
    expect(html).toContain('Save Member')
    expect(html).toContain('Save &amp; Add Another')
  })

  it('renders dialog with accessible attributes aria-modal and role dialog', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
  })
})
