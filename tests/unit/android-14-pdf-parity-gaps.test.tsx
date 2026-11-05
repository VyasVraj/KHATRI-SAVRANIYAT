/**
 * ANDROID-14: Remaining PDF Gaps & Mobile/PWA Visual/Interaction Parity Tests
 *
 * Verifies:
 * 1. MobileBottomNav renders 4 tabs with >= 48px touch targets, safe-area insets, and tour hooks.
 * 2. AppTourOverlay controls (Close, Skip, Next, Done) meet >= 44px touch targets and fallback safely.
 * 3. AppTourReplayButton enforces >= 44px touch target.
 * 4. DirectoryPagination buttons enforce >= 44px touch target.
 * 5. PersonDirectoryCard and FamilyDirectoryCard quick action buttons enforce >= 44px touch target.
 * 6. NotificationFilterTabs and NotificationItemRow action buttons enforce >= 44px touch target.
 * 7. NotificationDetailModal close and action buttons enforce >= 44px touch target.
 * 8. Shared Button and Input components enforce >= 44px touch targets.
 * 9. Trilingual localization (English, Hindi, Gujarati) across navigation and mobile controls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { AppTourOverlay, AppTourReplayButton, TourProvider, useTour } from '@/features/onboarding'
import { DirectoryPagination } from '@/features/discover/components/DirectoryPagination'
import { PersonDirectoryCard } from '@/features/discover/components/PersonDirectoryCard'
import { FamilyDirectoryCard } from '@/features/discover/components/FamilyDirectoryCard'
import { NotificationFilterTabs } from '@/features/notifications/components/NotificationFilterTabs'
import { NotificationItemRow } from '@/features/notifications/components/NotificationItemRow'
import { NotificationDetailModal } from '@/features/notifications/components/NotificationDetailModal'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import { LanguageProvider } from '@/features/i18n'
import type { PersonDiscoveryResult, FamilyDiscoveryResult } from '@/features/discover/types'
import type { NotificationItem } from '@/features/notifications/types'

const MOCK_PERSON: PersonDiscoveryResult = {
  id: 'person-test-1',
  first_name: 'Rahul',
  middle_name: 'K',
  last_name: 'Khatri',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1985-06-15',
  date_of_death: null,
  birth_place: 'Palanpur, Gujarat',
  gotra: 'Khatri',
  nukh: 'Janiyani',
  kul: 'Brahma',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
}

const MOCK_FAMILY: FamilyDiscoveryResult = {
  id: 'family-test-1',
  family_name: 'Khatri Parivar',
  description: 'Ancestral family unit from Palanpur',
  city: 'Palanpur',
  state: 'Gujarat',
  country: 'India',
  gotra: 'Khatri',
  nukh: 'Janiyani',
  kul: 'Brahma',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
}

const MOCK_NOTIFICATION: NotificationItem = {
  id: 'notif-test-1',
  recipient_id: 'user-123',
  actor_id: null,
  category: 'COMMUNITY',
  type: 'ANNOUNCEMENT_NEW',
  title: 'Community Gathering Notice',
  body: 'Annual general community assembly scheduled for next Sunday.',
  action_url: '/community',
  entity_type: null,
  entity_id: null,
  metadata: { sender_name: 'Panchayat Secretariat', audience: 'all' },
  read_at: null,
  created_at: '2026-11-01T10:00:00Z',
  deleted_at: null,
}

describe('ANDROID-14: Remaining PDF Gaps & Mobile/PWA Visual/Interaction Parity', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // 1. MobileBottomNav Tests
  // ---------------------------------------------------------------------------
  describe('1. MobileBottomNav Component (Android Screens 00–49)', () => {
    it('renders all 4 primary navigation tabs with >= 48px touch targets', () => {
      render(
        <MemoryRouter initialEntries={['/discover']}>
          <LanguageProvider>
            <MobileBottomNav />
          </LanguageProvider>
        </MemoryRouter>
      )

      const nav = screen.getByRole('navigation', { name: /mobile bottom navigation/i })
      expect(nav).toBeInTheDocument()
      expect(nav.className).toContain('safe-bottom')
      expect(nav.className).toContain('md:hidden')

      const links = screen.getAllByRole('link')
      expect(links).toHaveLength(4)

      links.forEach((link) => {
        expect(link.className).toContain('min-h-[48px]')
        expect(link.className).toContain('min-w-[48px]')
      })
    })

    it('attaches data-tour-target attributes for App Tour integration', () => {
      render(
        <MemoryRouter initialEntries={['/community']}>
          <LanguageProvider>
            <MobileBottomNav />
          </LanguageProvider>
        </MemoryRouter>
      )

      expect(document.querySelector('[data-tour-target="nav-discover"]')).toBeInTheDocument()
      expect(document.querySelector('[data-tour-target="nav-my-family"]')).toBeInTheDocument()
      expect(document.querySelector('[data-tour-target="nav-community"]')).toBeInTheDocument()
      expect(document.querySelector('[data-tour-target="nav-profile"]')).toBeInTheDocument()
    })

    it('marks the active tab with aria-current="page"', () => {
      render(
        <MemoryRouter initialEntries={['/community']}>
          <LanguageProvider>
            <MobileBottomNav />
          </LanguageProvider>
        </MemoryRouter>
      )

      const activeLink = screen.getByRole('link', { name: /community/i })
      expect(activeLink).toHaveAttribute('aria-current', 'page')
    })
  })

  // ---------------------------------------------------------------------------
  // 2. App Tour Touch Targets & Fallbacks
  // ---------------------------------------------------------------------------
  describe('2. AppTourOverlay & Replay Button Touch Targets', () => {
    function TourTestHelper() {
      const { startTour } = useTour()
      return (
        <div>
          <button onClick={startTour}>Start</button>
          <AppTourOverlay />
        </div>
      )
    }

    it('renders AppTourOverlay close, skip, and next buttons with >= 44px touch targets', () => {
      render(
        <LanguageProvider>
          <TourProvider autoStart={false}>
            <TourTestHelper />
          </TourProvider>
        </LanguageProvider>
      )

      fireEvent.click(screen.getByRole('button', { name: 'Start' }))

      const closeBtn = screen.getByRole('button', { name: /close/i })
      expect(closeBtn.className).toContain('min-h-[44px]')
      expect(closeBtn.className).toContain('min-w-[44px]')

      const skipBtn = screen.getByRole('button', { name: /skip/i })
      expect(skipBtn.className).toContain('min-h-[44px]')

      const nextBtn = screen.getByRole('button', { name: /next/i })
      expect(nextBtn.className).toContain('min-h-[44px]')
    })

    it('AppTourReplayButton button variant enforces >= 44px touch target', () => {
      render(
        <LanguageProvider>
          <TourProvider autoStart={false}>
            <AppTourReplayButton variant="button" />
          </TourProvider>
        </LanguageProvider>
      )

      const replayBtn = screen.getByRole('button', { name: /replay.*tour/i })
      expect(replayBtn.className).toContain('min-h-[44px]')
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Directory Pagination Touch Targets
  // ---------------------------------------------------------------------------
  describe('3. DirectoryPagination Touch Targets', () => {
    it('renders previous and next pagination buttons with >= 44px touch targets', () => {
      render(
        <LanguageProvider>
          <DirectoryPagination
            page={2}
            hasPreviousPage={true}
            hasNextPage={true}
            onPageChange={vi.fn()}
          />
        </LanguageProvider>
      )

      const prevBtn = screen.getByRole('button', { name: /previous/i })
      const nextBtn = screen.getByRole('button', { name: /next/i })

      expect(prevBtn.className).toContain('min-h-[44px]')
      expect(nextBtn.className).toContain('min-h-[44px]')
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Directory Cards Quick Actions Touch Targets
  // ---------------------------------------------------------------------------
  describe('4. Person & Family Directory Cards Quick Actions', () => {
    it('PersonDirectoryCard quick action buttons enforce >= 44px touch targets', () => {
      render(
        <MemoryRouter>
          <LanguageProvider>
            <PersonDirectoryCard person={MOCK_PERSON} />
          </LanguageProvider>
        </MemoryRouter>
      )

      const profileBtn = screen.getByRole('button', { name: /view profile/i })
      const treeBtn = screen.getByRole('button', { name: /family tree/i })

      expect(profileBtn.className).toContain('min-h-[44px]')
      expect(treeBtn.className).toContain('min-h-[44px]')
    })

    it('FamilyDirectoryCard quick action buttons enforce >= 44px touch targets', () => {
      render(
        <MemoryRouter>
          <LanguageProvider>
            <FamilyDirectoryCard family={MOCK_FAMILY} />
          </LanguageProvider>
        </MemoryRouter>
      )

      const familyBtn = screen.getByRole('button', { name: /view family/i })
      const treeBtn = screen.getByRole('button', { name: /family tree/i })

      expect(familyBtn.className).toContain('min-h-[44px]')
      expect(treeBtn.className).toContain('min-h-[44px]')
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Notifications Filters & Rows Touch Targets
  // ---------------------------------------------------------------------------
  describe('5. Notifications Filter Tabs & Item Rows Touch Targets', () => {
    it('NotificationFilterTabs primary and subcategory tabs enforce >= 44px touch targets', () => {
      render(
        <NotificationFilterTabs
          activeTab="SYSTEM"
          onSelectTab={vi.fn()}
          selectedSubCategory="ALL"
          onSelectSubCategory={vi.fn()}
        />
      )

      const tabs = screen.getAllByRole('tab')
      tabs.forEach((tab) => {
        expect(tab.className).toContain('min-h-[44px]')
      })

      const subButtons = screen.getAllByRole('button')
      subButtons.forEach((btn) => {
        expect(btn.className).toContain('min-h-[44px]')
      })
    })

    it('NotificationItemRow mark-read and dismiss buttons enforce >= 44px touch targets', () => {
      render(
        <MemoryRouter>
          <NotificationItemRow
            notification={MOCK_NOTIFICATION}
            onMarkRead={vi.fn()}
            onDismiss={vi.fn()}
          />
        </MemoryRouter>
      )

      const markReadBtn = screen.getByRole('button', { name: /mark notification as read/i })
      const dismissBtn = screen.getByRole('button', { name: /dismiss notification/i })

      expect(markReadBtn.className).toContain('min-h-[44px]')
      expect(markReadBtn.className).toContain('min-w-[44px]')
      expect(dismissBtn.className).toContain('min-h-[44px]')
      expect(dismissBtn.className).toContain('min-w-[44px]')
    })

    it('NotificationDetailModal close and action buttons enforce >= 44px touch targets', () => {
      render(
        <MemoryRouter>
          <NotificationDetailModal
            notification={MOCK_NOTIFICATION}
            isOpen={true}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      )

      const closeHeaderBtn = screen.getByRole('button', { name: /close dialog/i })
      expect(closeHeaderBtn.className).toContain('min-h-[44px]')
      expect(closeHeaderBtn.className).toContain('min-w-[44px]')

      const closeFooterBtn = screen.getByRole('button', { name: /^close$/i })
      expect(closeFooterBtn.className).toContain('min-h-[44px]')

      const actionBtn = screen.getByRole('button', { name: /view details/i })
      expect(actionBtn.className).toContain('min-h-[44px]')
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Shared Button and Input Component Touch Targets
  // ---------------------------------------------------------------------------
  describe('6. Shared Form Controls Touch Targets', () => {
    it('Button default size md enforces >= 44px touch target', () => {
      render(<Button>Submit Action</Button>)
      const btn = screen.getByRole('button', { name: 'Submit Action' })
      expect(btn.className).toContain('min-h-[44px]')
    })

    it('Input component enforces >= 44px touch target', () => {
      render(<Input label="Test Field" placeholder="Enter text" />)
      const input = screen.getByPlaceholderText('Enter text')
      expect(input.className).toContain('min-h-[44px]')
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Trilingual Localization
  // ---------------------------------------------------------------------------
  describe('7. Trilingual Localization across Navigation & Mobile Controls', () => {
    it('renders Hindi navigation labels accurately', () => {
      window.localStorage.setItem('app_language', 'hi')

      render(
        <MemoryRouter initialEntries={['/discover']}>
          <LanguageProvider defaultLanguage="hi">
            <MobileBottomNav />
          </LanguageProvider>
        </MemoryRouter>
      )

      expect(screen.getByText('खोजें')).toBeInTheDocument()
      expect(screen.getByText('मेरा परिवार')).toBeInTheDocument()
      expect(screen.getByText('समाज')).toBeInTheDocument()
      expect(screen.getByText('प्रोफ़ाइल')).toBeInTheDocument()
    })

    it('renders Gujarati navigation labels accurately', () => {
      window.localStorage.setItem('app_language', 'gu')

      render(
        <MemoryRouter initialEntries={['/discover']}>
          <LanguageProvider defaultLanguage="gu">
            <MobileBottomNav />
          </LanguageProvider>
        </MemoryRouter>
      )

      expect(screen.getByText('શોધો')).toBeInTheDocument()
      expect(screen.getByText('મારું પરિવાર')).toBeInTheDocument()
      expect(screen.getByText('સમાજ')).toBeInTheDocument()
      expect(screen.getByText('પ્રોફાઇલ')).toBeInTheDocument()
    })
  })
})
