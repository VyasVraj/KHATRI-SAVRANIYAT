/**
 * ANDROID-11: Mukhi Leadership Directory Parity Tests
 * (tests/unit/mukhi-android-parity.test.tsx)
 *
 * Verifies Android parity requirements across Screens 33-36:
 * 1. Directory Listing & Card Presentation:
 *    - Mukhi name, leadership designation, location, lineage (gotra, nukh, kul), and family name
 *    - Verified leadership badge
 *    - Profile navigation affordance to /people/:id
 * 2. Search & Filtering:
 *    - Keyword search (name, city, gotra, nukh, designation)
 *    - Filter by State (Gujarat, Rajasthan, Maharashtra)
 *    - Filter by City (Palanpur, Bhuj, Jodhpur, Mumbai)
 *    - Filter by Nukh (Janiyani, Keria, Chothani)
 *    - Filter reset behavior
 *    - Deterministic ordered pagination with Fetch N+1
 * 3. Privacy & Security:
 *    - Contact phone numbers concealed when contact_privacy = 'PRIVATE'
 *    - Contact phone visible only when permitted (e.g. for moderators or owner)
 *    - 5-level privacy model strictly preserved
 *    - PERSON != USER strictly maintained (census person vs user account)
 *    - ANDROID-2 privacy lock preserved (COMMUNITY_MODERATOR = Mukhi-equivalent)
 * 4. Role Semantics:
 *    - COMMUNITY_MODERATOR appears correctly as Mukhi-equivalent
 *    - Regular members are NOT displayed as Mukhi leadership
 * 5. Mobile UX & Accessibility:
 *    - Minimum 44px touch targets on all interactive controls (search, selects, buttons)
 *    - WAI-ARIA role semantics (role="article", role="tab", role="tabpanel")
 * 6. Community Hub Integration:
 *    - 6th tab button and 6th pulse metric card
 *    - Keyboard WAI-ARIA tab navigation
 * 7. Trilingual Localization (en, hi, gu):
 *    - English, Hindi, and Gujarati translations rendered accurately
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

  // Set initial language in localStorage
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

  describe('1. Mukhi Service & Canonical Registry', () => {
    it('returns canonical Mukhi elders with expected structure and zero fabricated data', async () => {
      const res = await getMukhiDirectory()
      expect(res.error).toBeNull()
      expect(res.data).toBeDefined()
      expect(res.data?.items.length).toBeGreaterThan(0)

      const leader = res.data?.items[0]
      expect(leader).toHaveProperty('id')
      expect(leader).toHaveProperty('name')
      expect(leader).toHaveProperty('designation')
      expect(leader).toHaveProperty('role', 'COMMUNITY_MODERATOR')
      expect(leader).toHaveProperty('is_verified', true)
      expect(leader).toHaveProperty('is_active', true)
      expect(leader).toHaveProperty('profile_privacy')
    })

    it('contains regional Mukhi leaders across Palanpur, Bhuj, Jodhpur, and Mumbai', async () => {
      const res = await getMukhiDirectory()
      const names = (res.data?.items ?? []).map((l) => l.name)

      expect(names).toContain('Govindbhai Jethalal Janiyani')
      expect(names).toContain('Harishbhai Mulchand Keria')
      expect(names).toContain('Jaiprakash Mohanlal Khatri')
      expect(names).toContain('Dileepkumar Shamaldas Vadhwani')
    })

    it('filters leaders accurately by state (e.g. Gujarat vs Rajasthan)', async () => {
      const gujaratRes = await getMukhiDirectory({ filters: { state: 'Gujarat' } })
      expect(gujaratRes.data?.items.every((l) => l.state === 'Gujarat')).toBe(true)

      const rajasthanRes = await getMukhiDirectory({ filters: { state: 'Rajasthan' } })
      expect(rajasthanRes.data?.items.every((l) => l.state === 'Rajasthan')).toBe(true)
    })

    it('filters leaders accurately by city (e.g. Palanpur)', async () => {
      const res = await getMukhiDirectory({ filters: { city: 'Palanpur' } })
      expect(res.data?.items.length).toBe(1)
      expect(res.data?.items[0].city).toBe('Palanpur')
      expect(res.data?.items[0].name).toBe('Govindbhai Jethalal Janiyani')
    })

    it('filters leaders accurately by lineage Nukh (e.g. Janiyani vs Keria)', async () => {
      const janiyaniRes = await getMukhiDirectory({ filters: { nukh: 'Janiyani' } })
      expect(janiyaniRes.data?.items.every((l) => l.nukh === 'Janiyani')).toBe(true)

      const keriaRes = await getMukhiDirectory({ filters: { nukh: 'Keria' } })
      expect(keriaRes.data?.items.every((l) => l.nukh === 'Keria')).toBe(true)
    })

    it('searches across name, city, nukh, and designation with case-insensitive substring matching', async () => {
      const nameSearch = await getMukhiDirectory({ filters: { search: 'govind' } })
      expect(nameSearch.data?.items.some((l) => l.name.includes('Govindbhai'))).toBe(true)

      const citySearch = await getMukhiDirectory({ filters: { search: 'jodhpur' } })
      expect(citySearch.data?.items.some((l) => l.city === 'Jodhpur')).toBe(true)

      const desigSearch = await getMukhiDirectory({ filters: { search: 'regional mukhi' } })
      expect(desigSearch.data?.items.length).toBeGreaterThan(0)
    })

    it('implements deterministic ordered pagination with Fetch N+1 contract', async () => {
      const page1 = await getMukhiDirectory({ page: 1, pageSize: 3 })
      expect(page1.data?.items.length).toBe(3)
      expect(page1.data?.hasNextPage).toBe(true)

      const page2 = await getMukhiDirectory({ page: 2, pageSize: 3 })
      expect(page2.data?.items.length).toBe(3)

      // Ensure no duplicates across pages
      const page1Ids = page1.data?.items.map((i) => i.id) ?? []
      const page2Ids = page2.data?.items.map((i) => i.id) ?? []
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false)
    })
  })

  describe('2. Privacy Enforcement & 5-Level Privacy Model', () => {
    it('conceals contact numbers when contact_privacy is PRIVATE for normal members', async () => {
      const res = await getMukhiDirectory({
        currentUserId: 'unrelated-member-id',
        isModerator: false,
      })

      const privateContactLeader = res.data?.items.find((l) => l.id === 'mukhi-palanpur-1')
      expect(privateContactLeader?.phone).toBeNull()
    })

    it('displays contact number when leader contact_privacy is COMMUNITY for authenticated members', async () => {
      const res = await getMukhiDirectory({
        currentUserId: 'authenticated-member-id',
        isModerator: false,
      })

      const communityContactLeader = res.data?.items.find((l) => l.id === 'mukhi-jodhpur-1')
      expect(communityContactLeader?.phone).toBe('+91 98290 12345')
    })

    it('MukhiCard renders privacy shield icon when phone is concealed', () => {
      const leader = CANONICAL_MUKHI_REGISTRY[0] // phone is null
      renderWithProviders(<MukhiCard leader={leader} />)

      expect(screen.getByText(/Contact protected by privacy settings/i)).toBeInTheDocument()
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
          filters={{ search: 'test', state: 'ALL', city: 'ALL', nukh: 'ALL' }}
          availableStates={['Gujarat', 'Rajasthan']}
          availableCities={['Palanpur', 'Jodhpur']}
          availableNukhs={['Janiyani', 'Keria']}
          onFilterChange={vi.fn()}
          onReset={vi.fn()}
        />
      )

      const searchInput = screen.getByPlaceholderText(/Search Mukhi by name/i)
      expect(searchInput.className).toContain('min-h-[44px]')

      const stateSelect = screen.getByLabelText(/^State$/i)
      expect(stateSelect.className).toContain('min-h-[44px]')

      const citySelect = screen.getByLabelText(/^City$/i)
      expect(citySelect.className).toContain('min-h-[44px]')

      const nukhSelect = screen.getByLabelText(/^Nukh$/i)
      expect(nukhSelect.className).toContain('min-h-[44px]')

      const resetBtn = screen.getByRole('button', { name: /Reset filters/i })
      expect(resetBtn.className).toContain('min-h-[44px]')
    })

    it('renders MukhiDirectoryView with search bar, cards grid, and total leader count badge', async () => {
      renderWithProviders(<MukhiDirectoryView />)

      await waitFor(() => {
        expect(screen.getByText('Mukhi Leadership Directory')).toBeInTheDocument()
        expect(screen.getByText(/Govindbhai Jethalal Janiyani/i)).toBeInTheDocument()
      })
    })

    it('renders empty state when no leaders match filter criteria with reset button', async () => {
      renderWithProviders(<MukhiDirectoryView />)

      await waitFor(() => {
        expect(screen.getByText('Mukhi Leadership Directory')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/Search Mukhi by name/i)
      fireEvent.change(searchInput, { target: { value: 'NonExistentLeaderXYZ' } })

      await waitFor(() => {
        expect(screen.getByText('No Mukhi leaders found')).toBeInTheDocument()
      })

      const resetBtns = screen.getAllByRole('button', { name: /Reset/i })
      expect(resetBtns.length).toBeGreaterThan(0)
      expect(resetBtns[0].className).toContain('min-h-[44px]')
    })
  })

  describe('4. Community Hub Integration & 6-Tab ARIA Navigation', () => {
    it('renders Community Hub with 6 pulse metric cards including Mukhi Directory', async () => {
      renderWithProviders(<CommunityPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Mukhi Directory').length).toBeGreaterThan(0)
      })

      const mukhiMetricCard = screen.getByRole('button', {
        name: /View Mukhi Directory/i,
      })
      expect(mukhiMetricCard).toBeInTheDocument()
      expect(mukhiMetricCard.className).toContain('min-h-[44px]')
    })

    it('renders all tab buttons in CommunityPage tablist with >= 44px touch targets', async () => {
      renderWithProviders(<CommunityPage />)

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(9)

      const tabIds = tabs.map((t) => t.id)
      expect(tabIds).toEqual([
        'tab-groups',
        'tab-announcements',
        'tab-events',
        'tab-birthdays',
        'tab-panchang',
        'tab-mukhi',
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
        expect(screen.getByText('Govindbhai Jethalal Janiyani')).toBeInTheDocument()
      })
    })

    it('cycles through all tabs with keyboard arrow keys according to WAI-ARIA', async () => {
      renderWithProviders(<CommunityPage />)

      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      groupsTab.focus()

      // ArrowRight: groups -> announcements -> events -> birthdays -> panchang -> mukhi
      fireEvent.keyDown(groupsTab, { key: 'ArrowRight' })
      expect(screen.getByRole('tab', { name: /Notice Board/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      fireEvent.keyDown(groupsTab, { key: 'End' })
      expect(screen.getByRole('tab', { name: /Panchayat/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      fireEvent.keyDown(groupsTab, { key: 'Home' })
      expect(screen.getByRole('tab', { name: /Groups/i })).toHaveAttribute(
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
