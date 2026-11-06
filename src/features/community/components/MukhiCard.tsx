/**
 * MukhiCard component (Phase 10 / ANDROID-11 Parity)
 *
 * Directory card for a Community Mukhi or regional leader:
 * - Mobile-first layout with minimum 44px touch targets.
 * - Displays Full Name, assigned Mukhi Unique ID (e.g. MUK-0001), Region / Gram / City.
 * - Displays Mobile Number with a clickable phone call action (tel:link).
 * - "View Profile" affordance opening the individual Mukhi profile details modal.
 * - WAI-ARIA accessible semantics and screen-reader labels.
 */

import React from 'react'
import {
  MapPin,
  CheckCircle2,
  Shield,
  Phone,
  User,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { MukhiLeaderItem } from '../types'

interface MukhiCardProps {
  leader: MukhiLeaderItem
  onClick?: () => void
  onViewDetails?: (leader: MukhiLeaderItem) => void
  className?: string
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function MukhiCard({ leader, onClick, onViewDetails, className = '' }: MukhiCardProps) {
  const { t } = useLanguage()

  const initials = getInitials(leader.name)

  const handleOpenDetails = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onViewDetails) {
      onViewDetails(leader)
    } else if (onClick) {
      onClick()
    }
  }

  const regionLocation = leader.gram || leader.city || [leader.city, leader.state].filter(Boolean).join(', ')

  return (
    <div
      role="article"
      aria-label={`${t('mukhi.badge_mukhi', 'Community Mukhi')}: ${leader.name}`}
      onClick={handleOpenDetails}
      className={`group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-400 hover:shadow-md cursor-pointer ${className}`}
    >
      <div>
        {/* Header: Avatar / Initials + Designation & Badges */}
        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            {leader.avatar_url ? (
              <img
                src={leader.avatar_url}
                alt={leader.name}
                className="h-14 w-14 rounded-full object-cover border-2 border-blue-100 shadow-sm"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-lg border-2 border-blue-200 shadow-sm">
                {initials}
              </div>
            )}
            {leader.is_verified && (
              <span
                title={t('mukhi.badge_verified', 'Verified Leadership')}
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {leader.mukhi_unique_id && (
                <span className="inline-flex items-center rounded-md bg-slate-900 px-2 py-0.5 text-xs font-mono font-bold text-amber-300 border border-slate-700">
                  {leader.mukhi_unique_id}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                <Shield className="h-3 w-3" />
                {leader.designation || t('mukhi.badge_mukhi', 'Community Mukhi')}
              </span>
              {leader.authority_status === 'ACTIVE' && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  Active
                </span>
              )}
            </div>

            <h3
              onClick={handleOpenDetails}
              className="mt-1.5 text-base font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors"
            >
              {leader.name}
            </h3>

            {leader.display_name && leader.display_name !== leader.name && (
              <p className="text-xs text-slate-500 truncate">
                ({leader.display_name})
              </p>
            )}
          </div>
        </div>

        {/* Location & Region / Gram / City */}
        <div className="mt-4 space-y-2 text-xs text-slate-600">
          {regionLocation && (
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <MapPin className="h-4 w-4 flex-shrink-0 text-indigo-600" />
              <span className="truncate">{regionLocation}</span>
            </div>
          )}

          {/* Lineage pills if available */}
          {(leader.nukh || leader.gotra) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {leader.nukh && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 font-medium">
                  {leader.nukh}
                </span>
              )}
              {leader.gotra && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                  Gotra: {leader.gotra}
                </span>
              )}
            </div>
          )}

          {leader.bio && (
            <p className="text-slate-600 text-xs line-clamp-2 pt-1 border-t border-slate-100 mt-2">
              {leader.bio}
            </p>
          )}
        </div>
      </div>

      {/* Footer: Clickable Mobile Number Action & View Profile Button */}
      <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col gap-2.5">
        {leader.phone ? (
          <a
            href={`tel:${leader.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[44px] items-center justify-between text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg border border-emerald-200 transition-colors"
            aria-label={`Call ${leader.name} at ${leader.phone}`}
          >
            <div className="flex items-center gap-2 truncate">
              <Phone className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
              <span className="font-mono tracking-wide">{leader.phone}</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider shrink-0 ml-2">
              Call Now
            </span>
          </a>
        ) : (
          <div className="flex min-h-[44px] items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <span className="italic">Phone not listed</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleOpenDetails}
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:bg-blue-200"
          aria-label={`${t('mukhi.view_profile', 'View Profile')} for ${leader.name}`}
        >
          <User className="h-3.5 w-3.5" />
          <span>{t('mukhi.view_profile', 'View Profile')}</span>
          <ArrowRight className="h-3 w-3 ml-0.5" />
        </button>
      </div>
    </div>
  )
}
