/**
 * Profile Overview Section (Screen 37 — ANDROID-12)
 *
 * Presents the authenticated user profile, display settings form,
 * census record linkage (PERSON != USER), and quick completeness overview.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  User,
  Shield,
  CheckCircle,
  AlertCircle,
  Camera,
  ArrowRight,
  GitBranch,
  Search,
  PlusCircle,
  Sparkles,
} from 'lucide-react'
import type { ProfileRow, PersonRow } from '@/types'
import type { ProfileTab } from '../types'
import { profileUpdateSchema, type ProfileUpdateInput } from '@/features/auth/schemas/auth.schemas'
import { updateProfile } from '../services/profile.service'
import { ROUTES } from '@/constants/app'
import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { AvatarImage, AvatarUploadDialog } from '@/features/media'
import { useLanguage } from '@/features/i18n'
import { calculatePersonDataQuality } from '@/features/verification/services/dataQuality.service'

export interface ProfileOverviewSectionProps {
  userId: string
  profile: ProfileRow
  linkedPerson: PersonRow | null | undefined
  isLoadingPerson: boolean
  onTabChange: (tab: ProfileTab) => void
  onProfileUpdated?: () => void
}

export function ProfileOverviewSection({
  userId,
  profile,
  linkedPerson,
  isLoadingPerson,
  onTabChange,
  onProfileUpdated,
}: ProfileOverviewSectionProps) {
  const { t } = useLanguage()
  const [updateSuccess, setUpdateSuccess] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(profile.avatar_url ?? null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    values: {
      display_name: profile.display_name ?? '',
    },
  })

  async function onUpdateProfile(data: ProfileUpdateInput) {
    setUpdateError(null)
    setUpdateSuccess(false)

    const result = await updateProfile(userId, { display_name: data.display_name })

    if (result.error) {
      setUpdateError(result.error.message)
      return
    }

    setUpdateSuccess(true)
    onProfileUpdated?.()
    setTimeout(() => setUpdateSuccess(false), 3000)
  }

  // Completeness score of linked census record
  const quality = linkedPerson ? calculatePersonDataQuality(linkedPerson) : null

  return (
    <div className="space-y-6">
      {/* Avatar + Identity summary card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="shrink-0">
            <AvatarImage
              src={currentAvatar}
              name={profile.display_name ?? profile.email}
              alt={profile.display_name ?? 'Profile avatar'}
              size="xl"
              shape="circle"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base sm:text-lg font-semibold text-navy-900 truncate">
              {profile.display_name ?? '(No name set)'}
            </p>
            <p className="text-xs sm:text-sm text-navy-500 break-all sm:break-normal truncate sm:overflow-visible">
              {profile.email}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-2 sm:px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-navy-700">
                <Shield className="h-3 w-3 shrink-0" aria-hidden="true" />
                {profile.role.replace(/_/g, ' ')}
              </span>
              {profile.email_verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 sm:px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-teal-700">
                  <CheckCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 sm:px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-yellow-700">
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Email unverified
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="w-full sm:w-auto shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAvatarDialogOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {t('profile.change_photo', 'Change photo')}
          </Button>
        </div>
      </div>

      <AvatarUploadDialog
        isOpen={avatarDialogOpen}
        onClose={() => setAvatarDialogOpen(false)}
        target={{ type: 'profile', id: userId }}
        currentAvatarUrl={currentAvatar}
        onSuccess={(newUrl) => {
          setCurrentAvatar(newUrl)
          setAvatarDialogOpen(false)
          onProfileUpdated?.()
        }}
      />

      {/* Mini Completeness Callout Card */}
      {linkedPerson && quality && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0 w-full sm:w-auto">
            <div className="rounded-lg bg-brand-100 p-2 text-brand-700 shrink-0">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-navy-900">
                  {t('profile.completeness_title', 'Profile Completeness')}
                </span>
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white shrink-0">
                  {quality.score}%
                </span>
              </div>
              <p className="mt-0.5 text-xs text-navy-600 leading-normal">
                {quality.missingFields.length > 0
                  ? `${quality.missingFields.length} missing fields on your census record.`
                  : 'Your community census record is complete and up to date.'}
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onTabChange('completeness')}
            className="w-full sm:w-auto min-h-[44px] shrink-0 justify-center"
          >
            {t('profile.tab_completeness', 'View Completeness')}
            <ArrowRight className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Edit Display Name Form */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-navy-900">
          <User className="h-4 w-4 text-brand-600" aria-hidden="true" />
          {t('profile.display_settings', 'Display settings')}
        </h2>
        <p className="mt-1 text-sm text-navy-500">
          {t('profile.display_settings_desc', 'How your name appears in the community directory.')}
        </p>

        <form onSubmit={handleSubmit(onUpdateProfile)} noValidate className="mt-4 space-y-4">
          <Input
            label={t('profile.display_name', 'Display name')}
            type="text"
            autoComplete="name"
            required
            error={errors.display_name?.message}
            {...register('display_name')}
          />

          {updateSuccess && (
            <p role="status" className="text-sm font-medium text-teal-600 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('profile.updated_success', 'Profile updated successfully')}
            </p>
          )}
          {updateError && (
            <p role="alert" className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {updateError}
            </p>
          )}

          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={isSubmitting || !isDirty}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {t('profile.save_changes', 'Save changes')}
          </Button>
        </form>
      </div>

      {/* Community Census Record (PERSON != USER) */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex items-start sm:items-center justify-between flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-navy-900">
              {t('profile.census_record', 'Community Census Record')}
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              {t(
                'profile.census_record_desc',
                'Your genealogical identity in the community census (separate from your login account).'
              )}
            </p>
          </div>
          <span className="inline-flex items-center rounded-md bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-600 border border-navy-200 shrink-0">
            PERSON ≠ USER
          </span>
        </div>

        <div className="mt-4">
          {isLoadingPerson ? (
            <p className="text-xs text-navy-500">Loading linked census record…</p>
          ) : linkedPerson ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3.5 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-navy-900 truncate">
                      {linkedPerson.first_name} {linkedPerson.last_name}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800 shrink-0">
                      <CheckCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Linked to this account
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-navy-600 break-words">
                    {linkedPerson.gotra ? `Gotra: ${linkedPerson.gotra} • ` : ''}
                    {linkedPerson.birth_place ? `Birth Place: ${linkedPerson.birth_place} • ` : ''}
                    Privacy: {linkedPerson.profile_privacy}
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  <Link
                    to={ROUTES.PERSON_DETAIL(linkedPerson.id)}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md border border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 shadow-2xs min-h-[44px]"
                  >
                    {t('profile.view_record', 'View Record')}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  <Link
                    to={ROUTES.PERSON_TREE(linkedPerson.id)}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 shadow-2xs min-h-[44px]"
                  >
                    <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('profile.family_tree', 'Family Tree')}
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-navy-200 bg-navy-50/40 p-3.5 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-navy-800">
                    {t('profile.no_census_linked', 'No census record is currently linked to your user account')}
                  </p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    {t(
                      'profile.no_census_desc',
                      'You can search the community directory for your existing genealogical record or add a new record.'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  <Link
                    to={ROUTES.DISCOVER}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md border border-navy-300 bg-white px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-navy-50 shadow-2xs min-h-[44px]"
                  >
                    <Search className="h-3.5 w-3.5 text-navy-500" aria-hidden="true" />
                    {t('profile.search_directory', 'Search Directory')}
                  </Link>
                  <Link
                    to={ROUTES.PERSON_CREATE}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-md bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800 shadow-2xs min-h-[44px]"
                  >
                    <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('profile.add_my_record', 'Add My Record')}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
