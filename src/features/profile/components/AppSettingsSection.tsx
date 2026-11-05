/**
 * App Settings Section (Screen 39 — ANDROID-12)
 *
 * Integrates language preferences (ANDROID-3), guided onboarding tour replay (ANDROID-3),
 * and notification preferences navigation (ANDROID-4).
 */

import { Link } from 'react-router-dom'
import { Settings, Bell, ArrowRight, Shield } from 'lucide-react'
import { LanguageSelector } from '@/features/i18n'
import { AppTourReplayButton } from '@/features/onboarding'
import { ROUTES } from '@/constants/app'
import { useLanguage } from '@/features/i18n'
import type { ProfileTab } from '../types'

export interface AppSettingsSectionProps {
  onTabChange: (tab: ProfileTab) => void
}

export function AppSettingsSection({ onTabChange }: AppSettingsSectionProps) {
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      {/* Language Selector Card */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-navy-900">
          <Settings className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />
          {t('profile.app_settings', 'App Settings')}
        </h2>
        <p className="text-xs sm:text-sm text-navy-500">
          {t('profile.app_settings_desc', 'Language, appearance, and guided experience')}
        </p>

        <div className="pt-2">
          <LanguageSelector variant="card" />
        </div>
      </div>

      {/* Guided Tour Card */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-navy-900">
            {t('profile.app_tour', 'Community App Tour')}
          </h3>
          <p className="mt-1 text-xs text-navy-500">
            {t(
              'profile.app_tour_desc',
              'Replay the 7-step guided tour across all community features anytime'
            )}
          </p>
        </div>

        <div className="w-full sm:w-auto shrink-0">
          <AppTourReplayButton />
        </div>
      </div>

      {/* Notification Preferences Card (Reusing Phase 12 / ANDROID-4) */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-navy-900">
              {t('profile.notification_preferences', 'Notification preferences')}
            </h3>
          </div>
          <p className="mt-1 text-xs text-navy-500">
            {t(
              'profile.notification_preferences_desc',
              'Manage in-app and email notification frequencies.'
            )}
          </p>
        </div>

        <Link
          to={ROUTES.NOTIFICATION_PREFERENCES}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy-300 bg-white px-4 py-2.5 text-xs font-semibold text-navy-700 shadow-sm hover:bg-navy-50 min-h-[44px] w-full sm:w-auto shrink-0"
        >
          {t('profile.manage_notifications', 'Manage Notifications')}
          <ArrowRight className="h-3.5 w-3.5 text-navy-400" aria-hidden="true" />
        </Link>
      </div>

      {/* Quick link to Privacy Settings */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-navy-900">
              {t('profile.privacy_title', 'Privacy & Governance')}
            </h3>
          </div>
          <p className="mt-1 text-xs text-navy-500">
            {t(
              'profile.privacy_desc',
              'Understand how your personal and census data is protected across the community.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onTabChange('privacy')}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy-300 bg-white px-4 py-2.5 text-xs font-semibold text-navy-700 shadow-sm hover:bg-navy-50 min-h-[44px] w-full sm:w-auto shrink-0"
        >
          <span>View Privacy</span>
          <ArrowRight className="h-3.5 w-3.5 text-navy-400" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
