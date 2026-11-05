/**
 * Committee Card Component (Screen 44 — ANDROID-13 Parity)
 */

import React from 'react'
import {
  Users,
  ShieldCheck,
  Building,
  Calendar,
  ChevronRight,
  Award,
} from 'lucide-react'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import type { Committee } from '../types'

interface CommitteeCardProps {
  committee: Committee
  onViewDetails: (committee: Committee) => void
}

const getCategoryTranslationKey = (category: string): TranslationKey => {
  switch (category) {
    case 'GOVERNANCE':
      return 'committee.cat_governance'
    case 'CENSUS':
      return 'committee.cat_census'
    case 'WELFARE':
      return 'committee.cat_welfare'
    case 'YOUTH_SPORTS':
      return 'committee.cat_youth_sports'
    case 'WOMEN_CULTURAL':
      return 'committee.cat_women_cultural'
    case 'EDUCATION':
      return 'committee.cat_education'
    case 'HEALTH':
      return 'committee.cat_health'
    default:
      return 'committee.cat_all'
  }
}

export const CommitteeCard: React.FC<CommitteeCardProps> = ({
  committee,
  onViewDetails,
}) => {
  const { t } = useLanguage()

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'GOVERNANCE':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300'
      case 'CENSUS':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
      case 'WELFARE':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      case 'YOUTH_SPORTS':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
      case 'WOMEN_CULTURAL':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
      case 'EDUCATION':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
      case 'HEALTH':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  return (
    <div
      role="article"
      aria-label={committee.name}
      className="flex h-full flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md"
    >
      <div className="space-y-3">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${getCategoryBadgeClass(
              committee.category
            )}`}
          >
            <Award className="h-3 w-3" />
            {t(getCategoryTranslationKey(committee.category), committee.category)}
          </span>

          <div className="flex items-center gap-1.5">
            {committee.is_verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                {t('committee.badge_verified', 'Verified Body')}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <Users className="h-3.5 w-3.5" />
              {committee.member_count} {t('committee.members_count', 'Members')}
            </span>
          </div>
        </div>

        {/* Committee Title */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {committee.name}
          </h3>
          {committee.native_name && (
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              {committee.native_name}
            </p>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
          {committee.description}
        </p>

        {/* Leadership Snippet */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
          <div className="text-slate-500 dark:text-slate-400 font-medium">
            {t('committee.label_leadership', 'Key Leadership')}:
          </div>
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            {committee.leadership_summary.head_name}
            <span className="text-slate-500 font-normal">
              {' '}
              ({committee.leadership_summary.head_designation})
            </span>
          </div>
          {committee.leadership_summary.secretary_name && (
            <div className="text-slate-700 dark:text-slate-300">
              {committee.leadership_summary.secretary_name}
            </div>
          )}
        </div>

        {/* Meta: Headquarters & Established */}
        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
          {committee.headquarters && (
            <span className="inline-flex items-center gap-1 truncate max-w-full">
              <Building className="h-3 w-3 shrink-0" />
              {committee.headquarters}
            </span>
          )}
          {committee.established_year && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              {t('committee.established', 'Est.')} {committee.established_year}
            </span>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onViewDetails(committee)}
          className="flex min-h-[44px] w-full items-center justify-between rounded-lg bg-blue-50 dark:bg-blue-950/40 px-4 py-2.5 text-sm font-semibold text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`${t('committee.view_roster', 'View Committee & Roster')}: ${committee.name}`}
        >
          <span>{t('committee.view_roster', 'View Committee & Roster')}</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
