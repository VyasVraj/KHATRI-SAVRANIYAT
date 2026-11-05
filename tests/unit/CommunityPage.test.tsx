/**
 * Unit Tests: CommunityPage Dashboard Component (Phase 10 — Subtask 4)
 * (src/features/community/pages/CommunityPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { CommunityPage } from '@/features/community/pages/CommunityPage'
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
    member_count: 35,
    created_by: USER_ID,
    caller_role: 'ADMIN',
    is_caller_member: true,
    created_at: '2026-10-07T00:00:00Z',
    updated_at: '2026-10-07T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'grp-2',
    name: 'Anjar Welfare Committee',
    slug: 'anjar-welfare',
    group_type: 'COMMITTEE',
    description: 'Civic support committee.',
    location: 'Anjar, Kutch',
    is_verified: false,
    is_private: false,
    member_count: 12,
    created_by: 'other-user',
    caller_role: null,
    is_caller_member: false,
    created_at: '2026-10-07T00:00:00Z',
    updated_at: '2026-10-07T00:00:00Z',
    deleted_at: null,
  },
]

const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'Annual Community Gathering 2026',
    content: 'All community members are cordially invited.',
    announcement_type: 'EVENT',
    group_id: 'grp-1',
    group_name: 'Bhuj Youth Association',
    is_pinned: true,
    status: 'PUBLISHED',
    author_id: USER_ID,
    author: { id: USER_ID, display_name: 'Pravin Patel', avatar_url: null, email: 'pravin@example.com' },
    can_manage: true,
    published_at: '2026-10-07T12:00:00Z',
    created_at: '2026-10-07T12:00:00Z',
    updated_at: '2026-10-07T12:00:00Z',
    deleted_at: null,
  },
]

const MOCK_EVENTS: CommunityEvent[] = [
  {
    id: 'evt-1',
    title: 'Diwali Milan & Cultural Night',
    description: 'Festive community celebrations.',
    event_type: 'CULTURAL',
    start_time: '2027-11-01T18:00:00Z',
    end_time: '2027-11-01T22:00:00Z',
    location: 'Community Hall, Bhuj',
    location_url: null,
    group_id: 'grp-1',
    group_name: 'Bhuj Youth Association',
    capacity: 200,
    status: 'PUBLISHED',
    is_pinned: true,
    creator_id: USER_ID,
    creator: { id: USER_ID, display_name: 'Pravin Patel', avatar_url: null, email: 'pravin@example.com' },
    rsvp_count_going: 45,
    rsvp_count_maybe: 10,
    my_rsvp_status: 'GOING',
    my_guest_count: 1,
    my_notes: null,
    can_manage: true,
    published_at: '2026-10-07T14:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    created_at: '2026-10-07T14:00:00Z',
    updated_at: '2026-10-07T14:00:00Z',
    deleted_at: null,
  },
]

describe('CommunityPage Dashboard Component', () => {
  let queryClient: QueryClient

  function renderWithProviders(element: React.ReactElement, initialEntries = ['/community']): string {
    return renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, { initialEntries }, element)
      )
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

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

    // Pre-populate query client cache so synchronous renderToStaticMarkup sees resolved data
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
  })

  it('renders page header and subtitle', () => {
    const html = renderWithProviders(<CommunityPage />)

    expect(html).toContain('Community Hub')
    expect(html).toContain('Connect with local village associations')
  })

  it('renders all three community pulse metric cards', () => {
    const html = renderWithProviders(<CommunityPage />)

    // Pulse cards
    expect(html).toContain('Groups &amp; Associations')
    expect(html).toContain('Notice Board')
    expect(html).toContain('Events &amp; Calendar')

    // Metric counts
    expect(html).toContain('2') // 2 groups
    expect(html).toContain('1') // 1 notice / 1 event
    expect(html).toContain('1 verified')
    expect(html).toContain('1 pinned')
    expect(html).toContain('1 upcoming')
  })

  it('renders accessible WAI-ARIA tablist and tab buttons with count badges', () => {
    const html = renderWithProviders(<CommunityPage />)

    expect(html).toContain('role="tablist"')
    expect(html).toContain('id="tab-groups"')
    expect(html).toContain('id="tab-announcements"')
    expect(html).toContain('id="tab-events"')

    // Tab buttons have count indicators
    expect(html).toContain('Groups &amp; Associations')
    expect(html).toContain('Notice Board')
    expect(html).toContain('Events &amp; Calendar')
  })

  it('defaults to groups catalog tab when no tab param is specified', () => {
    const html = renderWithProviders(<CommunityPage />, ['/community'])

    expect(html).toContain('id="panel-groups"')
    expect(html).toContain('aria-labelledby="tab-groups"')
    expect(html).toContain('Bhuj Youth Association')
  })

  it('activates announcements feed when ?tab=announcements is in URL', () => {
    const html = renderWithProviders(<CommunityPage />, ['/community?tab=announcements'])

    expect(html).toContain('id="panel-announcements"')
    expect(html).toContain('aria-labelledby="tab-announcements"')
    expect(html).toContain('Annual Community Gathering 2026')
  })

  it('activates events feed when ?tab=events is in URL', () => {
    const html = renderWithProviders(<CommunityPage />, ['/community?tab=events'])

    expect(html).toContain('id="panel-events"')
    expect(html).toContain('aria-labelledby="tab-events"')
    expect(html).toContain('Diwali Milan &amp; Cultural Night')
  })
})
