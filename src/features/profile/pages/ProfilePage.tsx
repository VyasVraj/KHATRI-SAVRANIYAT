/**
 * Profile Page (ANDROID-12 — Screens 37–43)
 *
 * Implements Android parity for Profile, Completeness, Account, Security, and Settings:
 * - Screen 37: Profile Overview & Identity
 * - Screen 38: Profile Completeness & Missing Fields
 * - Screen 39: App Settings (Language, Guided Tour & Notification Preferences)
 * - Screen 40: Account Details & Session Status
 * - Screen 41: Security Settings & Password Management
 * - Screen 42: Account Deletion & Data Privacy
 * - Screen 43: Privacy Controls & ANDROID-2 Lock
 *
 * INVARIANTS:
 * - PERSON != USER strictly preserved.
 * - Production role model strictly respected (no MUKHI role).
 * - ANDROID-2 privacy authorization lock strictly preserved.
 */

import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { usePersonByUserId } from '@/features/people'
import { ROUTES } from '@/constants/app'
import { Button } from '@/components/forms/Button'
import { useLanguage } from '@/features/i18n'
import { calculatePersonDataQuality } from '@/features/verification/services/dataQuality.service'

import type { ProfileTab } from '../types'
import { ProfileNavTabs } from '../components/ProfileNavTabs'
import { ProfileOverviewSection } from '../components/ProfileOverviewSection'
import { ProfileCompletenessSection } from '../components/ProfileCompletenessSection'
import { AccountDetailsSection } from '../components/AccountDetailsSection'
import { SecuritySettingsSection } from '../components/SecuritySettingsSection'
import { AppSettingsSection } from '../components/AppSettingsSection'
import { PrivacySettingsSection } from '../components/PrivacySettingsSection'

const VALID_TABS: ProfileTab[] = [
  'overview',
  'completeness',
  'account',
  'security',
  'settings',
  'privacy',
]

export function ProfilePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, profile, isLoading } = useAuthContext()
  const { data: linkedPerson, isLoading: isLoadingPerson } = usePersonByUserId(user?.id)

  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') as ProfileTab | null
  const activeTab: ProfileTab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'overview'

  const handleTabChange = (tab: ProfileTab) => {
    setSearchParams({ tab }, { replace: true })
  }

  const handleRefresh = () => {
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: ['persons', 'by-user', user.id] })
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-navy-500">Loading profile…</p>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-navy-600">Profile not found.</p>
        <Button variant="secondary" onClick={() => navigate(ROUTES.SIGN_IN)} className="min-h-[44px]">
          Sign in
        </Button>
      </div>
    )
  }

  const quality = linkedPerson ? calculatePersonDataQuality(linkedPerson) : undefined

  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-navy-900">
          {t('profile.title', 'My Profile')}
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-navy-500">
          {t(
            'profile.subtitle',
            'Manage your account settings, preferences, and community records.'
          )}
        </p>
      </div>

      {/* Navigation Tabs (Screens 37–43) */}
      <div className="mb-6 rounded-xl border border-navy-200 overflow-hidden shadow-2xs">
        <ProfileNavTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          completenessScore={quality?.score}
        />
      </div>

      {/* Tab Panels */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="focus:outline-hidden"
      >
        {activeTab === 'overview' && (
          <ProfileOverviewSection
            userId={user.id}
            profile={profile}
            linkedPerson={linkedPerson}
            isLoadingPerson={isLoadingPerson}
            onTabChange={handleTabChange}
            onProfileUpdated={handleRefresh}
          />
        )}

        {activeTab === 'completeness' && (
          <ProfileCompletenessSection
            userId={user.id}
            linkedPerson={linkedPerson}
            isLoadingPerson={isLoadingPerson}
            onProfileUpdated={handleRefresh}
          />
        )}

        {activeTab === 'account' && (
          <AccountDetailsSection
            userId={user.id}
            profile={profile}
            linkedPerson={linkedPerson}
          />
        )}

        {activeTab === 'security' && <SecuritySettingsSection />}

        {activeTab === 'settings' && <AppSettingsSection onTabChange={handleTabChange} />}

        {activeTab === 'privacy' && (
          <PrivacySettingsSection
            userRole={profile.role}
            linkedPerson={linkedPerson}
            isLoadingPerson={isLoadingPerson}
            onPersonUpdated={handleRefresh}
          />
        )}
      </div>
    </div>
  )
}
