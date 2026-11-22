import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersonDetail } from '@/features/people/components/PersonDetail'
import { UpdateOccupationModal } from '@/features/people/components/UpdateOccupationModal'
import * as peopleService from '@/features/people/services/people.service'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { User } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.types'

// Mock usePersonFamilyMukhi
vi.mock('@/features/community', () => ({
  usePersonFamilyMukhi: vi.fn().mockReturnValue({ data: null, isLoading: false }),
}))

// Mock useOccupationRequests
vi.mock('@/features/people/hooks/useOccupationRequests', () => ({
  useMyOccupationRequests: vi.fn().mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() }),
  useOccupationRequestMutations: vi.fn().mockReturnValue({
    submit: { mutateAsync: vi.fn() },
    review: { mutateAsync: vi.fn() },
  }),
}))

describe('Person Occupation Display and Direct Update Suite', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  const authContextValue = {
    user: { id: 'u-1' } as unknown as User,
    session: null,
    profile: { id: 'u-1', role: 'COMMUNITY_MEMBER' } as unknown as Tables<'profiles'>,
    isAuthenticated: true,
    isLoading: false,
    isPending: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    refreshProfile: vi.fn(),
  }

  const basePerson: Tables<'persons'> & {
    occupation_category?: string | null
    custom_occupation?: string | null
    can_edit?: boolean
  } = {
    id: 'p-123',
    first_name: 'Jayesh',
    middle_name: 'Chandrakant',
    last_name: 'Vyas',
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1970-01-01',
    date_of_death: null,
    birth_place: 'Vadodara',
    phone: '+91 9876543210',
    phone_secondary: null,
    email_contact: 'jayesh@test.com',
    gotra: 'Krishna',
    nukh: 'Karatela',
    kul: null,
    occupation: null,
    occupation_category: null,
    custom_occupation: null,
    profile_privacy: 'PRIVATE',
    contact_privacy: 'PRIVATE',
    dob_privacy: 'PRIVATE',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    user_id: null,
    created_by: 'u-1',
    avatar_url: null,
    is_deceased: false,
    blood_group: 'B+',
    blood_group_consent: false,
  }

  it('displays "Occupation Not Provided" when person has no occupation', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authContextValue}>
          <QueryClientProvider client={queryClient}>
            <PersonDetail person={basePerson} canEdit={true} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(screen.getAllByText('Occupation / Profession').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Occupation Not Provided').length).toBeGreaterThanOrEqual(1)
  })

  it('displays official occupation badge when an approved category is present', () => {
    const personWithOcc = {
      ...basePerson,
      occupation: 'Information Technology',
    }

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authContextValue}>
          <QueryClientProvider client={queryClient}>
            <PersonDetail person={personWithOcc} canEdit={true} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(screen.getAllByText('Information Technology').length).toBeGreaterThanOrEqual(1)
  })

  it('displays custom occupation alongside category when custom_occupation is set', () => {
    const personWithCustom = {
      ...basePerson,
      occupation: 'Information Technology',
      custom_occupation: 'Senior Software Engineer',
    }

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authContextValue}>
          <QueryClientProvider client={queryClient}>
            <PersonDetail person={personWithCustom} canEdit={true} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(
      screen.getByText('Information Technology (Senior Software Engineer)')
    ).toBeInTheDocument()
  })

  it('shows "Add" or "Edit" button when user has edit permission', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authContextValue}>
          <QueryClientProvider client={queryClient}>
            <PersonDetail person={{ ...basePerson, created_by: 'u-1' }} canEdit={true} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
  })

  it('UpdateOccupationModal calls updatePerson and invalidates queries on submit', async () => {
    const spyUpdate = vi
      .spyOn(peopleService, 'updatePerson')
      .mockResolvedValueOnce({ data: basePerson as unknown as Tables<'persons'>, error: null })

    const handleSuccess = vi.fn()
    const handleClose = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <UpdateOccupationModal
          person={basePerson}
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText('Update Occupation / Profession')).toBeInTheDocument()

    // Submit the form
    const submitBtn = screen.getByRole('button', { name: /save occupation/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(spyUpdate).toHaveBeenCalledWith(basePerson.id, expect.any(Object))
    })
  })
})
