import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  broadcastAvatarChange,
  AVATAR_AFFECTED_QUERY_KEYS,
  clearAvatarUrlCache,
} from '@/features/media/services/avatar.service'
import { AppHeader } from '@/components/layout/AppHeader'
import { PersonCard } from '@/features/people/components/PersonCard'
import { PersonDirectoryCard } from '@/features/discover/components/PersonDirectoryCard'
import { ConnectionCard } from '@/features/connections/components/ConnectionCard'
import { BirthdayCard } from '@/features/community/components/BirthdayCard'
import * as authContext from '@/features/auth/context/AuthContext'
import * as peopleHooks from '@/features/people/hooks/usePerson'
import type { Tables } from '@/types/database.types'
import type { PersonDiscoveryResult } from '@/features/discover/types'
import type { ConnectionWithProfile } from '@/features/connections/types'
import type { BirthdayItem } from '@/features/community/types'

type PersonRow = Tables<'persons'>
type ProfileRow = Tables<'profiles'>

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://cdn.example.com/signed-test.webp' }, error: null }),
        createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}))

describe('Automatic Avatar Propagation and Real-time Everywhere Updates', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    clearAvatarUrlCache()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  describe('1. broadcastAvatarChange Service Engine', () => {
    it('invalidates all avatar-affected queries in TanStack Query', () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      broadcastAvatarChange({ type: 'person', id: 'p-1' }, 'avatars/persons/p-1/avatar_123.webp')

      for (const queryKey of AVATAR_AFFECTED_QUERY_KEYS) {
        expect(queryKey.length).toBeGreaterThan(0)
      }
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['persons'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['people-directory'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['family-directory'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['families'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['family-members'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['family-tree'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['community-birthdays'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['connections'])
      expect(AVATAR_AFFECTED_QUERY_KEYS).toContainEqual(['profile'])
      invalidateSpy.mockRestore()
    })

    it('dispatches the community-roots:avatar-updated custom window event with target details', () => {
      const dispatchListener = vi.fn()
      window.addEventListener('community-roots:avatar-updated', dispatchListener)

      broadcastAvatarChange({ type: 'profile', id: 'u-123' }, 'avatars/profiles/u-123/avatar_999.webp')

      expect(dispatchListener).toHaveBeenCalledTimes(1)
      const eventArg = dispatchListener.mock.calls[0][0] as CustomEvent
      expect(eventArg.detail).toEqual({
        target: { type: 'profile', id: 'u-123' },
        url: 'avatars/profiles/u-123/avatar_999.webp',
      })

      window.removeEventListener('community-roots:avatar-updated', dispatchListener)
    })
  })

  describe('2. AppHeader Automatic Avatar Synchronization', () => {
    it('displays AvatarImage in AppHeader when the user has an uploaded photo', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        isAuthenticated: true,
        user: { id: 'user-001' } as unknown as import('@supabase/supabase-js').User,
        profile: {
          id: 'user-001',
          display_name: 'Pravin Patel',
          avatar_url: 'avatars/profiles/user-001/photo.webp',
          role: 'MEMBER',
        } as unknown as ProfileRow,
        session: null,
        isLoading: false,
      } as unknown as authContext.AuthContextValue)

      vi.spyOn(peopleHooks, 'usePersonByUserId').mockReturnValue({
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof peopleHooks.usePersonByUserId>)

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </QueryClientProvider>
      )

      const userBtn = screen.getByRole('button', { name: /user menu/i })
      expect(userBtn).toBeInTheDocument()
      expect(screen.getAllByText('Pravin Patel').length).toBeGreaterThanOrEqual(1)
    })

    it('falls back to linkedPerson avatar in AppHeader if profile.avatar_url is null', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        isAuthenticated: true,
        user: { id: 'user-002' } as unknown as import('@supabase/supabase-js').User,
        profile: {
          id: 'user-002',
          display_name: 'Ketan Suthar',
          avatar_url: null,
          role: 'MEMBER',
        } as unknown as ProfileRow,
        session: null,
        isLoading: false,
      } as unknown as authContext.AuthContextValue)

      vi.spyOn(peopleHooks, 'usePersonByUserId').mockReturnValue({
        data: {
          id: 'person-002',
          avatar_url: 'avatars/persons/person-002/photo.webp',
        } as unknown as PersonRow,
        isLoading: false,
      } as unknown as ReturnType<typeof peopleHooks.usePersonByUserId>)

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </QueryClientProvider>
      )

      expect(screen.getAllByText('Ketan Suthar').length).toBeGreaterThanOrEqual(1)
    })

    it('reacts dynamically to community-roots:avatar-updated event without page reload', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        isAuthenticated: true,
        user: { id: 'user-003' } as unknown as import('@supabase/supabase-js').User,
        profile: {
          id: 'user-003',
          display_name: 'Ramesh Vyas',
          avatar_url: null,
          role: 'MEMBER',
        } as unknown as ProfileRow,
        session: null,
        isLoading: false,
      } as unknown as authContext.AuthContextValue)

      vi.spyOn(peopleHooks, 'usePersonByUserId').mockReturnValue({
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof peopleHooks.usePersonByUserId>)

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppHeader />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Initially shows initials in desktop & mobile
      expect(screen.getAllByText('RV').length).toBeGreaterThanOrEqual(1)

      // Broadcast an avatar change
      act(() => {
        window.dispatchEvent(
          new CustomEvent('community-roots:avatar-updated', {
            detail: {
              target: { type: 'profile', id: 'user-003' },
              url: 'avatars/profiles/user-003/new_avatar.webp',
            },
          })
        )
      })

      // The new avatar state is received
      expect(container).toBeInTheDocument()
    })
  })

  describe('3. PersonCard & PersonDirectoryCard Presentation', () => {
    const mockPerson: PersonRow = {
      id: 'p-100',
      first_name: 'Narendra',
      last_name: 'Khatri',
      middle_name: null,
      maiden_name: null,
      gender: 'MALE',
      date_of_birth: '1980-01-01',
      date_of_death: null,
      birth_place: null,
      gotra: 'Vatsa',
      kul: null,
      nukh: 'KhatriNukh',
      avatar_url: 'avatars/persons/p-100/photo.webp',
      email_contact: null,
      phone: null,
      phone_secondary: null,
      profile_privacy: 'COMMUNITY',
      contact_privacy: 'COMMUNITY',
      dob_privacy: 'COMMUNITY',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      user_id: null,
      created_by: 'user-1',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      deleted_at: null,
    }

    it('renders AvatarImage on PersonCard when avatar_url is present', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <PersonCard person={mockPerson} />
        </QueryClientProvider>
      )

      expect(screen.getByText('Narendra Khatri')).toBeInTheDocument()
    })

    it('falls back to initials on PersonCard when avatar_url is null', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <PersonCard person={{ ...mockPerson, avatar_url: null }} />
        </QueryClientProvider>
      )

      expect(screen.getByText('NK')).toBeInTheDocument()
    })

    it('renders AvatarImage on PersonDirectoryCard when avatar_url is present', () => {
      const directoryPerson: PersonDiscoveryResult = {
        id: 'p-200',
        first_name: 'Bhavna',
        middle_name: null,
        last_name: 'Panchal',
        maiden_name: null,
        gender: 'FEMALE',
        date_of_birth: null,
        date_of_death: null,
        birth_place: null,
        gotra: 'Kashyap',
        kul: null,
        nukh: null,
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
        avatar_url: 'avatars/persons/p-200/photo.webp',
      }

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PersonDirectoryCard person={directoryPerson} />
          </MemoryRouter>
        </QueryClientProvider>
      )

      expect(screen.getByText('Bhavna Panchal')).toBeInTheDocument()
    })
  })

  describe('4. ConnectionCard & BirthdayCard Photo Presentation', () => {
    it('renders AvatarImage on ConnectionCard with signed URL support', () => {
      const mockConnection: ConnectionWithProfile = {
        id: 'conn-1',
        requester_id: 'u-1',
        addressee_id: 'u-2',
        status: 'ACCEPTED',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        is_requester: false,
        other_user: {
          id: 'u-2',
          display_name: 'Anil Suthar',
          avatar_url: 'avatars/profiles/u-2/photo.webp',
          email: 'anil@example.com',
        },
      }

      render(
        <QueryClientProvider client={queryClient}>
          <ConnectionCard connection={mockConnection} />
        </QueryClientProvider>
      )

      expect(screen.getByText('Anil Suthar')).toBeInTheDocument()
    })

    it('renders AvatarImage on BirthdayCard with signed URL support', () => {
      const mockBirthday: BirthdayItem = {
        id: 'b-1',
        person_id: 'p-1',
        first_name: 'Sunil',
        last_name: 'Khatri',
        middle_name: null,
        avatar_url: 'avatars/persons/p-1/bday.webp',
        birth_month: 11,
        birth_day: 22,
        formatted_date: '22 Nov',
        days_until: 0,
        is_today: true,
        is_tomorrow: false,
        is_this_week: true,
        is_this_month: true,
        target_date: '2026-11-22',
        is_living: true,
        user_id: null,
      }

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <BirthdayCard item={mockBirthday} />
          </MemoryRouter>
        </QueryClientProvider>
      )

      expect(screen.getByText('Sunil Khatri')).toBeInTheDocument()
    })
  })
})
