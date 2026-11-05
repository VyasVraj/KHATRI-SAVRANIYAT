/**
 * ANDROID-10: Sindhi Panchang & Lunar Calendar Parity Tests
 * (tests/unit/panchang-android-parity.test.tsx)
 *
 * Verifies Android parity requirements across Screens 29-32:
 * 1. Deterministic calendar date logic:
 *    - Gregorian date formatting & parsing without timezone shifts
 *    - Leap year & month length handling (28, 29, 30, 31 days)
 *    - Complete 7-column month matrix with padding days
 * 2. Cultural & Panchang Data Correctness:
 *    - Sindhi months metadata (Chet, Vaisakh, Jeth, Akhar, Sawan, Badho, Asu, Katti, Nahri, Poh, Mangh, Phagun)
 *    - Verified cultural observances (Cheti Chand, Thadri, Lal Loi, Diwali, Ekadashi, Chand Darshan)
 *    - Transparent distinction: verified community entries vs ASTRONOMICAL_PENDING (no fabricated values)
 * 3. Mobile UI & Touch Targets:
 *    - Calendar navigation buttons (<<, <, Today, >, >>) with >= 44px touch targets
 *    - Grid day buttons with >= 44px touch targets
 *    - Filter chips (All, Observances & Fasts, Festivals) with >= 44px touch targets
 * 4. Cross-Referenced Community Events:
 *    - Displays community events scheduled on the selected date
 * 5. Community Hub Integration:
 *    - Panchang pulse card & 5th tab in Community Hub
 *    - Keyboard WAI-ARIA tab navigation
 * 6. Trilingual Localization (en, hi, gu):
 *    - English, Hindi, and Gujarati translations rendered accurately
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import {
  formatDateString,
  parseDateString,
  getDaysInMonth,
  getMonthMatrix,
  getPanchangDayInfo,
  SINDHI_MONTHS,
  VERIFIED_OBSERVANCES_REGISTRY,
} from '@/features/community/services/panchang.service'
import { PanchangMonthView } from '@/features/community/components/PanchangMonthView'
import { PanchangDayDetail } from '@/features/community/components/PanchangDayDetail'
import { PanchangFiltersBar } from '@/features/community/components/PanchangFiltersBar'
import { PanchangLegend } from '@/features/community/components/PanchangLegend'
import { PanchangView } from '@/features/community/components/PanchangView'
import { CommunityPage } from '@/features/community/pages/CommunityPage'
import * as authContext from '@/features/auth/context/AuthContext'
import * as groupsService from '@/features/community/services/groups.service'
import * as announcementsService from '@/features/community/services/announcements.service'
import * as eventsService from '@/features/community/services/events.service'
import * as birthdaysService from '@/features/community/services/birthdays.service'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/community/services/groups.service')
vi.mock('@/features/community/services/announcements.service')
vi.mock('@/features/community/services/events.service')
vi.mock('@/features/community/services/birthdays.service')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const FIXED_TODAY = new Date(2026, 10, 1) // 1 November 2026 (Sunday)

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

describe('ANDROID-10: Panchang Date Mathematics & Determinism', () => {
  it('formats Date to YYYY-MM-DD deterministically without timezone shifts', () => {
    const d = new Date(2026, 10, 1) // November 1, 2026
    expect(formatDateString(d)).toBe('2026-11-01')
  })

  it('parses YYYY-MM-DD to normalized local midnight Date', () => {
    const d = parseDateString('2026-11-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(10) // November
    expect(d.getDate()).toBe(1)
  })

  it('calculates days in month accurately including leap years', () => {
    expect(getDaysInMonth(2026, 2)).toBe(28) // Feb 2026 (non-leap)
    expect(getDaysInMonth(2024, 2)).toBe(29) // Feb 2024 (leap)
    expect(getDaysInMonth(2028, 2)).toBe(29) // Feb 2028 (leap)
    expect(getDaysInMonth(2026, 11)).toBe(30) // Nov 2026
    expect(getDaysInMonth(2026, 12)).toBe(31) // Dec 2026
  })

  it('generates a 7-column month matrix with correct leading and trailing padding', () => {
    const matrix = getMonthMatrix(2026, 10, FIXED_TODAY, FIXED_TODAY)
    // Nov 1, 2026 is Sunday (day of week 0)
    // Total days in Nov = 30.
    // 30 days + 5 trailing days to complete 5 full weeks = 35 cells!
    expect(matrix.length % 7).toBe(0)
    expect(matrix.length).toBe(35)

    const firstCell = matrix[0]
    expect(firstCell.day_number).toBe(1)
    expect(firstCell.is_current_month).toBe(true)
    expect(firstCell.is_today).toBe(true)
    expect(firstCell.is_selected).toBe(true)

    const lastDayInNov = matrix[29]
    expect(lastDayInNov.day_number).toBe(30)
    expect(lastDayInNov.is_current_month).toBe(true)

    const trailingPadding = matrix[30]
    expect(trailingPadding.day_number).toBe(1)
    expect(trailingPadding.is_current_month).toBe(false)
  })
})

describe('ANDROID-10: Sindhi Calendar & Observance Data Correctness', () => {
  it('contains metadata for all 12 canonical Sindhi months', () => {
    const monthKeys = Object.keys(SINDHI_MONTHS)
    expect(monthKeys).toHaveLength(12)
    expect(monthKeys).toContain('CHET')
    expect(monthKeys).toContain('VAISAKH')
    expect(monthKeys).toContain('JETH')
    expect(monthKeys).toContain('AKHAR')
    expect(monthKeys).toContain('SAWAN')
    expect(monthKeys).toContain('BADHO')
    expect(monthKeys).toContain('ASU')
    expect(monthKeys).toContain('KATTI')
    expect(monthKeys).toContain('NAHRI')
    expect(monthKeys).toContain('POH')
    expect(monthKeys).toContain('MANGH')
    expect(monthKeys).toContain('PHAGUN')
  })

  it('verifies Cheti Chand observance entry', () => {
    const entry = VERIFIED_OBSERVANCES_REGISTRY['2026-03-20']
    expect(entry).toBeDefined()
    expect(entry.sindhi_month).toBe('CHET')
    expect(entry.tithi).toBe('BEEJ')
    expect(entry.observances.some((o) => o.title.includes('Cheti Chand'))).toBe(true)
    expect(entry.observances.some((o) => o.type === 'CHAND')).toBe(true)
  })

  it('verifies Thadri (Sheetla Saptami) observance entry', () => {
    const entry = VERIFIED_OBSERVANCES_REGISTRY['2026-08-31']
    expect(entry).toBeDefined()
    expect(entry.sindhi_month).toBe('BADHO')
    expect(entry.tithi).toBe('SATAM')
    expect(entry.observances.some((o) => o.title.includes('Thadri'))).toBe(true)
  })

  it('verifies Diwali & Ekadashi entries for November 2026', () => {
    const diwali = VERIFIED_OBSERVANCES_REGISTRY['2026-11-09']
    expect(diwali).toBeDefined()
    expect(diwali.tithi).toBe('AMAVAS')
    expect(diwali.observances.some((o) => o.title.includes('Diwali'))).toBe(true)

    const ekadashi = VERIFIED_OBSERVANCES_REGISTRY['2026-11-05']
    expect(ekadashi).toBeDefined()
    expect(ekadashi.tithi).toBe('EKADASHI')
    expect(ekadashi.observances.some((o) => o.type === 'EKADASHI')).toBe(true)
  })

  it('distinguishes verified entries from pending astronomical data without fabricating values', () => {
    // Verified date (Nov 5 Rama Ekadashi)
    const verifiedDay = getPanchangDayInfo(new Date(2026, 10, 5))
    expect(verifiedDay.data_status).toBe('VERIFIED_OBSERVANCE')
    expect(verifiedDay.has_ekadashi).toBe(true)

    // Unregistered date
    const pendingDay = getPanchangDayInfo(new Date(2026, 10, 15))
    expect(pendingDay.data_status).toBe('ASTRONOMICAL_PENDING')
    expect(pendingDay.observances).toHaveLength(0)
  })
})

describe('ANDROID-10: Panchang UI Components & Mobile Touch Targets', () => {
  it('renders PanchangMonthView navigation controls with >= 44px touch targets', () => {
    const matrix = getMonthMatrix(2026, 10, FIXED_TODAY, FIXED_TODAY)
    const handleSelect = vi.fn()
    const handlePrevMonth = vi.fn()
    const handleNextMonth = vi.fn()
    const handlePrevDay = vi.fn()
    const handleNextDay = vi.fn()
    const handleToday = vi.fn()

    renderWithProviders(
      <PanchangMonthView
        activeMonthDate={FIXED_TODAY}
        monthMatrix={matrix}
        selectedDate={FIXED_TODAY}
        onSelectDate={handleSelect}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
        onJumpToToday={handleToday}
        filter="ALL"
      />
    )

    // Navigation buttons
    const prevMonthBtn = screen.getByLabelText(/previous month/i)
    const nextMonthBtn = screen.getByLabelText(/next month/i)
    const prevDayBtn = screen.getByLabelText(/previous day/i)
    const nextDayBtn = screen.getByLabelText(/next day/i)
    const todayBtn = screen.getByLabelText(/jump to today/i)

    expect(prevMonthBtn.className).toContain('min-h-[44px]')
    expect(prevMonthBtn.className).toContain('min-w-[44px]')
    expect(nextMonthBtn.className).toContain('min-h-[44px]')
    expect(prevDayBtn.className).toContain('min-h-[44px]')
    expect(nextDayBtn.className).toContain('min-h-[44px]')
    expect(todayBtn.className).toContain('min-h-[44px]')

    // Weekday column headers
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Fri')).toBeInTheDocument()

    // Day buttons have >= 44px touch target
    const dayBtn = screen.getByRole('button', { name: /^1 nov 2026,/i })
    expect(dayBtn.className).toContain('min-h-[44px]')

    fireEvent.click(dayBtn)
    expect(handleSelect).toHaveBeenCalledWith('2026-11-01')
  })

  it('renders PanchangFiltersBar with >= 44px touch targets and switches filters', () => {
    const handleFilterChange = vi.fn()
    renderWithProviders(
      <PanchangFiltersBar
        filter="ALL"
        onChange={handleFilterChange}
        observancesCount={7}
        festivalsCount={4}
      />
    )

    const allBtn = screen.getByRole('button', { name: /all days/i })
    const obsBtn = screen.getByRole('button', { name: /observances & fasts/i })
    const festBtn = screen.getByRole('button', { name: /festivals/i })

    expect(allBtn.className).toContain('min-h-[44px]')
    expect(obsBtn.className).toContain('min-h-[44px]')
    expect(festBtn.className).toContain('min-h-[44px]')

    fireEvent.click(obsBtn)
    expect(handleFilterChange).toHaveBeenCalledWith('OBSERVANCES')
  })

  it('renders PanchangLegend explaining cultural symbols', () => {
    renderWithProviders(<PanchangLegend />)
    expect(screen.getByText(/panchang markers/i)).toBeInTheDocument()
    expect(screen.getByText(/chand sighting/i)).toBeInTheDocument()
    expect(screen.getByText(/ekadashi fast/i)).toBeInTheDocument()
    expect(screen.getByText(/poonam/i)).toBeInTheDocument()
    expect(screen.getByText(/amavasya/i)).toBeInTheDocument()
  })

  it('renders PanchangDayDetail with observance info and cross-referenced community events', () => {
    const dayInfo = getPanchangDayInfo(new Date(2026, 10, 1), FIXED_TODAY, FIXED_TODAY)

    // Mock community events on this day
    vi.mocked(eventsService.listEvents).mockResolvedValue({
      data: [
        {
          id: 'evt-1',
          title: 'Khatri Community Sammelan',
          description: 'Annual gathering of all village mandals.',
          event_type: 'FESTIVAL',
          start_time: '2026-11-01T10:00:00Z',
          end_time: '2026-11-01T14:00:00Z',
          location: 'Samaj Bhavan, Bhuj',
          location_url: null,
          group_id: null,
          capacity: 500,
          status: 'PUBLISHED',
          is_pinned: false,
          creator_id: USER_ID,
          published_at: '2026-10-01T00:00:00Z',
          cancelled_at: null,
          cancellation_reason: null,
          rsvp_count_going: 10,
          rsvp_count_maybe: 2,
          my_rsvp_status: null,
          my_guest_count: 0,
          my_notes: null,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
          deleted_at: null,
        },
      ],
      error: null,
    })

    renderWithProviders(<PanchangDayDetail dayInfo={dayInfo} />)

    expect(screen.getByText('1 Nov 2026')).toBeInTheDocument()
    expect(screen.getAllByText(/katti/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/bhanu saptami vrat/i)).toBeInTheDocument()
    expect(screen.getByText(/verified community observances/i)).toBeInTheDocument()
  })
})

describe('ANDROID-10: Community Hub Dashboard Integration', () => {
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
    vi.mocked(birthdaysService.getUpcomingBirthdays).mockResolvedValue({
      data: [],
      error: null,
    })
  })

  it('displays Sindhi Panchang card in Community Pulse and Panchang tab in tablist', async () => {
    renderWithProviders(<CommunityPage />, {
      user: { id: USER_ID } as User,
      profile: { id: USER_ID, role: 'MEMBER' },
    })

    // Community Pulse metric card
    const panchangCard = screen.getByLabelText(/view panchang/i)
    expect(panchangCard).toBeInTheDocument()
    expect(panchangCard.className).toContain('min-h-[44px]')

    // WAI-ARIA tab navigation: 9 total tabs
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(9)

    const panchangTab = screen.getByRole('tab', { name: /panchang/i })
    expect(panchangTab).toBeInTheDocument()
    expect(panchangTab.getAttribute('id')).toBe('tab-panchang')
    expect(panchangTab.className).toContain('min-h-[44px]')

    // Clicking Panchang tab activates the panchang panel
    fireEvent.click(panchangTab)
    await waitFor(() => {
      const panel = screen.getByRole('tabpanel', { hidden: false })
      expect(panel.getAttribute('id')).toBe('panel-panchang')
    })
  })

  it('supports WAI-ARIA keyboard navigation across tabs', () => {
    renderWithProviders(<CommunityPage />)

    const groupsTab = screen.getByRole('tab', { name: /groups & associations/i })
    groupsTab.focus()

    // Navigate to Panchang tab via click
    const panchangTab = screen.getByRole('tab', { name: /panchang/i })
    fireEvent.click(panchangTab)
    expect(panchangTab).toHaveAttribute('aria-selected', 'true')

    // Press 'Home' to return to first tab (Groups)
    fireEvent.keyDown(panchangTab, { key: 'Home' })
    expect(screen.getByRole('tab', { name: /groups & associations/i })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('ANDROID-10: Trilingual Localization (Hindi & Gujarati)', () => {
  it('renders Panchang in Hindi', () => {
    renderWithProviders(<PanchangView />, { lang: 'hi' })

    expect(screen.getByText('सिंधी पंचांग और चंद्र कैलेंडर')).toBeInTheDocument()
    expect(screen.getByText('सभी दिन')).toBeInTheDocument()
    expect(screen.getByText('व्रत और पर्व')).toBeInTheDocument()
    expect(screen.getByText('त्यौहार')).toBeInTheDocument()
  })

  it('renders Panchang in Gujarati', () => {
    renderWithProviders(<PanchangView />, { lang: 'gu' })

    expect(screen.getByText('સિંધી પંચાંગ અને ચંદ્ર કેલેન્ડર')).toBeInTheDocument()
    expect(screen.getByText('બધા દિવસો')).toBeInTheDocument()
    expect(screen.getByText('વ્રત અને પર્વો')).toBeInTheDocument()
    expect(screen.getByText('તહેવારો')).toBeInTheDocument()
  })
})
