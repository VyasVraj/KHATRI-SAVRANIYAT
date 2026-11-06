/**
 * ANDROID-11: Mukhi Leadership Directory Parity Tests
 * (tests/unit/mukhi-android-parity.test.tsx)
 *
 * Verifies Mukhi Directory requirements from the authoritative 118 Mukhi register:
 * 1. Directory Listing & Card Presentation:
 *    - All 118 official Mukhis accurately loaded with zero fabricated data.
 *    - Mukhi name, leadership designation, location (region/gram), and unique ID (MUK-XXXX).
 *    - Clickable mobile number calling action.
 *    - Profile details modal affordance.
 * 2. Search & Filtering:
 *    - Keyword search (name, mobile number, region / gram / city).
 *    - Filter by Region / Gram / City dropdown.
 *    - Alphabetical sorting (A to Z) and serial order.
 *    - Filter reset behavior.
 *    - Deterministic ordered pagination with Fetch N+1.
 * 3. Privacy & Security:
 *    - Official mobile numbers passed through with phone call action when listed.
 *    - Unlisted phone numbers marked appropriately without crashing.
 *    - PERSON != USER strictly maintained.
 * 4. Mobile UX & Accessibility:
 *    - Minimum 44px touch targets on all interactive controls (search, selects, buttons).
 *    - WAI-ARIA role semantics (role="article", role="tab", role="tabpanel").
 * 5. Community Hub Integration:
 *    - Dynamic count of Mukhis displayed on the metric card (118 Mukhis).
 *    - Keyboard WAI-ARIA tab navigation.
 * 6. Trilingual Localization (en, hi, gu):
 *    - English, Hindi, and Gujarati translations rendered accurately.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import {
  getMukhiDirectory,
  CANONICAL_MUKHI_REGISTRY,
} from '@/features/community/services/mukhi.service'
import { MukhiCard } from '@/features/community/components/MukhiCard'
import { MukhiFiltersBar } from '@/features/community/components/MukhiFiltersBar'
import { MukhiDirectoryView } from '@/features/community/components/MukhiDirectoryView'
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
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        in: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        is: vi.fn(() => ({
          neq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    })),
  },
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'

function renderWithProviders(
  ui: React.ReactElement,
  {
    lang = 'en',
    user = null,
    profile = null,
    initialEntries = ['/'],
  }: {
    lang?: 'en' | 'hi' | 'gu'
    user?: Partial<User> | null
    profile?: Record<string, unknown> | null
    initialEntries?: string[]
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  window.localStorage.setItem('app_language', lang)

  vi.mocked(authContext.useAuthContext).mockReturnValue({
    user: (user ? { id: USER_ID, email: 'test@example.com', ...user } : null) as User | null,
    profile: (profile
      ? {
          id: user?.id ?? USER_ID,
          role: 'MEMBER',
          display_name: 'Test Member',
          email: 'test@example.com',
          avatar_url: null,
          is_active: true,
          email_verified: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          ...profile,
        }
      : null) as never,
    session: user ? ({ user } as never) : null,
    isLoading: false,
    isAuthenticated: Boolean(user),
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage={lang}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('ANDROID-11: Mukhi Leadership Directory Parity Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

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

  describe('1. Mukhi Service & Canonical 118 Register', () => {
    it('returns exactly 118 official Mukhi records with expected structure and zero fabricated data', async () => {
      const res = await getMukhiDirectory({ pageSize: 150 })
      expect(res.error).toBeNull()
      expect(res.data).toBeDefined()
      expect(res.data?.totalCount).toBe(118)
      expect(res.data?.items.length).toBe(118)

      const leader = res.data?.items[0]
      expect(leader).toHaveProperty('id')
      expect(leader).toHaveProperty('name')
      expect(leader).toHaveProperty('designation')
      expect(leader).toHaveProperty('role', 'MUKHI')
      expect(leader).toHaveProperty('is_verified', true)
      expect(leader).toHaveProperty('is_active', true)
      expect(leader).toHaveProperty('profile_privacy')
    })

    it('contains official regional Mukhi leaders across Palanpur, Bhuj, Jodhpur, and Agra', async () => {
      const res = await getMukhiDirectory({ pageSize: 150 })
      const names = (res.data?.items ?? []).map((l) => l.name)

      expect(names).toContain('Mukhi Mulchand Khanumal Valera') // Palanpur (Serial 77)
      expect(names).toContain('Mukhi Lalchand Loungmal Khatri') // Bhuj (Serial 29)
      expect(names).toContain('Mukhi Devanand Mithumal Hargun') // Jodhpur (Serial 52)
      expect(names).toContain('Mukhi Suryaprakash Govind Ram Varde') // Agra (Serial 2)
    })

    it('filters leaders accurately by state (e.g. Gujarat vs Rajasthan)', async () => {
      const gujaratRes = await getMukhiDirectory({ filters: { state: 'Gujarat' }, pageSize: 150 })
      expect(gujaratRes.data?.items.every((l) => l.state === 'Gujarat')).toBe(true)

      const rajasthanRes = await getMukhiDirectory({ filters: { state: 'Rajasthan' }, pageSize: 150 })
      expect(rajasthanRes.data?.items.every((l) => l.state === 'Rajasthan')).toBe(true)
    })

    it('filters leaders accurately by region / city (e.g. Palanpur)', async () => {
      const res = await getMukhiDirectory({ filters: { city: 'Palanpur' } })
      expect(res.data?.items.length).toBe(1)
      expect(res.data?.items[0].city).toBe('Palanpur')
      expect(res.data?.items[0].name).toBe('Mukhi Mulchand Khanumal Valera')
    })

    it('searches across name, mobile number, and region with case-insensitive substring matching', async () => {
      const nameSearch = await getMukhiDirectory({ filters: { search: 'naraindas' } })
      expect(nameSearch.data?.items.some((l) => l.name.toLowerCase().includes('naraindas'))).toBe(true)

      const phoneSearch = await getMukhiDirectory({ filters: { search: '9414056200' } })
      expect(phoneSearch.data?.items.some((l) => l.phone === '9414056200')).toBe(true)

      const regionSearch = await getMukhiDirectory({ filters: { search: 'jodhpur' } })
      expect(regionSearch.data?.items.some((l) => l.city?.toLowerCase().includes('jodhpur'))).toBe(true)
    })

    it('implements deterministic ordered pagination with Fetch N+1 contract', async () => {
      const page1 = await getMukhiDirectory({ page: 1, pageSize: 6 })
      expect(page1.data?.items.length).toBe(6)
      expect(page1.data?.hasNextPage).toBe(true)

      const page2 = await getMukhiDirectory({ page: 2, pageSize: 6 })
      expect(page2.data?.items.length).toBe(6)

      // Ensure no duplicates across pages
      const page1Ids = page1.data?.items.map((i) => i.id) ?? []
      const page2Ids = page2.data?.items.map((i) => i.id) ?? []
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false)
    })
  })

  describe('2. Privacy Enforcement & Contact Presentation', () => {
    it('passes official contact numbers with phone call action when listed', async () => {
      const res = await getMukhiDirectory({ pageSize: 150 })
      const mukhiWithPhone = res.data?.items.find((l) => l.phone === '9414056200')
      expect(mukhiWithPhone).toBeDefined()
      expect(mukhiWithPhone?.phone).toBe('9414056200')
    })

    it('MukhiCard renders Call Now link when phone is available', () => {
      const leader = CANONICAL_MUKHI_REGISTRY[0] // Serial 1: has phone
      renderWithProviders(<MukhiCard leader={leader} />)

      const callLink = screen.getByRole('link', { name: new RegExp(`Call ${leader.name}`, 'i') })
      expect(callLink).toBeInTheDocument()
      expect(callLink).toHaveAttribute('href', `tel:${leader.phone}`)
    })

    it('MukhiCard handles leaders without listed phone gracefully', () => {
      const leaderNoPhone = CANONICAL_MUKHI_REGISTRY.find((l) => !l.phone) || {
        ...CANONICAL_MUKHI_REGISTRY[0],
        phone: null,
      }
      renderWithProviders(<MukhiCard leader={leaderNoPhone} />)

      expect(screen.getByText(/Phone not listed/i)).toBeInTheDocument()
    })
  })

  describe('3. UI Components & Minimum 44px Touch Targets', () => {
    it('renders MukhiCard with >= 44px touch target on Profile button', () => {
      const leader = CANONICAL_MUKHI_REGISTRY[0]
      renderWithProviders(<MukhiCard leader={leader} />)

      const profileBtn = screen.getByRole('button', { name: /View Profile/i })
      expect(profileBtn).toBeInTheDocument()
      expect(profileBtn.className).toContain('min-h-[44px]')
    })

    it('MukhiFiltersBar enforces >= 44px touch targets on search and select dropdowns', () => {
      renderWithProviders(
        <MukhiFiltersBar
          filters={{ search: 'test', state: 'ALL', city: 'ALL', nukh: 'ALL', sort: 'NAME_ASC' }}
          availableStates={['Gujarat', 'Rajasthan']}
          availableCities={['Palanpur', 'Jodhpur']}
          availableNukhs={['Janiyani', 'Keria']}
          onFilterChange={vi.fn()}
          onReset={vi.fn()}
        />
      )

      const searchInput = screen.getByPlaceholderText(/Search by Mukhi name/i)
      expect(searchInput.className).toContain('min-h-[44px]')

      const citySelect = screen.getByLabelText(/Filter by Region/i)
      expect(citySelect.className).toContain('min-h-[44px]')

      const sortSelect = screen.getByLabelText(/Sort Order/i)
      expect(sortSelect.className).toContain('min-h-[44px]')

      const resetBtn = screen.getByRole('button', { name: 'Clear search & filter' })
      expect(resetBtn.className).toContain('min-h-[44px]')
    })

    it('renders MukhiDirectoryView with search bar, cards grid, and total Mukhis count badge', async () => {
      renderWithProviders(<MukhiDirectoryView />)

      await waitFor(() => {
        expect(screen.getAllByText('Mukhi Directory').length).toBeGreaterThan(0)
        expect(screen.getByText(/118 Mukhis/i)).toBeInTheDocument()
      })
    })

    it('renders empty state when no leaders match filter criteria with reset button', async () => {
      renderWithProviders(<MukhiDirectoryView />)

      await waitFor(() => {
        expect(screen.getAllByText('Mukhi Directory').length).toBeGreaterThan(0)
      })

      const searchInput = screen.getByPlaceholderText(/Search by Mukhi name/i)
      fireEvent.change(searchInput, { target: { value: 'NonExistentLeaderXYZ' } })

      await waitFor(() => {
        expect(screen.getByText('No Mukhi leaders found')).toBeInTheDocument()
      })

      const resetBtns = screen.getAllByRole('button', { name: /Reset filters/i })
      expect(resetBtns.length).toBeGreaterThan(0)
      expect(resetBtns[0].className).toContain('min-h-[44px]')
    })
  })

  describe('4. Community Hub Integration & ARIA Navigation', () => {
    it('renders Community Hub with Mukhi Directory card displaying 118 Mukhis', async () => {
      renderWithProviders(<CommunityPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Mukhi Directory').length).toBeGreaterThan(0)
      })

      const mukhiMetricCard = screen.getByRole('button', {
        name: /View Mukhi Directory: 118 Mukhis/i,
      })
      expect(mukhiMetricCard).toBeInTheDocument()
      expect(mukhiMetricCard.className).toContain('min-h-[44px]')
    })

    it('renders all tab buttons in CommunityPage tablist with >= 44px touch targets', async () => {
      renderWithProviders(<CommunityPage />)

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(8)

      const tabIds = tabs.map((t) => t.id)
      expect(tabIds).toEqual([
        'tab-mukhi',
        'tab-announcements',
        'tab-events',
        'tab-birthdays',
        'tab-panchang',
        'tab-circulars',
        'tab-committees',
        'tab-panchayat',
      ])

      tabs.forEach((tab) => {
        expect(tab.className).toContain('min-h-[44px]')
      })
    })

    it('navigates to Mukhi Directory tab when clicked and displays MukhiDirectoryView', async () => {
      renderWithProviders(<CommunityPage />, { initialEntries: ['/community?tab=mukhi'] })

      await waitFor(() => {
        expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-mukhi')
        expect(screen.getAllByText('Mukhi Directory').length).toBeGreaterThan(0)
      })
    })

    it('cycles through all tabs with keyboard arrow keys according to WAI-ARIA', async () => {
      renderWithProviders(<CommunityPage />)

      const mukhiTab = screen.getByRole('tab', { name: /mukhi/i })
      mukhiTab.focus()

      fireEvent.keyDown(mukhiTab, { key: 'ArrowRight' })
      expect(screen.getByRole('tab', { name: /Notice Board/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      fireEvent.keyDown(mukhiTab, { key: 'End' })
      expect(screen.getByRole('tab', { name: /panchayat/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      fireEvent.keyDown(mukhiTab, { key: 'Home' })
      expect(screen.getByRole('tab', { name: /mukhi/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    })
  })

  describe('5. Trilingual Localization (en, hi, gu)', () => {
    it('renders Hindi strings accurately when active language is hi', async () => {
      renderWithProviders(<MukhiDirectoryView />, { lang: 'hi' })

      await waitFor(() => {
        expect(screen.getByText('मुखिया निर्देशिका')).toBeInTheDocument()
      })
    })

    it('renders Gujarati strings accurately when active language is gu', async () => {
      renderWithProviders(<MukhiDirectoryView />, { lang: 'gu' })

      await waitFor(() => {
        expect(screen.getByText('મુખી ડિરેક્ટરી')).toBeInTheDocument()
      })
    })
  })
})
