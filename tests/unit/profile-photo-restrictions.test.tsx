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
import { ProfileCompletenessSection } from '@/features/profile/components/ProfileCompletenessSection'
import { FamilyDetail } from '@/features/families/components/FamilyDetail'
import { uploadAvatar } from '@/features/media/services/avatar.service'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>
type ProfileRow = Tables<'profiles'>
type FamilyRow = Tables<'families'>

const mockAuthContextValue = {
  user: { id: 'user-1' } as unknown as import('@supabase/supabase-js').User,
  profile: { id: 'user-1', role: 'ADMIN', is_active: true } as unknown as ProfileRow,
  session: null,
  isLoading: false,
  isAuthenticated: true,
  refreshProfile: async () => {},
  signInWithPassword: async () => ({ error: null }),
  signUpWithPassword: async () => ({ error: null }),
  signOut: async () => {},
}

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

const mockFamily = {
  id: '33333333-3333-3333-3333-333333333333',
  family_name: 'Khatri Parivar',
  city: 'Vadodara',
  state: 'Gujarat',
  country: 'India',
  gotra: 'Vatsa',
  nukh: 'Khatri',
  avatar_url: null,
  selected_mukhi_id: null,
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
} as unknown as FamilyRow

describe('Profile Photo Upload and Change Restrictions', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  it('removes "Change photo" button and dialog from PersonDetail even when canEdit=true', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PersonDetail person={mockPerson} canEdit={true} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // "Change photo" button must NOT exist
    expect(screen.queryByRole('button', { name: /Change photo/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Change photo/i)).not.toBeInTheDocument()

    // Initials avatar fallback must exist for the person's name
    expect(screen.getByText('HK')).toBeInTheDocument()
  })

  it('removes "Change photo" button from ProfileOverviewSection', () => {
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

    // "Change photo" button must NOT exist
    expect(screen.queryByRole('button', { name: /Change photo/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Change photo/i)).not.toBeInTheDocument()
  })

  it('removes photo upload action from ProfileCompletenessSection', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfileCompletenessSection
            userId={mockProfile.id}
            linkedPerson={mockPerson}
            isLoadingPerson={false}
          />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Photo upload button must NOT exist in actionable missing fields
    expect(screen.queryByRole('button', { name: /Upload Photo/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Upload Photo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Profile Photo \/ Portrait/i)).not.toBeInTheDocument()
  })

  it('removes "Change crest" button from FamilyDetail', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={mockAuthContextValue}>
          <MemoryRouter>
            <FamilyDetail family={mockFamily} canManageMembers={true} />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    )

    // "Change crest" button must NOT exist
    expect(screen.queryByRole('button', { name: /Change crest/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Change crest/i)).not.toBeInTheDocument()
  })

  it('uploadAvatar service rejects any upload attempt with PHOTO_UPLOADS_DISABLED error', async () => {
    const dummyBlob = new Blob(['test'], { type: 'image/jpeg' })
    const result = await uploadAvatar(dummyBlob, {
      type: 'person',
      id: mockPerson.id,
    })

    expect(result.data).toBeNull()
    expect(result.error).toBeDefined()
    expect(result.error?.code).toBe('PHOTO_UPLOADS_DISABLED')
    expect(result.error?.message).toMatch(/Profile photo uploads and changes have been permanently disabled/i)
  })
})
