/**
 * Privacy Settings Section (Screen 43 — ANDROID-12)
 *
 * Implements the 5-level privacy model presentation and enforces the
 * mandatory ANDROID-2 privacy lock:
 * - Normal users: ZERO editable controls; informative lock notice.
 * - Authorized roles (SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR): can manage privacy.
 */

import { useState } from 'react'
import {
  Shield,
  Lock,
  Eye,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react'
import type { PersonRow, PrivacyLevel, UserRole } from '@/types'
import { canManagePrivacy, PRIVACY_LEVEL_LABELS } from '@/constants/app'
import { PrivacyLevelSelect } from '@/components/forms/PrivacyLevelSelect'
import { Button } from '@/components/forms/Button'
import { updatePerson } from '@/features/people/services/people.service'
import { useLanguage } from '@/features/i18n'

export interface PrivacySettingsSectionProps {
  userRole?: string | null
  linkedPerson: PersonRow | null | undefined
  isLoadingPerson: boolean
  onPersonUpdated?: () => void
}

export function PrivacySettingsSection({
  userRole,
  linkedPerson,
  isLoadingPerson,
  onPersonUpdated,
}: PrivacySettingsSectionProps) {
  const { t } = useLanguage()
  const isPrivacyManager = canManagePrivacy(userRole as UserRole)

  const [profilePrivacy, setProfilePrivacy] = useState<PrivacyLevel>(
    (linkedPerson?.profile_privacy as PrivacyLevel) ?? 'PRIVATE'
  )
  const [contactPrivacy, setContactPrivacy] = useState<PrivacyLevel>(
    (linkedPerson?.contact_privacy as PrivacyLevel) ?? 'PRIVATE'
  )
  const [dobPrivacy, setDobPrivacy] = useState<PrivacyLevel>(
    (linkedPerson?.dob_privacy as PrivacyLevel) ?? 'PRIVATE'
  )

  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSavePrivacy(e: React.FormEvent) {
    e.preventDefault()
    if (!linkedPerson || !isPrivacyManager) return

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const result = await updatePerson(linkedPerson.id, {
      profile_privacy: profilePrivacy,
      contact_privacy: contactPrivacy,
      dob_privacy: dobPrivacy,
    })

    setIsSaving(false)

    if (result.error) {
      setSaveError(result.error.message)
      return
    }

    setSaveSuccess(true)
    onPersonUpdated?.()
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const privacyLevelsDescription: Array<{
    level: PrivacyLevel
    title: string
    desc: string
  }> = [
    {
      level: 'PRIVATE',
      title: PRIVACY_LEVEL_LABELS.PRIVATE,
      desc: 'Only you and community administrators can view these details.',
    },
    {
      level: 'FAMILY',
      title: PRIVACY_LEVEL_LABELS.FAMILY,
      desc: 'Visible to members of your verified family census roster.',
    },
    {
      level: 'CONNECTIONS',
      title: PRIVACY_LEVEL_LABELS.CONNECTIONS,
      desc: 'Visible to registered community members with whom you have mutual accepted connections.',
    },
    {
      level: 'COMMUNITY',
      title: PRIVACY_LEVEL_LABELS.COMMUNITY,
      desc: 'Visible to all authenticated members in the verified community directory.',
    },
    {
      level: 'PUBLIC',
      title: PRIVACY_LEVEL_LABELS.PUBLIC,
      desc: 'Visible in open genealogical views across the platform.',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Privacy Overview Card */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold text-navy-900">
            {t('profile.privacy_title', 'Privacy & Governance')}
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-navy-500">
          {t(
            'profile.privacy_desc',
            'Understand how your personal and census data is protected across the community.'
          )}
        </p>

        {/* 5-Level Privacy Model Guide */}
        <div className="rounded-lg border border-navy-100 bg-navy-50/40 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-navy-800 uppercase tracking-wider">
            Community 5-Level Privacy Model
          </h3>
          <div className="grid grid-cols-1 gap-2 text-xs">
            {privacyLevelsDescription.map((item) => (
              <div
                key={item.level}
                className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-1 border-b border-navy-100/70 last:border-0"
              >
                <span className="font-semibold text-navy-900 w-auto sm:w-28 shrink-0">{item.title}:</span>
                <span className="text-navy-600">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Current Record Privacy Status */}
      {isLoadingPerson ? (
        <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm">
          <p className="text-sm text-navy-500">Loading privacy settings…</p>
        </div>
      ) : linkedPerson ? (
        <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-semibold text-navy-900 flex items-center gap-2">
              <Eye className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />
              Current Privacy Settings
            </h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-700 max-w-full truncate">
              Record: {linkedPerson.first_name} {linkedPerson.last_name}
            </span>
          </div>

          {!isPrivacyManager ? (
            /* =========================================================================
             * MANDATORY ANDROID-2 PRIVACY LOCK: Normal User View (ZERO EDITABLE INPUTS)
             * ========================================================================= */
            <div data-testid="privacy-locked-view" className="space-y-4">
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <Lock className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                  <span>{t('profile.privacy_lock_title', 'Privacy Managed by Community Elders')}</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {t(
                    'profile.privacy_lock_notice',
                    'To ensure census integrity and prevent accidental exposure of family lineage, privacy levels are governed by Mukhi / Community Moderators. Contact a moderator to request privacy adjustments.'
                  )}
                </p>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-lg border border-navy-200 bg-white p-3.5 shadow-2xs">
                  <dt className="text-xs text-navy-500 font-medium">
                    {t('profile.privacy_current_profile', 'Profile Privacy')}
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-navy-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-teal-500" />
                    {PRIVACY_LEVEL_LABELS[linkedPerson.profile_privacy as PrivacyLevel] ??
                      linkedPerson.profile_privacy}
                  </dd>
                </div>

                <div className="rounded-lg border border-navy-200 bg-white p-3.5 shadow-2xs">
                  <dt className="text-xs text-navy-500 font-medium">
                    {t('profile.privacy_current_contact', 'Contact Privacy')}
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-navy-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    {PRIVACY_LEVEL_LABELS[linkedPerson.contact_privacy as PrivacyLevel] ??
                      linkedPerson.contact_privacy}
                  </dd>
                </div>

                <div className="rounded-lg border border-navy-200 bg-white p-3.5 shadow-2xs">
                  <dt className="text-xs text-navy-500 font-medium">
                    {t('profile.privacy_current_dob', 'Date of Birth Privacy')}
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-navy-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                    {PRIVACY_LEVEL_LABELS[linkedPerson.dob_privacy as PrivacyLevel] ??
                      linkedPerson.dob_privacy}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            /* =========================================================================
             * AUTHORIZED MANAGEMENT VIEW: SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR
             * ========================================================================= */
            <div data-testid="privacy-admin-view" className="space-y-4">
              <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-800 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Authorized Moderator Access:</strong> As an authorized {userRole}, you have authority to adjust privacy levels for this census record.
                </span>
              </div>

              <form onSubmit={handleSavePrivacy} className="space-y-4 pt-2">
                <PrivacyLevelSelect
                  label={t('profile.privacy_current_profile', 'Profile Privacy')}
                  value={profilePrivacy}
                  onChange={(e) => setProfilePrivacy(e.target.value as PrivacyLevel)}
                  hint="Controls visibility of biographical and lineage details"
                />

                <PrivacyLevelSelect
                  label={t('profile.privacy_current_contact', 'Contact Privacy')}
                  value={contactPrivacy}
                  onChange={(e) => setContactPrivacy(e.target.value as PrivacyLevel)}
                  hint="Controls visibility of phone and email"
                />

                <PrivacyLevelSelect
                  label={t('profile.privacy_current_dob', 'Date of Birth Privacy')}
                  value={dobPrivacy}
                  onChange={(e) => setDobPrivacy(e.target.value as PrivacyLevel)}
                  hint="Controls visibility of exact date of birth"
                />

                {saveSuccess && (
                  <p role="status" className="text-xs font-semibold text-teal-600 flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4" aria-hidden="true" />
                    Privacy settings updated successfully
                  </p>
                )}

                {saveError && (
                  <p role="alert" className="text-xs text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    {saveError}
                  </p>
                )}

                <Button
                  type="submit"
                  isLoading={isSaving}
                  disabled={isSaving}
                  className="w-full sm:w-auto min-h-[44px]"
                >
                  {t('profile.save_changes', 'Save Privacy Settings')}
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-navy-600">
            {t(
              'profile.no_census_linked',
              'No census record is currently linked to your user account'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
