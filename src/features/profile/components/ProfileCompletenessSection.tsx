/**
 * Profile Completeness & Missing Fields Section (Screen 38 — ANDROID-12)
 *
 * Implements deterministic data quality scoring, tier progress bar,
 * actionable missing field guidance navigating directly to edit sections,
 * and explicit DATA QUALITY != VERIFICATION boundary notice.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  MapPin,
  Compass,
  Phone,
  Camera,
  ArrowRight,
  PlusCircle,
  Search,
} from 'lucide-react'
import type { PersonRow } from '@/types'
import { calculatePersonDataQuality } from '@/features/verification/services/dataQuality.service'
import type { DataQualityTier } from '@/features/verification/types/quality.types'
import { Button } from '@/components/forms/Button'
import { AvatarUploadDialog } from '@/features/media'
import { ROUTES } from '@/constants/app'
import { useLanguage } from '@/features/i18n'

export interface ProfileCompletenessSectionProps {
  userId: string
  linkedPerson: PersonRow | null | undefined
  isLoadingPerson: boolean
  onProfileUpdated?: () => void
}

function getTierBadgeClasses(tier: DataQualityTier): string {
  switch (tier) {
    case 'EXCELLENT':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'GOOD':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'ADEQUATE':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'NEEDS_IMPROVEMENT':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300'
  }
}

function getProgressBarClasses(tier: DataQualityTier): string {
  switch (tier) {
    case 'EXCELLENT':
      return 'bg-emerald-500'
    case 'GOOD':
      return 'bg-blue-500'
    case 'ADEQUATE':
      return 'bg-amber-500'
    case 'NEEDS_IMPROVEMENT':
    default:
      return 'bg-slate-400'
  }
}

function formatTierLabel(tier: DataQualityTier): string {
  switch (tier) {
    case 'EXCELLENT':
      return 'Excellent Quality'
    case 'GOOD':
      return 'Good Quality'
    case 'ADEQUATE':
      return 'Adequate'
    case 'NEEDS_IMPROVEMENT':
      return 'Needs Details'
  }
}

export function ProfileCompletenessSection({
  userId: _userId,
  linkedPerson,
  isLoadingPerson,
  onProfileUpdated,
}: ProfileCompletenessSectionProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)

  if (isLoadingPerson) {
    return (
      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-navy-500">Loading completeness metrics…</p>
      </div>
    )
  }

  // If no census record linked
  if (!linkedPerson) {
    return (
      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-navy-900">
            {t('profile.completeness_title', 'Profile Completeness')}
          </h2>
        </div>

        <p className="text-sm text-navy-600">
          {t(
            'profile.no_census_desc',
            'You can search the community directory for your existing genealogical record or add a new record.'
          )}
        </p>

        <div className="rounded-lg border border-dashed border-navy-300 bg-navy-50/50 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-navy-700">
            <span className="font-semibold block">Link your Community Census Record</span>
            <span className="text-xs text-navy-500">
              Completeness is computed directly from your personal census and lineage entry.
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <Link
              to={ROUTES.DISCOVER}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-300 bg-white px-4 py-2.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 shadow-2xs min-h-[44px]"
            >
              <Search className="h-4 w-4 text-navy-500" aria-hidden="true" />
              {t('profile.search_directory', 'Search Directory')}
            </Link>
            <Link
              to={ROUTES.PERSON_CREATE}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-navy-800 shadow-2xs min-h-[44px]"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              {t('profile.add_my_record', 'Add My Record')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Calculate deterministic data quality
  const quality = calculatePersonDataQuality(linkedPerson)
  const tierBadgeClasses = getTierBadgeClasses(quality.tier)
  const progressBarColor = getProgressBarClasses(quality.tier)

  // Map missing fields to actionable advice
  const missingFieldActions: Array<{
    field: string
    title: string
    desc: string
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
    actionType: 'navigate' | 'photo'
  }> = []

  if (quality.missingFields.includes('date_of_birth')) {
    missingFieldActions.push({
      field: 'date_of_birth',
      title: 'Date of Birth',
      desc: 'Enables accurate age calculation, generational tree alignment, and birthday notifications.',
      icon: Calendar,
      actionType: 'navigate',
    })
  }

  if (quality.missingFields.includes('birth_place')) {
    missingFieldActions.push({
      field: 'birth_place',
      title: 'Place of Birth / Native City',
      desc: 'Assists ancestral geographic lineage tracking and community branch matching.',
      icon: MapPin,
      actionType: 'navigate',
    })
  }

  if (quality.missingFields.includes('gotra') || quality.missingFields.includes('nukh')) {
    missingFieldActions.push({
      field: 'lineage',
      title: 'Gotra & Nukh',
      desc: 'Essential cultural identity attributes for clan lineage preservation and directory search.',
      icon: Compass,
      actionType: 'navigate',
    })
  }

  if (quality.missingFields.includes('phone') || quality.missingFields.includes('email_contact')) {
    missingFieldActions.push({
      field: 'contact',
      title: 'Contact Information',
      desc: 'Allows family members and community leaders to reach out while respecting your privacy settings.',
      icon: Phone,
      actionType: 'navigate',
    })
  }

  if (!linkedPerson.avatar_url) {
    missingFieldActions.push({
      field: 'avatar',
      title: 'Profile Photo / Portrait',
      desc: 'Helps community elders and relatives recognize you in the directory and family trees.',
      icon: Camera,
      actionType: 'photo',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header score card */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />
              <h2 className="text-base sm:text-lg font-semibold text-navy-900">
                {t('profile.completeness_title', 'Profile Completeness')}
              </h2>
              <span
                data-testid="quality-tier-badge"
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${tierBadgeClasses}`}
              >
                {formatTierLabel(quality.tier)}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-navy-500">
              {t(
                'profile.completeness_desc',
                'Complete your community census record to preserve genealogical history and help families connect.'
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <span
              data-testid="quality-score-value"
              className="text-2xl font-bold text-navy-900"
            >
              {quality.score}%
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-navy-100 rounded-full h-2.5 overflow-hidden">
          <div
            data-testid="quality-progress-bar"
            className={`h-2.5 rounded-full transition-all duration-300 ${progressBarColor}`}
            style={{ width: `${Math.min(100, Math.max(0, quality.score))}%` }}
          />
        </div>

        {/* Architectural Notice: DATA QUALITY != VERIFICATION */}
        <div className="flex items-start gap-2.5 rounded-lg bg-navy-50/70 p-3 text-xs text-navy-700 border border-navy-200">
          <Info className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>Architectural Guarantee:</strong> Data Quality measures record completeness and genealogical richness. It does <em>not</em> replace or imply official community moderator verification.
          </span>
        </div>

        {/* Category Breakdown Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {Object.entries(quality.categories).map(([key, category]) => {
            const percentage =
              category.max > 0 ? Math.round((category.earned / category.max) * 100) : 0
            return (
              <div
                key={key}
                className="rounded-lg border border-navy-100 bg-navy-50/40 p-3 text-xs"
              >
                <div className="flex justify-between items-start sm:items-center font-medium text-navy-900 flex-wrap gap-1">
                  <span className="font-semibold">{category.label}</span>
                  <span className="font-bold text-navy-700 text-[11px] sm:text-xs shrink-0">
                    {category.earned} / {category.max} pts ({percentage}%)
                  </span>
                </div>
                <p className="mt-1 text-navy-500 text-[11px]">{category.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actionable Missing Fields */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-navy-900">
            {t('profile.missing_fields_title', 'Missing Information')}
          </h3>
          <p className="mt-0.5 text-xs sm:text-sm text-navy-500">
            {t(
              'profile.missing_fields_desc',
              'Complete these missing fields on your census record to enhance directory matching.'
            )}
          </p>
        </div>

        {missingFieldActions.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium text-emerald-800">
              Outstanding! Your census record is complete across all core genealogical attributes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {missingFieldActions.map((action, i) => {
              const Icon = action.icon
              return (
                <div
                  key={i}
                  className="rounded-lg border border-navy-200 bg-white p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-navy-300 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-lg bg-brand-50 p-2 text-brand-700 shrink-0">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-navy-900">{action.title}</h4>
                      <p className="text-xs text-navy-600 mt-0.5 leading-normal">{action.desc}</p>
                    </div>
                  </div>

                  <div className="w-full sm:w-auto shrink-0 sm:self-center">
                    {action.actionType === 'photo' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setAvatarDialogOpen(true)}
                        className="w-full sm:w-auto justify-center min-h-[44px] text-xs font-semibold"
                      >
                        <Camera className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                        Upload Photo
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(ROUTES.PERSON_EDIT(linkedPerson.id))}
                        className="w-full sm:w-auto justify-center min-h-[44px] text-xs font-semibold"
                      >
                        {t('profile.action_edit_record', 'Complete in Record')}
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Consistency Warnings (if any) */}
        {quality.warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-4 text-xs text-amber-800 border border-amber-200 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
              <span>Record Consistency Alerts</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              {quality.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <AvatarUploadDialog
        isOpen={avatarDialogOpen}
        onClose={() => setAvatarDialogOpen(false)}
        target={{ type: 'person', id: linkedPerson.id }}
        currentAvatarUrl={linkedPerson.avatar_url ?? null}
        onSuccess={() => {
          setAvatarDialogOpen(false)
          onProfileUpdated?.()
        }}
      />
    </div>
  )
}
