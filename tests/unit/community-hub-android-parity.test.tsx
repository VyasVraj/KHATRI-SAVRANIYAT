/**
 * ANDROID-8: Community Hub Unit & Android Parity Tests
 * (tests/unit/community-hub-android-parity.test.tsx)
 *
 * Verifies Android parity requirements across:
 * 1. Community Hub Dashboard & Navigation: Pulse metrics, accessible WAI-ARIA tabs,
 *    and mobile touch targets >= 44px.
 * 2. Notice Board / Announcements (Screens 07-09): Circulars, pinned notices,
 *    detail modal, and filter controls.
 * 3. Events & Calendar with RSVP (Screens 09-10): Event cards, 3-way RSVP toggle
 *    (GOING, MAYBE, NOT_GOING), additional guest selector, and capacity progress.
 * 4. Community Groups & Associations: Verified badge, private lock, and membership join/leave.
 * 5. Trilingual Localization: Full parity across English, Hindi, and Gujarati.
 * 6. Role gating and domain boundaries: Regular members vs moderators,
 *    strict preservation of PERSON != USER, FAMILY != GROUP, and ANDROID-2 privacy lock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import { CommunityPage } from '@/features/community/pages/CommunityPage'
import { AnnouncementCard } from '@/features/community/components/AnnouncementCard'
import { AnnouncementDetailModal } from '@/features/community/components/AnnouncementDetailModal'
import { EventCard } from '@/features/community/components/EventCard'
import { EventDetailModal } from '@/features/community/components/EventDetailModal'
import { RsvpButtonGroup } from '@/features/community/components/RsvpButtonGroup'
import { GroupCard } from '@/features/community/components/GroupCard'
import * as authContext from '@/features/auth/context/AuthContext'
import * as groupsService from '@/features/community/services/groups.service'
import * as announcementsService from '@/features/community/services/announcements.service'
import * as eventsService from '@/features/community/services/events.service'
import type { GroupWithMembership, Announcement, CommunityEvent } from '@/features/community/types'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/community/services/groups.service')
vi.mock('@/features/community/services/announcements.service')
vi.mock('@/features/community/services/events.service')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const MODERATOR_ID = '99999999-9999-4999-8999-999999999999'

const MOCK_GROUPS: GroupWithMembership[] = [
  {
    id: 'grp-1',
    name: 'Bhuj Youth Association',
    slug: 'bhuj-youth',
    group_type: 'YOUTH',
    description: 'Youth cultural and sports wing.',
    location: 'Bhuj, Kutch',
    is_verified: true,
    is_private: false,
    member_count: 42,
    created_by: USER_ID,
    caller_role: 'ADMIN',
    is_caller_member: true,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'grp-2',
    name: 'Anjar Elders Council',
    slug: 'anjar-elders',
    group_type: 'COMMITTEE',
    description: 'Advisory committee for community elders.',
    location: 'Anjar, Kutch',
    is_verified: false,
    is_private: true,
    member_count: 15,
    created_by: 'other-user',
    caller_role: null,
    is_caller_member: false,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
]

const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'Samaj Mahasabha 2026 Circular',
    content: 'Official circular for the upcoming annual assembly in Bhuj. All registered family heads are requested to attend.',
    announcement_type: 'GENERAL',
    group_id: null,
    group_name: null,
    is_pinned: true,
    status: 'PUBLISHED',
    author_id: USER_ID,
    author: {
      id: USER_ID,
      display_name: 'President, Central Committee',
      avatar_url: null,
      email: 'president@example.com',
    },
    can_manage: true,
    published_at: '2026-10-15T10:00:00Z',
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
    deleted_at: null,
  },
]

const MOCK_EVENTS: CommunityEvent[] = [
  {
    id: 'evt-1',
    title: 'Navratri Sneh Milan & Dandiya Night',
    description: 'Annual traditional festivities with community dinner and cultural performances.',
    event_type: 'CULTURAL',
    start_time: '2026-11-10T18:30:00Z',
    end_time: '2026-11-10T23:00:00Z',
    location: 'Khatri Bhavan, Jubilee Ground, Bhuj',
    location_url: 'https://maps.google.com/?q=Bhuj',
    group_id: 'grp-1',
    group_name: 'Bhuj Youth Association',
    capacity: 250,
    status: 'PUBLISHED',
    is_pinned: true,
    creator_id: USER_ID,
    creator: {
      id: USER_ID,
      display_name: 'Bhuj Youth Coordinator',
      avatar_url: null,
      email: 'coordinator@example.com',
    },
    rsvp_count_going: 120,
    rsvp_count_maybe: 25,
    my_rsvp_status: 'GOING',
    my_guest_count: 2,
    my_notes: 'Dietary: Jain preference',
    can_manage: true,
    published_at: '2026-10-16T08:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    created_at: '2026-10-16T08:00:00Z',
    updated_at: '2026-10-16T08:00:00Z',
    deleted_at: null,
  },
]

function renderWithProviders(
  ui: React.ReactElement,
  options: { initialEntries?: string[]; initialLang?: 'en' | 'hi' | 'gu' } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const { initialEntries = ['/community'], initialLang = 'en' } = options

  window.localStorage.setItem('app_language', initialLang)

  // Seed React Query cache
  queryClient.setQueryData(['community-groups', undefined, USER_ID], MOCK_GROUPS)
  queryClient.setQueryData(
    ['community-groups', { search: '', group_type: 'ALL', membership_filter: 'ALL' }, USER_ID],
    MOCK_GROUPS
  )
  queryClient.setQueryData(
    ['community-groups', { membership_filter: 'MY_GROUPS' }, USER_ID],
    MOCK_GROUPS
  )
  queryClient.setQueryData(['community-announcements', undefined, USER_ID], MOCK_ANNOUNCEMENTS)
  queryClient.setQueryData(
    ['community-announcements', { search: '', announcement_type: 'ALL', scope: 'ALL' }, USER_ID],
    MOCK_ANNOUNCEMENTS
  )
  queryClient.setQueryData(['community-events', undefined, USER_ID], MOCK_EVENTS)
  queryClient.setQueryData(
    ['community-events', { search: '', event_type: 'ALL', scope: 'ALL', timeframe: 'UPCOMING' }, USER_ID],
    MOCK_EVENTS
  )

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage={initialLang}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('ANDROID-8 — Community Hub Android Parity Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: USER_ID, role: 'member' } as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })

    vi.spyOn(groupsService, 'listGroups').mockResolvedValue({
      data: MOCK_GROUPS,
      error: null,
    })

    vi.spyOn(announcementsService, 'listAnnouncements').mockResolvedValue({
      data: MOCK_ANNOUNCEMENTS,
      error: null,
    })

    vi.spyOn(eventsService, 'listEvents').mockResolvedValue({
      data: MOCK_EVENTS,
      error: null,
    })
  })

  describe('1. Community Hub Dashboard & Mobile Touch Targets', () => {
    it('renders Community Hub header and 3 pulse metric cards', async () => {
      renderWithProviders(<CommunityPage />)

      expect(screen.getByRole('heading', { level: 1, name: /community hub/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /view groups: 2 registered/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /view notice board: 1 notices/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /view events: 1 events/i })).toBeInTheDocument()
    })

    it('enforces min-h-[44px] accessible touch targets on metric cards and tabs', () => {
      renderWithProviders(<CommunityPage />)

      const groupsCard = screen.getByRole('button', { name: /view groups: 2 registered/i })
      expect(groupsCard.className).toContain('min-h-[44px]')

      const noticesCard = screen.getByRole('button', { name: /view notice board: 1 notices/i })
      expect(noticesCard.className).toContain('min-h-[44px]')

      const eventsCard = screen.getByRole('button', { name: /view events: 1 events/i })
      expect(eventsCard.className).toContain('min-h-[44px]')

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(9)
      tabs.forEach((tab) => {
        expect(tab.className).toContain('min-h-[44px]')
      })
    })

    it('navigates tabs with keyboard arrow keys according to WAI-ARIA', () => {
      renderWithProviders(<CommunityPage />)

      const groupsTab = screen.getByRole('tab', { name: /groups & associations/i })
      groupsTab.focus()

      fireEvent.keyDown(groupsTab, { key: 'ArrowRight' })
      expect(screen.getByRole('tab', { name: /notice board/i })).toHaveAttribute('aria-selected', 'true')

      fireEvent.keyDown(groupsTab, { key: 'ArrowRight' })
      expect(screen.getByRole('tab', { name: /events & calendar/i })).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('2. Notice Board / Announcements Android Parity', () => {
    it('renders AnnouncementCard with pinned badge and manager options button >= 44px', () => {
      const onView = vi.fn()
      const onEdit = vi.fn()
      const onArchive = vi.fn()
      const onDelete = vi.fn()

      renderWithProviders(
        <AnnouncementCard
          announcement={MOCK_ANNOUNCEMENTS[0]}
          onView={onView}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      )

      expect(screen.getByText('Samaj Mahasabha 2026 Circular')).toBeInTheDocument()
      expect(screen.getByText('Pinned')).toBeInTheDocument()

      const optionsBtn = screen.getByLabelText(/announcement options/i)
      expect(optionsBtn.className).toContain('min-h-[44px]')
      expect(optionsBtn.className).toContain('min-w-[44px]')

      fireEvent.click(optionsBtn)
      const editBtn = screen.getByRole('button', { name: /edit/i })
      expect(editBtn.className).toContain('min-h-[44px]')
    })

    it('renders AnnouncementDetailModal with content and accessible close buttons', () => {
      const onClose = vi.fn()

      renderWithProviders(
        <AnnouncementDetailModal
          announcement={MOCK_ANNOUNCEMENTS[0]}
          isOpen={true}
          onClose={onClose}
        />
      )

      expect(screen.getByRole('heading', { level: 2, name: 'Samaj Mahasabha 2026 Circular' })).toBeInTheDocument()
      expect(screen.getByText(/official circular for the upcoming annual assembly/i)).toBeInTheDocument()
      expect(screen.getByText('President, Central Committee')).toBeInTheDocument()

      const closeHeaderBtn = screen.getByLabelText(/close modal/i)
      expect(closeHeaderBtn.className).toContain('min-h-[44px]')
      expect(closeHeaderBtn.className).toContain('min-w-[44px]')

      const closeFooterBtn = screen.getByRole('button', { name: /^close$/i })
      expect(closeFooterBtn.className).toContain('min-h-[44px]')

      fireEvent.click(closeFooterBtn)
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('3. Events & Calendar with RSVP Android Parity', () => {
    it('renders EventCard with capacity progress, venue, and 3-way RSVP buttons', () => {
      const onView = vi.fn()
      const onRsvp = vi.fn().mockResolvedValue(undefined)

      renderWithProviders(
        <EventCard
          event={MOCK_EVENTS[0]}
          onView={onView}
          onRsvp={onRsvp}
        />
      )

      expect(screen.getByText('Navratri Sneh Milan & Dandiya Night')).toBeInTheDocument()
      expect(screen.getByText(/khatri bhavan, jubilee ground/i)).toBeInTheDocument()
      expect(screen.getByText(/120 \/ 250 seats \(48%\)/i)).toBeInTheDocument()

      const goingBtn = screen.getByRole('button', { name: /going \(\+2\)/i })
      expect(goingBtn.className).toContain('min-h-[44px]')
      expect(goingBtn.className).toContain('bg-emerald-600')

      const maybeBtn = screen.getByRole('button', { name: /maybe/i })
      expect(maybeBtn.className).toContain('min-h-[44px]')

      const notGoingBtn = screen.getByRole('button', { name: /can't go/i })
      expect(notGoingBtn.className).toContain('min-h-[44px]')
    })

    it('allows expanding guest count and submitting RSVP with touch targets >= 44px', async () => {
      const onRsvp = vi.fn().mockResolvedValue(undefined)

      renderWithProviders(
        <RsvpButtonGroup
          currentStatus={null}
          currentGuestCount={0}
          currentNotes={null}
          capacity={100}
          bookedSeats={10}
          isEventPast={false}
          isCancelled={false}
          onRsvp={onRsvp}
        />
      )

      const goingBtn = screen.getByRole('button', { name: /^going$/i })
      fireEvent.click(goingBtn)

      // Guest selector expands
      const guestSelect = screen.getByLabelText(/additional guests/i)
      expect(guestSelect.className).toContain('min-h-[44px]')

      fireEvent.change(guestSelect, { target: { value: '3' } })

      const notesInput = screen.getByPlaceholderText(/special notes for organizers/i)
      expect(notesInput.className).toContain('min-h-[44px]')
      fireEvent.change(notesInput, { target: { value: 'Family of 4 attending' } })

      const saveBtn = screen.getByRole('button', { name: /save rsvp/i })
      expect(saveBtn.className).toContain('min-h-[44px]')
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(onRsvp).toHaveBeenCalledWith('GOING', 3, 'Family of 4 attending')
      })
    })

    it('renders EventDetailModal with venue link, organizer controls, and close button', () => {
      const onClose = vi.fn()

      renderWithProviders(
        <EventDetailModal
          event={MOCK_EVENTS[0]}
          isOpen={true}
          onClose={onClose}
        />
      )

      expect(screen.getByRole('heading', { level: 2, name: 'Navratri Sneh Milan & Dandiya Night' })).toBeInTheDocument()
      expect(screen.getByText(/khatri bhavan, jubilee ground, bhuj/i)).toBeInTheDocument()

      const closeHeaderBtn = screen.getByLabelText(/close modal/i)
      expect(closeHeaderBtn.className).toContain('min-h-[44px]')

      const closeFooterBtn = screen.getByRole('button', { name: /^close$/i })
      expect(closeFooterBtn.className).toContain('min-h-[44px]')

      fireEvent.click(closeFooterBtn)
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('4. Community Groups & Associations Android Parity', () => {
    it('renders GroupCard with Verified badge and join/leave touch targets >= 44px', async () => {
      const onJoin = vi.fn().mockResolvedValue(undefined)
      const onLeave = vi.fn().mockResolvedValue(undefined)

      renderWithProviders(
        <GroupCard
          group={MOCK_GROUPS[0]}
          onJoin={onJoin}
          onLeave={onLeave}
          isAuthenticated={true}
        />
      )

      expect(screen.getByText('Bhuj Youth Association')).toBeInTheDocument()
      expect(screen.getByText('Verified')).toBeInTheDocument()
      expect(screen.getByText('42 members')).toBeInTheDocument()

      const leaveBtn = screen.getByRole('button', { name: /leave/i })
      expect(leaveBtn.className).toContain('min-h-[44px]')
    })

    it('indicates Private Group lock on non-joined private group', () => {
      const onJoin = vi.fn()
      const onLeave = vi.fn()

      renderWithProviders(
        <GroupCard
          group={MOCK_GROUPS[1]}
          onJoin={onJoin}
          onLeave={onLeave}
          isAuthenticated={true}
        />
      )

      expect(screen.getByText('Anjar Elders Council')).toBeInTheDocument()
      expect(screen.getAllByText('Private Group').length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: /join group/i })).not.toBeInTheDocument()
    })
  })

  describe('5. Trilingual Localization (English, Hindi, Gujarati)', () => {
    it('renders Hindi localized Community Hub', () => {
      renderWithProviders(<CommunityPage />, { initialLang: 'hi' })

      expect(screen.getByRole('heading', { level: 1, name: 'कम्युनिटी हब' })).toBeInTheDocument()
      expect(screen.getAllByText('समूह एवं संगठन').length).toBeGreaterThan(0)
      expect(screen.getAllByText('सूचना पट्ट').length).toBeGreaterThan(0)
      expect(screen.getAllByText('कार्यक्रम एवं कैलेंडर').length).toBeGreaterThan(0)
      expect(screen.getByText('कैटलॉग देखें')).toBeInTheDocument()
    })

    it('renders Gujarati localized Community Hub', () => {
      renderWithProviders(<CommunityPage />, { initialLang: 'gu' })

      expect(screen.getByRole('heading', { level: 1, name: 'કમ્યુનિટી હબ' })).toBeInTheDocument()
      expect(screen.getAllByText('જૂથો અને સંગઠનો').length).toBeGreaterThan(0)
      expect(screen.getAllByText('સૂચના બોર્ડ').length).toBeGreaterThan(0)
      expect(screen.getAllByText('કાર્યક્રમો અને કેલેન્ડર').length).toBeGreaterThan(0)
      expect(screen.getByText('સંગ્રહ બ્રાઉઝ કરો')).toBeInTheDocument()
    })
  })

  describe('6. Role Boundaries & Privacy Lock (PERSON != USER, ANDROID-2)', () => {
    it('does not display global creation actions to regular members', () => {
      const regularMemberGroups: GroupWithMembership[] = [
        { ...MOCK_GROUPS[0], caller_role: 'MEMBER' },
      ]
      vi.spyOn(groupsService, 'listGroups').mockResolvedValue({
        data: regularMemberGroups,
        error: null,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
      queryClient.setQueryData(['community-groups', undefined, USER_ID], regularMemberGroups)
      queryClient.setQueryData(
        ['community-groups', { membership_filter: 'MY_GROUPS' }, USER_ID],
        regularMemberGroups
      )
      queryClient.setQueryData(['community-announcements', undefined, USER_ID], MOCK_ANNOUNCEMENTS)
      queryClient.setQueryData(
        ['community-announcements', { search: '', announcement_type: 'ALL', scope: 'ALL' }, USER_ID],
        MOCK_ANNOUNCEMENTS
      )

      render(
        <QueryClientProvider client={queryClient}>
          <LanguageProvider defaultLanguage="en">
            <MemoryRouter initialEntries={['/community?tab=announcements']}>
              <CommunityPage />
            </MemoryRouter>
          </LanguageProvider>
        </QueryClientProvider>
      )

      // Regular member without managed groups cannot post global announcements
      expect(screen.queryByRole('button', { name: /post notice/i })).not.toBeInTheDocument()
    })

    it('displays global creation action to admin/moderator roles', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: MODERATOR_ID, role: 'admin' } as User,
        profile: null,
        session: null,
        isAuthenticated: true,
        isLoading: false,
      })

      renderWithProviders(<CommunityPage />, { initialEntries: ['/community?tab=announcements'] })

      const postNoticeBtn = screen.getByRole('button', { name: /post notice/i })
      expect(postNoticeBtn).toBeInTheDocument()
      expect(postNoticeBtn.className).toContain('min-h-[44px]')
    })
  })
})
