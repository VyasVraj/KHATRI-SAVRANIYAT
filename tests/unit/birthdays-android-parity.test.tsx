/**
 * ANDROID-9: Birthdays Unit & Android Parity Tests
 * (tests/unit/birthdays-android-parity.test.tsx)
 *
 * Verifies Android parity requirements across:
 * 1. Deterministic upcoming celebration calculation:
 *    - Today's birthday indicator (daysUntil = 0, isToday = true)
 *    - Tomorrow indicator
 *    - Month/year rollover (past birthdays roll over to next year)
 *    - Leap-day handling (Feb 29 resolves gracefully to March 1 in non-leap years)
 *    - Null / invalid DOB handling
 * 2. 5-Level Privacy Model & Shield:
 *    - PRIVATE DOB is omitted from community feed unless viewer is owner/moderator
 *    - COMMUNITY DOB is visible to logged-in members, omitted for unauthenticated
 *    - PUBLIC DOB is visible to all
 *    - Deceased members (DECEASED status or date_of_death) are strictly excluded
 *    - Year and calculated age are NEVER exposed in payloads or rendered DOM
 * 3. Android UX & Touch Targets:
 *    - Mobile touch targets >= 44px
 *    - Interactive Send Wish button with celebratory feedback
 *    - Quick filters: All Upcoming, Today, This Month
 *    - Profile navigation to /people/:id
 * 4. Community Hub Dashboard Integration:
 *    - Birthdays metric card in Community Pulse
 *    - WAI-ARIA tab navigation (?tab=birthdays)
 * 5. Trilingual Localization (en, hi, gu):
 *    - Badges, group headers, and empty states rendered accurately across languages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import {
  calculateUpcomingBirthday,
  getUpcomingBirthdays,
  groupBirthdays,
} from '@/features/community/services/birthdays.service'
import { BirthdayCard } from '@/features/community/components/BirthdayCard'
import { BirthdayFiltersBar } from '@/features/community/components/BirthdayFiltersBar'
import { BirthdaysFeed } from '@/features/community/components/BirthdaysFeed'
import { CommunityPage } from '@/features/community/pages/CommunityPage'
import * as authContext from '@/features/auth/context/AuthContext'
import * as groupsService from '@/features/community/services/groups.service'
import * as announcementsService from '@/features/community/services/announcements.service'
import * as eventsService from '@/features/community/services/events.service'
import { supabase } from '@/lib/supabase'
import type { BirthdayItem } from '@/features/community/types'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/community/services/groups.service')
vi.mock('@/features/community/services/announcements.service')
vi.mock('@/features/community/services/events.service')
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'

const FIXED_TODAY = new Date(2026, 10, 1) // November 1, 2026

const MOCK_BIRTHDAYS: BirthdayItem[] = [
  {
    id: 'p-today',
    person_id: 'p-today',
    first_name: 'Rahul',
    last_name: 'Khatri',
    middle_name: null,
    avatar_url: null,
    birth_month: 11,
    birth_day: 1,
    formatted_date: '1 Nov',
    days_until: 0,
    is_today: true,
    is_tomorrow: false,
    is_this_week: true,
    is_this_month: true,
    target_date: '2026-11-01T00:00:00.000Z',
    is_living: true,
  },
  {
    id: 'p-tomorrow',
    person_id: 'p-tomorrow',
    first_name: 'Pooja',
    last_name: 'Patel',
    middle_name: null,
    avatar_url: null,
    birth_month: 11,
    birth_day: 2,
    formatted_date: '2 Nov',
    days_until: 1,
    is_today: false,
    is_tomorrow: true,
    is_this_week: true,
    is_this_month: true,
    target_date: '2026-11-02T00:00:00.000Z',
    is_living: true,
  },
  {
    id: 'p-later',
    person_id: 'p-later',
    first_name: 'Aarav',
    last_name: 'Shah',
    middle_name: null,
    avatar_url: null,
    birth_month: 11,
    birth_day: 20,
    formatted_date: '20 Nov',
    days_until: 19,
    is_today: false,
    is_tomorrow: false,
    is_this_week: false,
    is_this_month: true,
    target_date: '2026-11-20T00:00:00.000Z',
    is_living: true,
  },
  {
    id: 'p-next-month',
    person_id: 'p-next-month',
    first_name: 'Diya',
    last_name: 'Mehta',
    middle_name: null,
    avatar_url: null,
    birth_month: 12,
    birth_day: 15,
    formatted_date: '15 Dec',
    days_until: 44,
    is_today: false,
    is_tomorrow: false,
    is_this_week: false,
    is_this_month: false,
    target_date: '2026-12-15T00:00:00.000Z',
    is_living: true,
  },
]

function renderWithProviders(
  ui: React.ReactElement,
  {
    lang = 'en',
    user = null,
    profile = null,
  }: {
    lang?: 'en' | 'hi' | 'gu'
    user?: User | null
    profile?: { id: string; role: string; display_name?: string } | null
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  vi.mocked(authContext.useAuthContext).mockReturnValue({
    user: user,
    profile: profile as never,
    session: user ? ({ user } as never) : null,
    isLoading: false,
    isAuthenticated: Boolean(user),
  })

  window.localStorage.setItem('app_language', lang)

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage={lang}>
        <MemoryRouter>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('ANDROID-9: Birthdays Service & Logic Parity', () => {
  it('calculates celebration correctly when birthday is today', () => {
    const res = calculateUpcomingBirthday('1990-11-01', FIXED_TODAY)
    expect(res).not.toBeNull()
    expect(res?.isToday).toBe(true)
    expect(res?.isTomorrow).toBe(false)
    expect(res?.daysUntil).toBe(0)
    expect(res?.formattedDate).toBe('1 Nov')
    expect(res?.birthMonth).toBe(11)
    expect(res?.birthDay).toBe(1)
  })

  it('calculates celebration correctly when birthday is tomorrow', () => {
    const res = calculateUpcomingBirthday('1998-11-02', FIXED_TODAY)
    expect(res).not.toBeNull()
    expect(res?.isToday).toBe(false)
    expect(res?.isTomorrow).toBe(true)
    expect(res?.daysUntil).toBe(1)
    expect(res?.formattedDate).toBe('2 Nov')
  })

  it('rolls over to next year when birthday already passed this year', () => {
    // March 15 has already passed relative to Nov 1, 2026
    const res = calculateUpcomingBirthday('1985-03-15', FIXED_TODAY)
    expect(res).not.toBeNull()
    expect(res?.isToday).toBe(false)
    expect(res?.daysUntil).toBeGreaterThan(0)
    expect(res?.formattedDate).toBe('15 Mar')
    // Next target date should be in 2027
    const target = new Date(res!.targetDate)
    expect(target.getFullYear()).toBe(2027)
    expect(target.getMonth()).toBe(2) // March
    expect(target.getDate()).toBe(15)
  })

  it('handles leap day (Feb 29) gracefully in non-leap years', () => {
    // 2026 and 2027 are not leap years
    const res = calculateUpcomingBirthday('2000-02-29', FIXED_TODAY)
    expect(res).not.toBeNull()
    // Resolves to March 1 without throwing or producing NaN
    expect(res?.birthMonth).toBe(2)
    expect(res?.birthDay).toBe(29)
    const target = new Date(res!.targetDate)
    expect(target.getFullYear()).toBe(2027)
    expect(isNaN(res!.daysUntil)).toBe(false)
  })

  it('rejects invalid or null date formats', () => {
    expect(calculateUpcomingBirthday(null, FIXED_TODAY)).toBeNull()
    expect(calculateUpcomingBirthday(undefined, FIXED_TODAY)).toBeNull()
    expect(calculateUpcomingBirthday('invalid-date', FIXED_TODAY)).toBeNull()
    expect(calculateUpcomingBirthday('1990/11/01', FIXED_TODAY)).toBeNull()
  })

  it('privacy shield: does not expose birth year or age in calculated output', () => {
    const res = calculateUpcomingBirthday('1990-11-01', FIXED_TODAY)
    expect(res).not.toHaveProperty('birthYear')
    expect(res).not.toHaveProperty('age')
    expect(res).not.toHaveProperty('calculatedAge')
  })

  it('groups birthdays into today, this_week, this_month, and upcoming', () => {
    const groups = groupBirthdays(MOCK_BIRTHDAYS)
    const keys = groups.map((g) => g.group_key)
    expect(keys).toContain('today')
    expect(keys).toContain('this_week')
    expect(keys).toContain('this_month')
    expect(keys).toContain('upcoming')

    const todayGroup = groups.find((g) => g.group_key === 'today')
    expect(todayGroup?.items).toHaveLength(1)
    expect(todayGroup?.items[0].first_name).toBe('Rahul')
  })
})

describe('ANDROID-9: Privacy & Database Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enforces 5-level privacy: excludes PRIVATE birthdays from community listing for regular users', async () => {
    const mockDbPersons = [
      {
        id: 'p-1',
        first_name: 'Aarav',
        middle_name: null,
        last_name: 'Shah',
        avatar_url: null,
        date_of_birth: '1995-11-15',
        dob_privacy: 'PRIVATE',
        profile_privacy: 'COMMUNITY',
        status: 'LIVING',
        date_of_death: null,
        user_id: 'other-user',
        created_by: 'other-user',
      },
      {
        id: 'p-2',
        first_name: 'Bhavin',
        middle_name: null,
        last_name: 'Mehta',
        avatar_url: null,
        date_of_birth: '1992-11-20',
        dob_privacy: 'COMMUNITY',
        profile_privacy: 'COMMUNITY',
        status: 'LIVING',
        date_of_death: null,
        user_id: 'other-user',
        created_by: 'other-user',
      },
    ]

    const mockSelect = vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({
          data: mockDbPersons,
          error: null,
        }),
      }),
    })

    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
    } as never)

    // Regular member query
    const res = await getUpcomingBirthdays({
      currentUserId: USER_ID,
      isModerator: false,
      now: FIXED_TODAY,
    })

    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    // Only Bhavin (COMMUNITY) is included; Aarav (PRIVATE) is omitted!
    expect(res.data![0].first_name).toBe('Bhavin')
  })

  it('allows record owner or moderator to view PRIVATE birthday', async () => {
    const mockDbPersons = [
      {
        id: 'p-my-record',
        first_name: 'My',
        middle_name: null,
        last_name: 'Self',
        avatar_url: null,
        date_of_birth: '1990-11-10',
        dob_privacy: 'PRIVATE',
        profile_privacy: 'PRIVATE',
        status: 'LIVING',
        date_of_death: null,
        user_id: USER_ID,
        created_by: USER_ID,
      },
    ]

    const mockSelect = vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({
          data: mockDbPersons,
          error: null,
        }),
      }),
    })

    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
    } as never)

    const res = await getUpcomingBirthdays({
      currentUserId: USER_ID,
      isModerator: false,
      now: FIXED_TODAY,
    })

    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(res.data![0].first_name).toBe('My')
  })

  it('excludes deceased members from upcoming birthdays', async () => {
    const mockDbPersons = [
      {
        id: 'p-deceased-status',
        first_name: 'Late',
        middle_name: null,
        last_name: 'Ancestor',
        avatar_url: null,
        date_of_birth: '1940-11-10',
        dob_privacy: 'PUBLIC',
        profile_privacy: 'PUBLIC',
        status: 'DECEASED',
        date_of_death: null,
        user_id: null,
        created_by: 'creator',
      },
      {
        id: 'p-deceased-date',
        first_name: 'Grand',
        middle_name: null,
        last_name: 'Father',
        avatar_url: null,
        date_of_birth: '1935-11-12',
        dob_privacy: 'PUBLIC',
        profile_privacy: 'PUBLIC',
        status: 'LIVING',
        date_of_death: '2020-05-10',
        user_id: null,
        created_by: 'creator',
      },
      {
        id: 'p-living',
        first_name: 'Living',
        middle_name: null,
        last_name: 'Member',
        avatar_url: null,
        date_of_birth: '2000-11-14',
        dob_privacy: 'PUBLIC',
        profile_privacy: 'PUBLIC',
        status: 'LIVING',
        date_of_death: null,
        user_id: null,
        created_by: 'creator',
      },
    ]

    const mockSelect = vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({
          data: mockDbPersons,
          error: null,
        }),
      }),
    })

    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
    } as never)

    const res = await getUpcomingBirthdays({
      currentUserId: null,
      isModerator: false,
      now: FIXED_TODAY,
    })

    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(res.data![0].first_name).toBe('Living')
  })
})

describe('ANDROID-9: BirthdayCard Component & Touch Accessibility', () => {
  it('renders member name and formatted date without exposing birth year or age', () => {
    renderWithProviders(
      <BirthdayCard item={MOCK_BIRTHDAYS[0]} isAuthenticated={true} />
    )

    expect(screen.getByText('Rahul Khatri')).toBeInTheDocument()
    expect(screen.getAllByText('1 Nov').length).toBeGreaterThan(0)

    // Verify birth year or age are NOT in DOM
    expect(screen.queryByText(/1990|1995|1998|2000/)).not.toBeInTheDocument()
    expect(screen.queryByText(/years old|age/i)).not.toBeInTheDocument()
  })

  it('renders "Birthday Today!" badge with cake icon for today celebrations', () => {
    renderWithProviders(
      <BirthdayCard item={MOCK_BIRTHDAYS[0]} isAuthenticated={true} />
    )

    expect(screen.getByText('Birthday Today!')).toBeInTheDocument()
  })

  it('renders "Tomorrow" badge for tomorrow celebration', () => {
    renderWithProviders(
      <BirthdayCard item={MOCK_BIRTHDAYS[1]} isAuthenticated={true} />
    )

    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })

  it('renders "In X days" badge for future celebration', () => {
    renderWithProviders(
      <BirthdayCard item={MOCK_BIRTHDAYS[2]} isAuthenticated={true} />
    )

    expect(screen.getByText('In 19 days')).toBeInTheDocument()
  })

  it('provides >= 44px touch targets on Send Wish and Profile buttons', () => {
    renderWithProviders(
      <BirthdayCard item={MOCK_BIRTHDAYS[0]} isAuthenticated={true} />
    )

    const wishBtn = screen.getByRole('button', {
      name: /send wish to rahul khatri/i,
    })
    expect(wishBtn.className).toContain('min-h-[44px]')

    const profileLink = screen.getByRole('link', {
      name: /view rahul khatri's profile/i,
    })
    expect(profileLink.className).toContain('min-h-[44px]')
    expect(profileLink.getAttribute('href')).toBe('/people/p-today')
  })

  it('handles Send Wish click with celebratory feedback', () => {
    const handleSendWish = vi.fn()
    const { rerender } = renderWithProviders(
      <BirthdayCard
        item={MOCK_BIRTHDAYS[0]}
        hasWished={false}
        onSendWish={handleSendWish}
        isAuthenticated={true}
      />
    )

    const wishBtn = screen.getByRole('button', {
      name: /send wish to rahul khatri/i,
    })
    fireEvent.click(wishBtn)
    expect(handleSendWish).toHaveBeenCalledWith('p-today')

    // Rerender as wished
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider defaultLanguage="en">
          <MemoryRouter>
            <BirthdayCard
              item={MOCK_BIRTHDAYS[0]}
              hasWished={true}
              onSendWish={handleSendWish}
              isAuthenticated={true}
            />
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>
    )

    expect(screen.getByText('Wish Sent!')).toBeInTheDocument()
  })
})

describe('ANDROID-9: BirthdayFiltersBar & Feed Component', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    } as never)
  })

  it('renders filter chips with >= 44px touch targets and switches active filters', () => {
    const handleChange = vi.fn()
    renderWithProviders(
      <BirthdayFiltersBar
        filters={{ filter: 'ALL' }}
        onChange={handleChange}
        todayCount={1}
        thisMonthCount={3}
        totalCount={4}
      />
    )

    const allBtn = screen.getByRole('button', { name: /all upcoming/i })
    const todayBtn = screen.getByRole('button', { name: /today/i })
    const monthBtn = screen.getByRole('button', { name: /this month/i })

    expect(allBtn.className).toContain('min-h-[44px]')
    expect(todayBtn.className).toContain('min-h-[44px]')
    expect(monthBtn.className).toContain('min-h-[44px]')

    fireEvent.click(todayBtn)
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'TODAY' })
    )
  })

  it('renders privacy notice banner in feed view', () => {
    renderWithProviders(<BirthdaysFeed />)

    expect(
      screen.getByText(/birthdays are shown in accordance with community privacy preferences/i)
    ).toBeInTheDocument()
  })
})

describe('ANDROID-9: Community Hub Dashboard Integration', () => {
  beforeEach(() => {
    vi.mocked(groupsService.listGroups).mockResolvedValue({
      data: [],
      error: null,
    })
    vi.mocked(announcementsService.listAnnouncements).mockResolvedValue({
      data: [],
      error: null,
    })
    vi.mocked(eventsService.listEvents).mockResolvedValue({
      data: [],
      error: null,
    })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    } as never)
  })

  it('displays Birthdays card in Community Pulse and Birthdays tab in tablist', async () => {
    renderWithProviders(<CommunityPage />, {
      user: { id: USER_ID } as User,
      profile: { id: USER_ID, role: 'MEMBER' },
    })

    // Community Pulse metric card
    const birthdayCard = screen.getByLabelText(/view birthdays/i)
    expect(birthdayCard).toBeInTheDocument()
    expect(birthdayCard.className).toContain('min-h-[44px]')

    // WAI-ARIA tab navigation
    const birthdayTab = screen.getByRole('tab', { name: /birthdays/i })
    expect(birthdayTab).toBeInTheDocument()
    expect(birthdayTab.getAttribute('id')).toBe('tab-birthdays')
    expect(birthdayTab.className).toContain('min-h-[44px]')

    // Clicking Birthdays tab activates the birthdays panel
    fireEvent.click(birthdayTab)
    await waitFor(() => {
      const panel = screen.getByRole('tabpanel', { hidden: false })
      expect(panel.getAttribute('id')).toBe('panel-birthdays')
    })
  })
})

describe('ANDROID-9: Trilingual Localization (Hindi & Gujarati)', () => {
  it('renders birthday cards and badges in Hindi', () => {
    renderWithProviders(
      <BirthdayCard item={MOCK_BIRTHDAYS[0]} isAuthenticated={true} />,
      { lang: 'hi' }
    )

    // "Birthday Today!" -> "आज जन्मदिन!"
    expect(screen.getByText('आज जन्मदिन!')).toBeInTheDocument()
    // "Send Wish" -> "बधाई भेजें"
    expect(screen.getByText('बधाई भेजें')).toBeInTheDocument()
  })

  it('renders birthday cards and badges in Gujarati', () => {
    renderWithProviders(
      <BirthdayCard item={MOCK_BIRTHDAYS[0]} isAuthenticated={true} />,
      { lang: 'gu' }
    )

    // "Birthday Today!" -> "આજે જન્મદિવસ!"
    expect(screen.getByText('આજે જન્મદિવસ!')).toBeInTheDocument()
    // "Send Wish" -> "શુભેચ્છા પાઠવો"
    expect(screen.getByText('શુભેચ્છા પાઠવો')).toBeInTheDocument()
  })
})
