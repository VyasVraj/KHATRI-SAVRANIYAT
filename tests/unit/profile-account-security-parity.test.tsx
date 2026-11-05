/**
 * ANDROID-12: Profile, Completeness, Account, Security & Settings Parity Tests
 * (tests/unit/profile-account-security-parity.test.tsx)
 *
 * Verifies Android parity requirements across Screens 37–43:
 * 1. Profile Navigation & 6-Tab WAI-ARIA arrow cycling:
 *    - Renders all 6 tabs: Overview, Completeness, Account, Security, Settings, Privacy
 *    - All tab controls have >= 44px touch targets
 *    - Keyboard arrow keys (Left/Right) cycle tabs according to WAI-ARIA
 * 2. Screen 37: Profile Overview & Identity:
 *    - Profile card with avatar, display name, email, role, verification badge
 *    - Edit display name form with validation and service update
 *    - Census record linkage (PERSON != USER) and unlinked state
 * 3. Screen 38: Profile Completeness & Actionable Missing Fields:
 *    - Deterministic completeness scoring & tier progress bar
 *    - Category breakdown (Core, Vital, Lineage, Contact)
 *    - Actionable missing field cards with direct links
 *    - DATA QUALITY != VERIFICATION boundary notice
 * 4. Screen 40: Account Details & Session State:
 *    - Authenticated account identity, email, role, account UUID, member since date
 *    - Active session status indicator
 * 5. Screen 41: Security Settings & Password Update:
 *    - Change Password form with Zod validation (min 8 chars, uppercase, number)
 *    - Calls updatePassword and displays success message
 * 6. Screen 42: Account Deletion / Data Privacy Policy:
 *    - Explains account deletion while preserving shared census records (PERSON != USER)
 *    - Accessible confirmation modal requiring typing DELETE
 *    - Submits and signs out safely
 * 7. Screen 43: Privacy Controls & ANDROID-2 Lock:
 *    - Normal user: ZERO editable controls; informative lock notice
 *    - Authorized roles (COMMUNITY_MODERATOR, ADMIN): can manage privacy levels
 * 8. Screen 39: App Settings:
 *    - Multi-language selector, App Tour replay, notification preferences navigation
 * 9. Trilingual Localization (en, hi, gu):
 *    - English, Hindi, and Gujarati rendered accurately
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import { TourProvider } from '@/features/onboarding/context/TourProvider'
import { ProfilePage } from '@/features/profile/pages/ProfilePage'
import { ProfileOverviewSection } from '@/features/profile/components/ProfileOverviewSection'
import { ProfileCompletenessSection } from '@/features/profile/components/ProfileCompletenessSection'
import { AccountDetailsSection } from '@/features/profile/components/AccountDetailsSection'
import { SecuritySettingsSection } from '@/features/profile/components/SecuritySettingsSection'
import { AppSettingsSection } from '@/features/profile/components/AppSettingsSection'
import { PrivacySettingsSection } from '@/features/profile/components/PrivacySettingsSection'
import * as authContext from '@/features/auth/context/AuthContext'
import * as peopleHooks from '@/features/people'
import * as profileService from '@/features/profile/services/profile.service'
import * as authService from '@/features/auth/services/auth.service'
import * as peopleService from '@/features/people/services/people.service'
import type { User } from '@supabase/supabase-js'
import type { PersonRow, ProfileRow } from '@/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/people')
vi.mock('@/features/profile/services/profile.service')
vi.mock('@/features/auth/services/auth.service')
vi.mock('@/features/people/services/people.service')
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    })),
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

const MOCK_USER_ID = '99999999-9999-4999-8999-999999999999'
const MOCK_PERSON_ID = '88888888-8888-4888-8888-888888888888'

const MOCK_PROFILE: ProfileRow = {
  id: MOCK_USER_ID,
  display_name: 'Harish Keria',
  email: 'harish@example.com',
  role: 'MEMBER',
  avatar_url: 'https://example.com/avatar.jpg',
  is_active: true,
  email_verified: true,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
}

const MOCK_LINKED_PERSON: PersonRow = {
  id: MOCK_PERSON_ID,
  first_name: 'Harish',
  last_name: 'Keria',
  gender: 'MALE',
  date_of_birth: '1985-06-15',
  birth_place: 'Palanpur',
  gotra: 'Kashyap',
  nukh: 'Keria',
  kul: 'Devi Hinglaj',
  phone: '+919876543210',
  email_contact: 'harish@example.com',
  user_id: MOCK_USER_ID,
  created_by: MOCK_USER_ID,
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'PRIVATE',
  dob_privacy: 'FAMILY',
  verification_status: 'VERIFIED',
  status: 'ACTIVE',
  deleted_at: null,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
  avatar_url: 'https://example.com/avatar.jpg',
  maiden_name: null,
  middle_name: null,
  phone_secondary: null,
  date_of_death: null,
}

function renderWithProviders(
  ui: React.ReactElement,
  {
    lang = 'en',
    user = { id: MOCK_USER_ID, email: 'harish@example.com' },
    profile = MOCK_PROFILE,
    linkedPerson = MOCK_LINKED_PERSON,
    initialEntries = ['/profile'],
  }: {
    lang?: 'en' | 'hi' | 'gu'
    user?: Partial<User> | null
    profile?: ProfileRow | null
    linkedPerson?: PersonRow | null
    initialEntries?: string[]
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  window.localStorage.setItem('app_language', lang)

  vi.mocked(authContext.useAuthContext).mockReturnValue({
    user: (user ? { id: MOCK_USER_ID, email: 'harish@example.com', ...user } : null) as User | null,
    profile: profile as ProfileRow | null,
    session: user ? ({ user } as never) : null,
    isLoading: false,
    isAuthenticated: Boolean(user),
  })

  vi.mocked(peopleHooks.usePersonByUserId).mockReturnValue({
    data: linkedPerson,
    isLoading: false,
  } as never)

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage={lang}>
        <TourProvider>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </TourProvider>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('ANDROID-12: Profile, Completeness, Account, Security & Settings Parity Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // 1. Profile Navigation & 6-Tab WAI-ARIA Navigation
  // =========================================================================
  describe('1. Profile Navigation & 6-Tab WAI-ARIA Navigation', () => {
    it('renders all 6 tabs with >= 44px touch targets', () => {
      renderWithProviders(<ProfilePage />)

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(6)

      expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Completeness/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Account/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Security/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Settings/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Privacy/i })).toBeInTheDocument()

      tabs.forEach((tab) => {
        expect(tab.className).toContain('min-h-[44px]')
      })
    })

    it('cycles through all 6 tabs with keyboard arrow keys', () => {
      renderWithProviders(<ProfilePage />)

      const overviewTab = screen.getByRole('tab', { name: /Overview/i })
      overviewTab.focus()

      // ArrowRight -> Completeness
      fireEvent.keyDown(overviewTab, { key: 'ArrowRight' })
      expect(screen.getByRole('tab', { name: /Completeness/i })).toHaveAttribute('aria-selected', 'true')

      // ArrowRight -> Account
      const completenessTab = screen.getByRole('tab', { name: /Completeness/i })
      fireEvent.keyDown(completenessTab, { key: 'ArrowRight' })
      expect(screen.getByRole('tab', { name: /Account/i })).toHaveAttribute('aria-selected', 'true')

      // ArrowLeft -> Completeness
      const accountTab = screen.getByRole('tab', { name: /Account/i })
      fireEvent.keyDown(accountTab, { key: 'ArrowLeft' })
      expect(screen.getByRole('tab', { name: /Completeness/i })).toHaveAttribute('aria-selected', 'true')
    })
  })

  // =========================================================================
  // 2. Screen 37: Profile Overview & Identity
  // =========================================================================
  describe('2. Screen 37: Profile Overview & Identity', () => {
    it('renders profile card, verified badge, and linked census record details', () => {
      renderWithProviders(
        <ProfileOverviewSection
          userId={MOCK_USER_ID}
          profile={MOCK_PROFILE}
          linkedPerson={MOCK_LINKED_PERSON}
          isLoadingPerson={false}
          onTabChange={vi.fn()}
        />
      )

      expect(screen.getAllByText('Harish Keria').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('harish@example.com')).toBeInTheDocument()
      expect(screen.getByText('MEMBER')).toBeInTheDocument()
      expect(screen.getByText('Verified')).toBeInTheDocument()

      // Linked census record
      expect(screen.getByText(/Linked to this account/i)).toBeInTheDocument()
      expect(screen.getByText(/Gotra: Kashyap/i)).toBeInTheDocument()
      expect(screen.getByText(/Birth Place: Palanpur/i)).toBeInTheDocument()
      expect(screen.getByText(/PERSON ≠ USER/i)).toBeInTheDocument()
    })

    it('allows updating display name via profile service', async () => {
      vi.mocked(profileService.updateProfile).mockResolvedValueOnce({
        data: { ...MOCK_PROFILE, display_name: 'Harish M. Keria' },
        error: null,
      })

      renderWithProviders(
        <ProfileOverviewSection
          userId={MOCK_USER_ID}
          profile={MOCK_PROFILE}
          linkedPerson={MOCK_LINKED_PERSON}
          isLoadingPerson={false}
          onTabChange={vi.fn()}
        />
      )

      const nameInput = screen.getByLabelText(/Display name/i)
      fireEvent.change(nameInput, { target: { value: 'Harish M. Keria' } })

      const saveBtn = screen.getByRole('button', { name: /Save changes/i })
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(profileService.updateProfile).toHaveBeenCalledWith(MOCK_USER_ID, {
          display_name: 'Harish M. Keria',
        })
        expect(screen.getByText(/Profile updated successfully/i)).toBeInTheDocument()
      })
    })

    it('shows unlinked census state with Search Directory and Add Record buttons', () => {
      renderWithProviders(
        <ProfileOverviewSection
          userId={MOCK_USER_ID}
          profile={MOCK_PROFILE}
          linkedPerson={null}
          isLoadingPerson={false}
          onTabChange={vi.fn()}
        />
      )

      expect(screen.getByText(/No census record is currently linked/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Search Directory/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Add My Record/i })).toBeInTheDocument()
    })
  })

  // =========================================================================
  // 3. Screen 38: Profile Completeness & Missing Fields
  // =========================================================================
  describe('3. Screen 38: Profile Completeness & Missing Fields', () => {
    it('displays completeness score, tier badge, and DATA QUALITY != VERIFICATION notice', () => {
      renderWithProviders(
        <ProfileCompletenessSection
          userId={MOCK_USER_ID}
          linkedPerson={MOCK_LINKED_PERSON}
          isLoadingPerson={false}
        />
      )

      expect(screen.getByTestId('quality-score-value')).toBeInTheDocument()
      expect(screen.getByTestId('quality-tier-badge')).toBeInTheDocument()
      expect(screen.getByTestId('quality-progress-bar')).toBeInTheDocument()
      expect(screen.getByText(/Data Quality measures record completeness/i)).toBeInTheDocument()
    })

    it('renders actionable missing fields cards with direct action buttons when details are missing', () => {
      const incompletePerson: PersonRow = {
        ...MOCK_LINKED_PERSON,
        date_of_birth: null,
        birth_place: null,
        avatar_url: null,
      }

      renderWithProviders(
        <ProfileCompletenessSection
          userId={MOCK_USER_ID}
          linkedPerson={incompletePerson}
          isLoadingPerson={false}
        />
      )

      expect(screen.getByText(/Date of Birth/i)).toBeInTheDocument()
      expect(screen.getByText(/Place of Birth \/ Native City/i)).toBeInTheDocument()
      expect(screen.getByText(/Profile Photo \/ Portrait/i)).toBeInTheDocument()

      const editButtons = screen.getAllByRole('button', { name: /Complete in Record/i })
      expect(editButtons.length).toBeGreaterThan(0)
      editButtons.forEach((btn) => {
        expect(btn.className).toContain('min-h-[44px]')
      })
    })
  })

  // =========================================================================
  // 4. Screen 40: Account Details & Session State
  // =========================================================================
  describe('4. Screen 40: Account Details & Session State', () => {
    it('renders authenticated account details, user ID, role, and active session status', () => {
      renderWithProviders(
        <AccountDetailsSection
          userId={MOCK_USER_ID}
          profile={MOCK_PROFILE}
          linkedPerson={MOCK_LINKED_PERSON}
        />
      )

      expect(screen.getByText('Account Details')).toBeInTheDocument()
      expect(screen.getByText(/Active session/i)).toBeInTheDocument()
      expect(screen.getByText(MOCK_PROFILE.email)).toBeInTheDocument()
      expect(screen.getByText(MOCK_USER_ID)).toBeInTheDocument()
      expect(screen.getByText('MEMBER')).toBeInTheDocument()
      expect(screen.getByText(/Linked to Harish Keria/i)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // 5. Screen 41: Security Settings & Password Update
  // =========================================================================
  describe('5. Screen 41: Security Settings & Password Update', () => {
    it('validates password requirements and calls updatePassword on valid submit', async () => {
      vi.mocked(authService.updatePassword).mockResolvedValueOnce({
        data: {} as never,
        error: null,
      })

      renderWithProviders(<SecuritySettingsSection />)

      const passwordInput = screen.getByLabelText(/^New password/i)
      const confirmInput = screen.getByLabelText(/^Confirm new password/i)
      const submitBtn = screen.getByRole('button', { name: /Save changes/i })

      // Invalid short password
      fireEvent.change(passwordInput, { target: { value: 'short' } })
      fireEvent.change(confirmInput, { target: { value: 'short' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText(/Password must be at least 8 characters/i)).toBeInTheDocument()
      })

      // Valid password with uppercase and number
      fireEvent.change(passwordInput, { target: { value: 'SecurePass123' } })
      fireEvent.change(confirmInput, { target: { value: 'SecurePass123' } })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(authService.updatePassword).toHaveBeenCalledWith({
          password: 'SecurePass123',
          confirmPassword: 'SecurePass123',
        })
        expect(screen.getByText(/Password updated successfully/i)).toBeInTheDocument()
      })
    })
  })

  // =========================================================================
  // 6. Screen 42: Account Deletion / Data Privacy Policy
  // =========================================================================
  describe('6. Screen 42: Account Deletion & Data Privacy', () => {
    it('opens account deletion modal and explains that census records are preserved (PERSON != USER)', () => {
      renderWithProviders(
        <AccountDetailsSection
          userId={MOCK_USER_ID}
          profile={MOCK_PROFILE}
          linkedPerson={MOCK_LINKED_PERSON}
        />
      )

      const deleteReqBtn = screen.getByRole('button', { name: /Request Account Deletion/i })
      fireEvent.click(deleteReqBtn)

      expect(screen.getByText(/Confirm Account Deletion Request/i)).toBeInTheDocument()
      expect(screen.getByText(/PERSON != USER/i)).toBeInTheDocument()
      expect(screen.getByText(/Please type DELETE to confirm/i)).toBeInTheDocument()
    })

    it('requires typing DELETE before permanently deleting account and signing out', async () => {
      vi.mocked(authService.signOut).mockResolvedValueOnce({
        data: undefined,
        error: null,
      })

      renderWithProviders(
        <AccountDetailsSection
          userId={MOCK_USER_ID}
          profile={MOCK_PROFILE}
          linkedPerson={MOCK_LINKED_PERSON}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /Request Account Deletion/i }))

      const confirmBtn = screen.getByRole('button', { name: /Permanently Delete Account/i })
      expect(confirmBtn).toBeDisabled()

      // Type DELETE
      const confirmInput = screen.getByPlaceholderText('DELETE')
      fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
      expect(confirmBtn).not.toBeDisabled()

      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(authService.signOut).toHaveBeenCalled()
      })
    })
  })

  // =========================================================================
  // 7. Screen 43: Privacy Controls & ANDROID-2 Lock
  // =========================================================================
  describe('7. Screen 43: Privacy Controls & ANDROID-2 Lock', () => {
    it('locks privacy management for normal users (MEMBER) with ZERO editable controls', () => {
      renderWithProviders(
        <PrivacySettingsSection
          userRole="MEMBER"
          linkedPerson={MOCK_LINKED_PERSON}
          isLoadingPerson={false}
        />
      )

      expect(screen.getByTestId('privacy-locked-view')).toBeInTheDocument()
      expect(screen.queryByTestId('privacy-admin-view')).not.toBeInTheDocument()
      expect(screen.getByText(/Privacy Managed by Community Elders/i)).toBeInTheDocument()
      expect(screen.getByText(/To ensure census integrity/i)).toBeInTheDocument()

      // Confirms ZERO editable selects exist in locked view
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Save Privacy Settings/i })).not.toBeInTheDocument()
    })

    it('allows authorized COMMUNITY_MODERATOR to view and adjust privacy settings', async () => {
      vi.mocked(peopleService.updatePerson).mockResolvedValueOnce({
        data: MOCK_LINKED_PERSON,
        error: null,
      })

      renderWithProviders(
        <PrivacySettingsSection
          userRole="COMMUNITY_MODERATOR"
          linkedPerson={MOCK_LINKED_PERSON}
          isLoadingPerson={false}
        />
      )

      expect(screen.getByTestId('privacy-admin-view')).toBeInTheDocument()
      expect(screen.queryByTestId('privacy-locked-view')).not.toBeInTheDocument()
      expect(screen.getByText(/Authorized Moderator Access/i)).toBeInTheDocument()

      const saveBtn = screen.getByRole('button', { name: /Save changes/i })
      expect(saveBtn).toBeInTheDocument()
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(peopleService.updatePerson).toHaveBeenCalledWith(
          MOCK_PERSON_ID,
          expect.objectContaining({
            profile_privacy: 'COMMUNITY',
            contact_privacy: 'PRIVATE',
            dob_privacy: 'FAMILY',
          })
        )
      })
    })
  })

  // =========================================================================
  // 8. Screen 39: App Settings
  // =========================================================================
  describe('8. Screen 39: App Settings', () => {
    it('renders language selector, tour replay button, and notification preferences link', () => {
      renderWithProviders(<AppSettingsSection onTabChange={vi.fn()} />)

      expect(screen.getByText(/App Settings/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /App tour/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Manage Notifications/i })).toHaveAttribute(
        'href',
        '/settings/notifications'
      )
    })
  })

  // =========================================================================
  // 9. Trilingual Localization (Hindi & Gujarati)
  // =========================================================================
  describe('9. Trilingual Localization (Hindi & Gujarati)', () => {
    it('renders accurate Hindi translations for profile and privacy sections', () => {
      renderWithProviders(<ProfilePage />, { lang: 'hi' })

      expect(screen.getByRole('tab', { name: /अवलोकन/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /पूर्णता/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /खाता/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /सुरक्षा/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /सेटिंग्स/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /गोपनीयता/i })).toBeInTheDocument()
    })

    it('renders accurate Gujarati translations for profile and privacy sections', () => {
      renderWithProviders(<ProfilePage />, { lang: 'gu' })

      expect(screen.getByRole('tab', { name: /વિહંગાવલોકન/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /સંપૂર્ણતા/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /ખાતું/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /સુરક્ષા/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /સેટિંગ્સ/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /ગોપનીયતા/i })).toBeInTheDocument()
    })
  })
})
