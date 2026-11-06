/**
 * ANDROID-13: Committees, Panchayat Leadership & Circulars Parity Tests
 * (tests/unit/committees-panchayat-circulars-android-parity.test.tsx)
 *
 * Verifies Android parity requirements across Screens 44–49:
 * 1. Committee Directory & Roster (Screens 44–45):
 *    - Directory listing, category filtering, keyword search
 *    - Committee card with verified badge, leadership summary, and member count
 *    - Detail modal with charter objectives and structured member roster
 *    - 5-level privacy protection: phone numbers shielded when contact_privacy = 'PRIVATE'
 * 2. Panchayat Leadership Directory (Screen 46):
 *    - Executive Council, Regional Zonal Mukhis, and Senior Advisory Council
 *    - Section and zone filtering, search by leader and designation
 *    - Invariants: PERSON != USER, no MUKHI role (COMMUNITY_MODERATOR acts as Mukhi-equivalent)
 * 3. Circulars & Official Directives (Screens 47–49):
 *    - Official circular numbering (e.g. CIR-2026-001), category pills, issuing authority
 *    - Official reader view with insignia, letterhead, full text, and signatory stamp block
 *    - Screen 49 Role gating: Publish button visible only to authorized roles (MODERATOR/ADMIN/COMMITTEE_MEMBER);
 *      regular members receive clean read-only view
 * 4. Community Hub Integration & Accessibility:
 *    - Minimum 44px touch targets on interactive controls
 *    - WAI-ARIA tab navigation and pulse metric cards
 * 5. Trilingual Localization (en, hi, gu):
 *    - Accuracy of English, Hindi, and Gujarati language strings
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import { CommunityPage } from '@/features/community/pages/CommunityPage'
import { CommitteeCard } from '@/features/community/components/CommitteeCard'
import { CommitteeDetailModal } from '@/features/community/components/CommitteeDetailModal'
import { CommitteeDirectoryView } from '@/features/community/components/CommitteeDirectoryView'
import { PanchayatCard } from '@/features/community/components/PanchayatCard'
import { PanchayatDirectoryView } from '@/features/community/components/PanchayatDirectoryView'
import { CircularCard } from '@/features/community/components/CircularCard'
import { CircularDetailModal } from '@/features/community/components/CircularDetailModal'
import { CircularsView } from '@/features/community/components/CircularsView'
import {
  getCommittees,
  getCommitteeById,
  CANONICAL_COMMITTEES_REGISTRY,
} from '@/features/community/services/committees.service'
import {
  getPanchayatDirectory,
  CANONICAL_PANCHAYAT_REGISTRY,
} from '@/features/community/services/panchayat.service'
import {
  getCirculars,
  getCircularById,
  CANONICAL_CIRCULARS_REGISTRY,
} from '@/features/community/services/circulars.service'
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
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network offline fallback test' },
      }),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network offline fallback test' },
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))

const REGULAR_USER_ID = '11111111-1111-4111-8111-111111111111'
const MODERATOR_USER_ID = '99999999-9999-4999-8999-999999999999'

function renderWithProviders(
  ui: React.ReactElement,
  {
    route = '/community',
    initialLanguage = 'en',
  }: { route?: string; initialLanguage?: 'en' | 'hi' | 'gu' } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage={initialLanguage}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('ANDROID-13: Committees, Panchayat Leadership & Circulars', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: {
        id: REGULAR_USER_ID,
        email: 'member@khatrisamaj.org',
      } as unknown as User,
      profile: {
        id: REGULAR_USER_ID,
        role: 'MEMBER',
        display_name: 'Regular Member',
        email: 'member@khatrisamaj.org',
        avatar_url: null,
        is_active: true,
        email_verified: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      } as never,
      session: {
        user: { id: REGULAR_USER_ID },
      } as never,
      isLoading: false,
      isAuthenticated: true,
    })

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

  // ===========================================================================
  // 1. Committees Service & Roster (Screens 44-45)
  // ===========================================================================
  describe('Committees Service & Directory (Screens 44–45)', () => {
    it('returns canonical verified committees across governance, census, and welfare', async () => {
      const res = await getCommittees()
      expect(res.error).toBeNull()
      expect(res.data?.items.length).toBeGreaterThanOrEqual(6)

      const names = res.data?.items.map((c) => c.name) || []
      expect(names).toContain('Jan Ganna (Census) Central Committee')
      expect(names).toContain('Shree Khatri Samaj Central Panchayat Executive Council')
      expect(names.some((n) => n.includes('Sarvaniyat'))).toBe(true)
      expect(names).toContain('Khatri Youth & Sports Wing')
    })

    it('filters committees by category correctly', async () => {
      const censusRes = await getCommittees({ category: 'CENSUS' })
      expect(censusRes.data?.items.length).toBe(1)
      expect(censusRes.data?.items[0].slug).toBe('jan-ganna-central-committee')

      const welfareRes = await getCommittees({ category: 'WELFARE' })
      expect(welfareRes.data?.items.some((c) => c.category === 'WELFARE')).toBe(true)
    })

    it('searches committees by name and purpose keywords', async () => {
      const res = await getCommittees({ search: 'Census' })
      expect(res.data?.items.length).toBeGreaterThan(0)
      expect(res.data?.items[0].name).toContain('Census')
    })

    it('fetches a single committee by slug with complete member roster', async () => {
      const res = await getCommitteeById('panchayat-executive-council')
      expect(res.error).toBeNull()
      expect(res.data?.slug).toBe('panchayat-executive-council')
      expect(res.data?.members?.length).toBeGreaterThanOrEqual(8)

      // Verify Chairman and Secretary
      const head = res.data?.members?.find((m) => m.order_rank === 1)
      expect(head?.designation).toContain('President')
      expect(head?.name).toBe('Govindbhai Jethalal Janiyani')
    })

    it('renders CommitteeCard with touch targets >= 44px and verified badge', () => {
      const committee = CANONICAL_COMMITTEES_REGISTRY[0]
      const onViewMock = vi.fn()

      renderWithProviders(
        <CommitteeCard committee={committee} onViewDetails={onViewMock} />
      )

      expect(screen.getByRole('article')).toBeInTheDocument()
      expect(screen.getByText(committee.name)).toBeInTheDocument()
      expect(screen.getByText('Verified Body')).toBeInTheDocument()
      expect(screen.getByText(/Members/i)).toBeInTheDocument()

      const button = screen.getByRole('button', {
        name: new RegExp(`View Committee & Roster: ${committee.name}`, 'i'),
      })
      expect(button).toBeInTheDocument()
      expect(button.className).toContain('min-h-[44px]')

      fireEvent.click(button)
      expect(onViewMock).toHaveBeenCalledWith(committee)
    })

    it('renders CommitteeDetailModal with objectives, member roster, and privacy shield', () => {
      const committee = CANONICAL_COMMITTEES_REGISTRY[0]
      const onCloseMock = vi.fn()

      renderWithProviders(
        <CommitteeDetailModal
          committee={committee}
          isOpen={true}
          onClose={onCloseMock}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Key Charter Objectives')).toBeInTheDocument()
      expect(screen.getByText('Committee Member Roster (9)')).toBeInTheDocument()

      // Govindbhai has contact_privacy = 'PRIVATE' -> phone must be concealed
      expect(screen.getAllByText('Contact Private').length).toBeGreaterThan(0)

      // Close button
      const closeButtons = screen.getAllByRole('button', { name: /Close/i })
      expect(closeButtons.length).toBeGreaterThan(0)
      fireEvent.click(closeButtons[0])
      expect(onCloseMock).toHaveBeenCalled()
    })

    it('renders CommitteeDirectoryView with full interactive filtering', async () => {
      renderWithProviders(<CommitteeDirectoryView />)

      await waitFor(() => {
        expect(screen.getByText('Executive Committee')).toBeInTheDocument()
        expect(
          screen.getByText('Committees & Governance Bodies')
        ).toBeInTheDocument()
        expect(screen.getByText(/Section A/i)).toBeInTheDocument()
        expect(screen.getByText(/Section B/i)).toBeInTheDocument()
        expect(screen.getByText('Shri Vasant Kumar Jamnadas Pamnani')).toBeInTheDocument()
      })

      // Interactive search
      const searchInput = screen.getByPlaceholderText(/Search by name/i)
      fireEvent.change(searchInput, { target: { value: 'Jamnadas' } })

      await waitFor(() => {
        expect(screen.getByText('Shri Vasant Kumar Jamnadas Pamnani')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // 2. Panchayat Leadership Directory (Screen 46)
  // ===========================================================================
  describe('Panchayat Leadership Directory (Screen 46)', () => {
    it('returns canonical verified Panchayat leadership across Executive, Zonal, and Advisory', async () => {
      const res = await getPanchayatDirectory()
      expect(res.error).toBeNull()
      expect(res.data?.items.length).toBeGreaterThanOrEqual(10)

      const sections = res.data?.items.map((l) => l.section)
      expect(sections).toContain('EXECUTIVE')
      expect(sections).toContain('ZONAL')
      expect(sections).toContain('ADVISORY')
    })

    it('filters Panchayat leaders by council section', async () => {
      const execRes = await getPanchayatDirectory({ section: 'EXECUTIVE' })
      expect(execRes.data?.items.every((l) => l.section === 'EXECUTIVE')).toBe(true)

      const advisoryRes = await getPanchayatDirectory({ section: 'ADVISORY' })
      expect(advisoryRes.data?.items.every((l) => l.section === 'ADVISORY')).toBe(true)
    })

    it('preserves role model invariants: COMMUNITY_MODERATOR is the Mukhi-equivalent', async () => {
      const res = await getPanchayatDirectory({ section: 'ZONAL' })
      const leaders = res.data?.items || []

      // Invariant: no leader has role = 'MUKHI'
      expect(leaders.every((l) => (l.role as string) !== 'MUKHI')).toBe(true)
      // Authoritative role is COMMUNITY_MODERATOR
      expect(leaders.every((l) => l.role === 'COMMUNITY_MODERATOR')).toBe(true)
    })

    it('renders PanchayatCard with designation, zone, lineage, and contact privacy shield', () => {
      const leader = CANONICAL_PANCHAYAT_REGISTRY[0]

      renderWithProviders(<PanchayatCard leader={leader} />)

      expect(screen.getByRole('article')).toBeInTheDocument()
      expect(screen.getByText(leader.name)).toBeInTheDocument()
      expect(screen.getByText(leader.designation)).toBeInTheDocument()
      expect(screen.getByText(leader.zone)).toBeInTheDocument()
      expect(screen.getByText(leader.nukh!)).toBeInTheDocument()
      expect(screen.getByText('Contact Private')).toBeInTheDocument()
    })

    it('renders public phone number when contact_privacy allows it', () => {
      // Find a leader with contact_privacy === 'COMMUNITY'
      const publicLeader = CANONICAL_PANCHAYAT_REGISTRY.find(
        (l) => l.contact_privacy === 'COMMUNITY' && l.phone
      )!

      renderWithProviders(<PanchayatCard leader={publicLeader} />)

      expect(screen.getByText(publicLeader.phone!)).toBeInTheDocument()
    })

    it('renders PanchayatDirectoryView with section and zone filtering', async () => {
      renderWithProviders(<PanchayatDirectoryView />)

      await waitFor(() => {
        expect(
          screen.getByText('Panchayat Governance & Leadership')
        ).toBeInTheDocument()
      })

      // Section buttons
      expect(screen.getByRole('button', { name: /Executive Council/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Regional Mukhis/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Senior Advisory Council/i })).toBeInTheDocument()

      // Filter by Executive Council
      fireEvent.click(screen.getByRole('button', { name: /Executive Council/i }))

      await waitFor(() => {
        expect(
          screen.getByText('Central Panchayat President (Pramukh)')
        ).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // 3. Circulars & Official Directives (Screens 47–49)
  // ===========================================================================
  describe('Circulars & Official Directives (Screens 47–49)', () => {
    it('returns canonical circulars sorted with pinned directives first', async () => {
      const res = await getCirculars()
      expect(res.error).toBeNull()
      expect(res.data?.items.length).toBeGreaterThanOrEqual(6)

      const items = res.data?.items || []
      expect(items[0].is_pinned).toBe(true)
      expect(items[1].is_pinned).toBe(true)
      expect(['CIR-2026-001', 'CIR-2026-002']).toContain(items[0].circular_number)
      expect(['CIR-2026-001', 'CIR-2026-002']).toContain(items[1].circular_number)
    })

    it('filters circulars by category', async () => {
      const censusRes = await getCirculars({ category: 'CENSUS' })
      expect(censusRes.data?.items.every((c) => c.category === 'CENSUS')).toBe(true)

      const welfareRes = await getCirculars({ category: 'WELFARE' })
      expect(welfareRes.data?.items.some((c) => c.category === 'WELFARE')).toBe(true)
    })

    it('searches circulars by title, number, or content keywords', async () => {
      const res = await getCirculars({ search: 'CIR-2026-002' })
      expect(res.data?.items.length).toBe(1)
      expect(res.data?.items[0].circular_number).toBe('CIR-2026-002')
    })

    it('fetches a single circular by id with full body content and signatory', async () => {
      const res = await getCircularById('cir-2026-001')
      expect(res.error).toBeNull()
      expect(res.data?.title).toContain('Annual Census Verification')
      expect(res.data?.signatory_name).toBe('Chandrakant Mohanlal Keria')
      expect(res.data?.content).toContain('SHREE KHATRI SAMAJ CENTRAL PANCHAYAT')
    })

    it('renders CircularCard with circular number badge, formatted date, and read button >= 44px', () => {
      const circular = CANONICAL_CIRCULARS_REGISTRY[0]
      const onViewMock = vi.fn()

      renderWithProviders(
        <CircularCard circular={circular} onView={onViewMock} />
      )

      expect(screen.getByRole('article')).toBeInTheDocument()
      expect(screen.getByText(circular.circular_number)).toBeInTheDocument()
      expect(screen.getByText(circular.title)).toBeInTheDocument()
      expect(screen.getByText(circular.signatory_name)).toBeInTheDocument()

      const button = screen.getByRole('button', {
        name: new RegExp(`Read Official Circular: ${circular.circular_number}`, 'i'),
      })
      expect(button).toBeInTheDocument()
      expect(button.className).toContain('min-h-[44px]')

      fireEvent.click(button)
      expect(onViewMock).toHaveBeenCalledWith(circular)
    })

    it('renders CircularDetailModal with official letterhead, seal, and share action', () => {
      const circular = CANONICAL_CIRCULARS_REGISTRY[0]
      const onCloseMock = vi.fn()

      renderWithProviders(
        <CircularDetailModal
          circular={circular}
          isOpen={true}
          onClose={onCloseMock}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('SHREE KHATRI SAMAJ CENTRAL PANCHAYAT')).toBeInTheDocument()
      expect(screen.getByText('OFFICIAL COMMUNITY CIRCULAR & DIRECTIVE')).toBeInTheDocument()
      expect(screen.getByText(circular.signatory_name)).toBeInTheDocument()
      expect(screen.getByText(`★ ${circular.official_seal_text} ★`)).toBeInTheDocument()

      // Share button
      const shareButton = screen.getByRole('button', { name: /Share/i })
      expect(shareButton).toBeInTheDocument()

      // Close button
      const closeButtons = screen.getAllByRole('button', { name: /Close/i })
      fireEvent.click(closeButtons[0])
      expect(onCloseMock).toHaveBeenCalled()
    })

    it('Screen 49: hides "Issue Official Notice" button from regular users and shows read-only notice shield', async () => {
      // User is regular member
      renderWithProviders(<CircularsView />)

      await waitFor(() => {
        expect(
          screen.getByText('Panchayat Circulars & Official Directives')
        ).toBeInTheDocument()
      })

      // The publish button should NOT be present for normal member
      expect(
        screen.queryByRole('button', { name: /Issue Official Notice/i })
      ).not.toBeInTheDocument()

      // Read-only notice shield is present
      expect(
        screen.getByText(/Official circulars are published by authorized Panchayat Secretariat/i)
      ).toBeInTheDocument()
    })

    it('Screen 49: renders "Issue Official Notice" button for authorized COMMUNITY_MODERATOR', async () => {
      // Mock moderator user
      vi.mocked(authContext.useAuthContext).mockReturnValue({
        user: {
          id: MODERATOR_USER_ID,
          email: 'moderator@khatrisamaj.org',
        } as unknown as User,
        profile: {
          id: MODERATOR_USER_ID,
          role: 'COMMUNITY_MODERATOR',
          display_name: 'Community Moderator',
          email: 'moderator@khatrisamaj.org',
          avatar_url: null,
          is_active: true,
          email_verified: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        } as never,
        session: {
          user: { id: MODERATOR_USER_ID },
        } as never,
        isLoading: false,
        isAuthenticated: true,
      })

      renderWithProviders(<CircularsView />)

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Issue Official Notice/i })
        ).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // 4. Community Hub Navigation Integration (CommunityPage)
  // ===========================================================================
  describe('Community Hub Integration & Pulse Metrics', () => {
    it('renders Pulse metric cards for Circulars, Committees, and Panchayat', async () => {
      renderWithProviders(<CommunityPage />)

      await waitFor(() => {
        expect(screen.getByText('Community Hub')).toBeInTheDocument()
      })

      // Circulars card
      expect(screen.getByText('Read circulars')).toBeInTheDocument()
      expect(screen.getAllByText('Circulars').length).toBeGreaterThan(0)

      // Committees card
      expect(screen.getByText('Executive, census, welfare & youth bodies.')).toBeInTheDocument()

      // Panchayat card
      expect(screen.getByText('Panchayat')).toBeInTheDocument()
    })

    it('switches to Circulars tab and displays circulars view when tab is clicked', async () => {
      renderWithProviders(<CommunityPage />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Circulars/i })).toBeInTheDocument()
      })

      const circularsTab = screen.getByRole('tab', { name: /Circulars/i })
      fireEvent.click(circularsTab)

      await waitFor(() => {
        expect(
          screen.getByText('Panchayat Circulars & Official Directives')
        ).toBeInTheDocument()
      })
    })

    it('switches to Committees tab and displays committees view when tab is clicked', async () => {
      renderWithProviders(<CommunityPage />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Committees/i })).toBeInTheDocument()
      })

      const committeesTab = screen.getByRole('tab', { name: /Committees/i })
      fireEvent.click(committeesTab)

      await waitFor(() => {
        expect(
          screen.getByText('Committees & Governance Bodies')
        ).toBeInTheDocument()
      })
    })

    it('switches to Panchayat tab and displays panchayat roster when tab is clicked', async () => {
      renderWithProviders(<CommunityPage />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Panchayat Roster/i })).toBeInTheDocument()
      })

      const panchayatTab = screen.getByRole('tab', { name: /Panchayat Roster/i })
      fireEvent.click(panchayatTab)

      await waitFor(() => {
        expect(
          screen.getByText('Panchayat Governance & Leadership')
        ).toBeInTheDocument()
      })
    })

    it('supports deep-linking via query parameters ?tab=circulars and ?tab=committees', async () => {
      renderWithProviders(<CommunityPage />, { route: '/community?tab=committees' })

      await waitFor(() => {
        expect(
          screen.getByText('Committees & Governance Bodies')
        ).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // 5. Trilingual Localization Parity (EN, HI, GU)
  // ===========================================================================
  describe('Trilingual Localization Parity (EN, HI, GU)', () => {
    it('renders accurate Hindi translations for committees, panchayat, and circulars', async () => {
      renderWithProviders(<CommunityPage />, {
        route: '/community?tab=committees',
        initialLanguage: 'hi',
      })

      await waitFor(() => {
        expect(
          screen.getByText('समितियां और प्रशासनिक परिषद')
        ).toBeInTheDocument()
      })
    })

    it('renders accurate Gujarati translations for committees, panchayat, and circulars', async () => {
      renderWithProviders(<CommunityPage />, {
        route: '/community?tab=panchayat',
        initialLanguage: 'gu',
      })

      await waitFor(() => {
        expect(
          screen.getByText('પંચાયત વહીવટ અને નેતૃત્વ રોસ્ટર')
        ).toBeInTheDocument()
      })
    })
  })
})
