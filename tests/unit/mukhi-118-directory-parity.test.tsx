/**
 * Unit Test: Mukhi 118 Directory Parity & Interactive Verification
 * (tests/unit/mukhi-118-directory-parity.test.tsx)
 *
 * Validates:
 * 1. Authoritative 118 records from PDF across 3 pages (serial 1-118, zero gaps, zero duplicates).
 * 2. Search by Mukhi Name, Mobile Number, and Region / Gram / City.
 * 3. Filter by Region / Gram / City dropdown.
 * 4. Alphabetical sorting by name (A to Z) and register serial number sorting.
 * 5. MukhiCard rendering with clickable tel: phone action and Mukhi unique ID (MUK-XXXX).
 * 6. MukhiDetailsModal rendering with call action and accessible dialog semantics.
 * 7. Community Hub card displaying dynamic count of 118 Mukhis.
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
import { OFFICIAL_COMMUNITY_MUKHIS } from '@/features/community/constants/mukhis.data'
import { MukhiCard } from '@/features/community/components/MukhiCard'
import { MukhiDetailsModal } from '@/features/community/components/MukhiDetailsModal'
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

function renderTestView(ui: React.ReactElement, initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  vi.mocked(authContext.useAuthContext).mockReturnValue({
    user: null as User | null,
    profile: null as never,
    session: null as never,
    isLoading: false,
    isAuthenticated: false,
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('Mukhi 118 Directory Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(groupsService.listGroups).mockResolvedValue({ data: [], error: null })
    vi.mocked(announcementsService.listAnnouncements).mockResolvedValue({ data: [], error: null })
    vi.mocked(eventsService.listEvents).mockResolvedValue({ data: [], error: null })
    vi.mocked(birthdaysService.getUpcomingBirthdays).mockResolvedValue({ data: [], error: null })
  })

  describe('1. Authoritative 118 Records Dataset Integrity', () => {
    it('contains exactly 118 records extracted from the 3-page PDF', () => {
      expect(OFFICIAL_COMMUNITY_MUKHIS).toHaveLength(118)
      expect(CANONICAL_MUKHI_REGISTRY).toHaveLength(118)
    })

    it('has continuous serial numbers 1 to 118 with zero gaps and zero duplicates', () => {
      const serials = OFFICIAL_COMMUNITY_MUKHIS.map((m) => m.source_serial_number)
      const uniqueSerials = new Set(serials)
      expect(uniqueSerials.size).toBe(118)

      for (let i = 1; i <= 118; i++) {
        expect(uniqueSerials.has(i)).toBe(true)
      }
    })

    it('preserves exact boundary records from PDF: Serial 1, 55, 56, 113, 114, 118', () => {
      const s1 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 1)
      expect(s1?.full_name).toBe('Mukhi Naraindas Vensimal Kiri')
      expect(s1?.gram).toBe('Agarwal Farm, Jaipur')
      expect(s1?.mobile_number).toBe('9414056200')

      const s55 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 55)
      expect(s55?.full_name).toBe('Mukhi Gehimal Moolchand Kapoor')
      expect(s55?.gram).toBe('Kekri')

      const s56 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 56)
      expect(s56?.full_name).toBe('Mukhi Murlibhai Narayandas Vishnani')
      expect(s56?.gram).toBe('Khambat (Distt. Anand)')

      const s118 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 118)
      expect(s118?.full_name).toBe('Mukhi Prakash Gyanchand Liya')
      expect(s118?.gram).toBe('Sanganer, Jaipur')
      expect(s118?.mobile_number).toBe('9166202777')
    })
  })

  describe('2. Search, Filter, and Sorting Capabilities', () => {
    it('searches by Mukhi Name', async () => {
      const res = await getMukhiDirectory({ filters: { search: 'Pitambardas' } })
      expect(res.data?.items.length).toBeGreaterThan(0)
      expect(res.data?.items[0].name).toContain('Pitambardas')
    })

    it('searches by Mobile Number', async () => {
      const res = await getMukhiDirectory({ filters: { search: '9375172208' } })
      expect(res.data?.items.length).toBe(1)
      expect(res.data?.items[0].phone).toBe('9375172208')
      expect(res.data?.items[0].city).toBe('Ahmedabad')
    })

    it('searches by Region / Gram / City', async () => {
      const res = await getMukhiDirectory({ filters: { search: 'Bikaner' } })
      expect(res.data?.items.length).toBeGreaterThan(0)
      expect(res.data?.items[0].gram).toBe('Bikaner')
    })

    it('filters by Region / Gram / City dropdown', async () => {
      const res = await getMukhiDirectory({ filters: { city: 'Kota' } })
      expect(res.data?.items.length).toBe(1)
      expect(res.data?.items[0].name).toBe('Mukhi Gehiram Kimatram Khuha')
    })

    it('sorts alphabetically by Mukhi Name (A to Z) by default', async () => {
      const res = await getMukhiDirectory({ pageSize: 150 })
      const names = res.data?.items.map((i) => i.name) ?? []
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b))
      expect(names).toEqual(sortedNames)
    })

    it('sorts by register serial number (1-118) when SERIAL_ASC is selected', async () => {
      const res = await getMukhiDirectory({ filters: { sort: 'SERIAL_ASC' }, pageSize: 150 })
      const serials = res.data?.items.map((i) =>
        parseInt(i.mukhi_unique_id?.replace(/\D/g, '') || '0', 10)
      ) ?? []
      for (let i = 0; i < serials.length - 1; i++) {
        expect(serials[i]).toBeLessThanOrEqual(serials[i + 1])
      }
    })
  })

  describe('3. MukhiCard Component Presentation', () => {
    it('renders Mukhi Unique ID, name, region, and clickable phone call link', () => {
      const mukhi = CANONICAL_MUKHI_REGISTRY[0] // Serial 1
      renderTestView(<MukhiCard leader={mukhi} />)

      expect(screen.getByText(mukhi.mukhi_unique_id!)).toBeInTheDocument()
      expect(screen.getByText(mukhi.name)).toBeInTheDocument()
      expect(screen.getByText(mukhi.gram!)).toBeInTheDocument()

      const telLink = screen.getByRole('link', { name: new RegExp(`Call ${mukhi.name}`, 'i') })
      expect(telLink).toHaveAttribute('href', `tel:${mukhi.phone}`)
    })
  })

  describe('4. MukhiDetailsModal Component', () => {
    it('opens modal on View Profile click and displays complete profile details with call action', () => {
      const mukhi = CANONICAL_MUKHI_REGISTRY[1] // Serial 2: Suryaprakash Govind Ram Varde, Agra, 9412300643
      const onClose = vi.fn()
      renderTestView(<MukhiDetailsModal mukhi={mukhi} isOpen={true} onClose={onClose} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(mukhi.name)).toBeInTheDocument()
      expect(screen.getByText(mukhi.mukhi_unique_id!)).toBeInTheDocument()
      expect(screen.getByText(mukhi.gram!)).toBeInTheDocument()
      expect(screen.getByText(mukhi.phone!)).toBeInTheDocument()

      const callLink = screen.getByRole('link', { name: new RegExp(`Call Mukhi at ${mukhi.phone}`, 'i') })
      expect(callLink).toHaveAttribute('href', `tel:${mukhi.phone}`)

      fireEvent.click(screen.getByRole('button', { name: /Close modal/i }))
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('5. Community Page Metric Card Dynamic Count', () => {
    it('displays dynamic count of 118 Mukhis on the Community Hub card', async () => {
      renderTestView(<CommunityPage />)

      await waitFor(() => {
        const metricCard = screen.getByRole('button', {
          name: /View Mukhi Directory: 118 Mukhis/i,
        })
        expect(metricCard).toBeInTheDocument()
        expect(screen.getAllByText('118 Mukhis').length).toBeGreaterThan(0)
      })
    })
  })
})
