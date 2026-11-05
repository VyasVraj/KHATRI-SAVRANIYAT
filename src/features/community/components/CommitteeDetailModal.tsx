/**
 * Committee Detail & Member Roster Modal (Screen 45 — ANDROID-13 Parity)
 */

import React, { useEffect } from 'react'
import {
  X,
  Users,
  ShieldCheck,
  Building,
  Calendar,
  Phone,
  Mail,
  Lock,
  ExternalLink,
  Target,
  Award,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import type { Committee } from '../types'

interface CommitteeDetailModalProps {
  committee: Committee | null
  isOpen: boolean
  onClose: () => void
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

export const CommitteeDetailModal: React.FC<CommitteeDetailModalProps> = ({
  committee,
  isOpen,
  onClose,
}) => {
  const { t } = useLanguage()

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !committee) return null

  const members = committee.members || []

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="committee-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-10 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-4">
          <div className="space-y-1 pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950/60 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                <Award className="h-3 w-3" />
                {t(getCategoryTranslationKey(committee.category), committee.category)}
              </span>
              {committee.is_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  {t('committee.badge_verified', 'Verified Committee')}
                </span>
              )}
            </div>
            <h2
              id="committee-detail-title"
              className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl"
            >
              {committee.name}
            </h2>
            {committee.native_name && (
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {committee.native_name}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
            aria-label={t('action.close', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="space-y-6 p-6">
          {/* Overview & Description */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('committee.heading_about', 'About the Committee')}
            </h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {committee.description}
            </p>
          </div>

          {/* Key Objectives */}
          {committee.objectives && committee.objectives.length > 0 && (
            <div className="space-y-2 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 p-4 border border-blue-100 dark:border-blue-900/40">
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                <Target className="h-4 w-4" />
                {t('committee.heading_objectives', 'Key Charter Objectives')}
              </h4>
              <ul className="space-y-1.5 pl-2 text-xs text-slate-700 dark:text-slate-300">
                {committee.objectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Meta Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 p-4 border border-slate-100 dark:border-slate-800 text-xs">
            {committee.headquarters && (
              <div className="flex items-start gap-2">
                <Building className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    {t('committee.label_hq', 'Headquarters')}
                  </div>
                  <div className="text-slate-500">{committee.headquarters}</div>
                </div>
              </div>
            )}
            {committee.meeting_schedule && (
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    {t('committee.label_meetings', 'Assembly / Meetings')}
                  </div>
                  <div className="text-slate-500">{committee.meeting_schedule}</div>
                </div>
              </div>
            )}
          </div>

          {/* Member Roster Section (Screen 45) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                <Users className="h-4 w-4 text-blue-600" />
                {t('committee.heading_roster', 'Committee Member Roster')} ({members.length})
              </h4>
              <span className="text-xs text-slate-500">
                {t('committee.tenure', 'Tenure')}: 2024–2027
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 shadow-xs"
                >
                  <div>
                    {/* Role / Designation Badge */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                        {member.designation}
                      </span>
                      {member.tenure && (
                        <span className="text-[11px] text-slate-400">
                          {member.tenure}
                        </span>
                      )}
                    </div>

                    {/* Member Name */}
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {member.name}
                    </div>

                    {/* Location & Lineage */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                      {member.city && <span>{member.city}</span>}
                      {member.state && member.city && <span>, {member.state}</span>}
                      {member.nukh && (
                        <span className="inline-flex items-center gap-1 ml-1 text-slate-600 dark:text-slate-300">
                          • {member.nukh} ({member.gotra})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contact / Profile Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                    {/* Privacy-safe contact */}
                    {member.contact_privacy === 'PRIVATE' || !member.phone ? (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Lock className="h-3 w-3" />
                        <span>{t('committee.contact_private', 'Contact Private')}</span>
                      </span>
                    ) : (
                      <a
                        href={`tel:${member.phone}`}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline min-h-[36px]"
                        aria-label={`Call ${member.name}: ${member.phone}`}
                      >
                        <Phone className="h-3 w-3" />
                        <span>{member.phone}</span>
                      </a>
                    )}

                    {/* Profile Link if census linked */}
                    {member.person_id ? (
                      <Link
                        to={`/people/${member.person_id}`}
                        className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 min-h-[36px]"
                        aria-label={`View census profile of ${member.name}`}
                      >
                        <span>{t('committee.view_profile', 'Profile')}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : member.email ? (
                      <a
                        href={`mailto:${member.email}`}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 min-h-[36px]"
                        aria-label={`Email ${member.name}`}
                      >
                        <Mail className="h-3 w-3" />
                        <span>Email</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            {t('action.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  )
}
