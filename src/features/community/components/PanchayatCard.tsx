/**
 * Panchayat Leader Card Component (Screen 46 — ANDROID-13 Parity)
 */

import React from 'react'
import {
  ShieldCheck,
  MapPin,
  Lock,
  Phone,
  User as UserIcon,
  ExternalLink,
  Crown,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/features/i18n'
import type { PanchayatLeaderItem } from '../types'

interface PanchayatCardProps {
  leader: PanchayatLeaderItem
}

export const PanchayatCard: React.FC<PanchayatCardProps> = ({ leader }) => {
  const { t } = useLanguage()

  const getSectionBadge = (section: string) => {
    switch (section) {
      case 'EXECUTIVE':
        return {
          label: t('panchayat.sec_executive', 'Executive Council'),
          classes: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300',
        }
      case 'ZONAL':
        return {
          label: t('panchayat.sec_zonal', 'Regional Representative'),
          classes: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
        }
      case 'ADVISORY':
        return {
          label: t('panchayat.sec_advisory', 'Senior Advisory Council'),
          classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        }
      default:
        return {
          label: section,
          classes: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
        }
    }
  }

  const badge = getSectionBadge(leader.section)

  return (
    <div
      role="article"
      aria-label={`${leader.name} - ${leader.designation}`}
      className="flex h-full flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md"
    >
      <div className="space-y-3">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.classes}`}
          >
            <Crown className="h-3 w-3" />
            {badge.label}
          </span>

          <div className="flex items-center gap-1.5">
            {leader.is_verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                {t('panchayat.badge_verified', 'Verified Officer')}
              </span>
            )}
            {leader.term && (
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {leader.term}
              </span>
            )}
          </div>
        </div>

        {/* Name & Designation */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            {leader.designation}
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {leader.name}
          </h3>
          {leader.display_name && leader.display_name !== leader.name && (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {leader.display_name}
            </p>
          )}
        </div>

        {/* Location & Zone */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>
            {leader.city}, {leader.state}
          </span>
          <span className="text-slate-400">•</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {leader.zone}
          </span>
        </div>

        {/* Lineage Info */}
        {(leader.nukh || leader.gotra) && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
            {leader.nukh && (
              <div>
                <span className="text-slate-400 font-medium">
                  {t('panchayat.label_nukh', 'Nukh')}:{' '}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {leader.nukh}
                </span>
                {leader.gotra && (
                  <span className="text-slate-500"> ({leader.gotra})</span>
                )}
              </div>
            )}

          </div>
        )}

        {/* Bio / Portfolio */}
        {leader.bio && (
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
            {leader.bio}
          </p>
        )}
      </div>

      {/* Footer / Contact Shield & Profile Link */}
      <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        {leader.contact_privacy === 'PRIVATE' || !leader.phone ? (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Lock className="h-3 w-3" />
            <span>{t('panchayat.contact_private', 'Contact Private')}</span>
          </span>
        ) : (
          <a
            href={`tel:${leader.phone}`}
            className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            aria-label={`Call ${leader.name}: ${leader.phone}`}
          >
            <Phone className="h-3.5 w-3.5" />
            <span>{leader.phone}</span>
          </a>
        )}

        {leader.person_id ? (
          <Link
            to={`/people/${leader.person_id}`}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label={`View census profile of ${leader.name}`}
          >
            <UserIcon className="h-3.5 w-3.5" />
            <span>{t('panchayat.view_profile', 'Profile')}</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
