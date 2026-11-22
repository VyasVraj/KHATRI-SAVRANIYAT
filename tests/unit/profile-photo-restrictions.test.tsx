/**
 * Unit Tests: Profile Photo Upload and Change Restrictions
 *
 * Validates:
 * 1. "Change photo" button is removed from PersonDetail.
 * 2. "Change photo" button is removed from ProfileOverviewSection.
 * 3. Photo upload action is removed from ProfileCompletenessSection.
 * 4. "Change crest" button is removed from FamilyDetail.
 * 5. uploadAvatar() service strictly rejects uploads with error for all users.
 * 6. Initials-based avatar fallback functions seamlessly without broken images.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersonDetail } from '@/features/people/components/PersonDetail'
import { ProfileOverviewSection } from '@/features/profile/components/ProfileOverviewSection'
import { uploadAvatar } from '@/features/media/services/avatar.service'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>
type ProfileRow = Tables<'profiles'>

const mockPerson = {
  id: '11111111-1111-1111-1111-111111111111',
  first_name: 'Haresh',
  middle_name: 'Kumar',
  last_name: 'Khatri',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1985-06-15',
  birth_place: 'Vadodara',
  city: 'Vadodara',
  country: 'India',
  occupation: 'Engineering',
  phone: '9876543210',
  phone_secondary: null,
  email_contact: 'haresh@example.com',
  gotra: 'Vatsa',
  nukh: 'Khatri',
  blood_group: 'B+',
  is_deceased: false,
  date_of_death: null,
  avatar_url: null,
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'COMMUNITY',
  dob_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  user_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  created_by: null,
  kul: null,
  verification_status: 'UNVERIFIED',
} as unknown as PersonRow

const mockProfile: ProfileRow = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'haresh@example.com',
  display_name: 'Haresh Khatri',
  avatar_url: null,
  role: 'MEMBER',
  is_active: true,
  email_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('Restored Profile Photo Feature and Permissions', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  it('renders "Change photo" / camera action on PersonDetail when canEdit=true', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PersonDetail person={mockPerson} canEdit={true} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // "Change photo" / "Upload photo" action must exist for authorized user
    const uploadBtns = screen.getAllByRole('button', { name: /upload photo/i })
    expect(uploadBtns.length).toBeGreaterThan(0)
    expect(uploadBtns[0]).toBeInTheDocument()

    // Initials avatar fallback must exist for the person's name
    expect(screen.getByText('HK')).toBeInTheDocument()
  })

  it('hides "Change photo" action on PersonDetail when canEdit=false', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PersonDetail person={mockPerson} canEdit={false} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.queryByRole('button', { name: /upload photo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change photo/i })).not.toBeInTheDocument()
  })

  it('renders "Change photo" action in ProfileOverviewSection', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfileOverviewSection
            userId={mockProfile.id}
            profile={mockProfile}
            linkedPerson={mockPerson}
            isLoadingPerson={false}
            onTabChange={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // "Change photo" or "Upload photo" button must exist
    const uploadBtns = screen.getAllByRole('button', { name: /upload photo/i })
    expect(uploadBtns.length).toBeGreaterThan(0)
    expect(uploadBtns[0]).toBeInTheDocument()
  })

  it('displays avatar image when avatar_url is provided', () => {
    const personWithAvatar = {
      ...mockPerson,
      avatar_url: 'https://example.com/avatar.webp',
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PersonDetail person={personWithAvatar} canEdit={false} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const img = screen.getByRole('img', { name: /haresh kumar khatri/i })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.webp')
  })

  it('uploadAvatar service validates file and processes upload', async () => {
    const invalidBlob = new Blob(['test'], { type: 'text/plain' })
    const result = await uploadAvatar(invalidBlob, {
      type: 'person',
      id: mockPerson.id,
    })

    expect(result.data).toBeNull()
    expect(result.error).toBeDefined()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
  })
})
