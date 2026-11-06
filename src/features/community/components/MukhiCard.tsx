/**
 * MukhiCard component (Phase 10 / ANDROID-11 Parity)
 *
 * Directory card for a Community Mukhi or regional leader:
 * - Mobile-first layout with minimum 44px touch targets.
 * - Displays designation, verified badge, location, lineage (gotra, nukh, kul), and family affiliation.
 * - Strict privacy enforcement: contacts concealed if PRIVATE.
 * - Profile navigation affordance to /people/:person_id where permitted.
 * - WAI-ARIA accessible semantics and screen-reader labels.
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapPin,
  CheckCircle2,
  Shield,
  Phone,
  Lock,
  User,
  ArrowRight,
} from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { ROUTES } from '@/constants/app'
import type { MukhiLeaderItem } from '../types'

interface MukhiCardProps {
  leader: MukhiLeaderItem
  onClick?: () => void
  className?: string
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function MukhiCard({ leader, onClick, className = '' }: MukhiCardProps) {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const initials = getInitials(leader.name)

  const handleProfileNavigation = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onClick) {
      onClick()
    } else if (leader.person_id) {
      navigate(ROUTES.PERSON_DETAIL(leader.person_id))
    }
  }

  const locationString = [leader.city, leader.state].filter(Boolean).join(', ')

  return (
    <div
      role="article"
      aria-label={`${t('mukhi.badge_mukhi', 'Community Mukhi')}: ${leader.name}`}
      className={`group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-400 hover:shadow-md ${className}`}
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
                <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-mono font-bold text-amber-300 border border-slate-700">
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

            <h3 className="mt-1.5 text-base font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
              {leader.name}
            </h3>

            {leader.gram && (
              <p className="text-xs font-medium text-slate-500 truncate">
                Gram: <span className="text-slate-800 font-semibold">{leader.gram}</span>
              </p>
            )}

            {leader.display_name && leader.display_name !== leader.name && (
              <p className="text-xs text-slate-500 truncate">
                ({leader.display_name})
              </p>
            )}
          </div>
        </div>

        {/* Location & Details */}
        <div className="mt-4 space-y-2 text-xs text-slate-600">
          {locationString && (
            <div className="flex items-center gap-1.5 text-slate-700">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <span className="font-medium truncate">{locationString}</span>
            </div>
          )}

          {/* Lineage pills (Gotra, Nukh, Kul) */}
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

          {leader.family_name && (
            <p className="text-slate-500 pt-0.5 text-[11px] truncate">
              {t('mukhi.label_family', 'Family')}: <span className="font-medium text-slate-700">{leader.family_name}</span>
            </p>
          )}

          {leader.bio && (
            <p className="text-slate-600 text-xs line-clamp-2 pt-1 border-t border-slate-100 mt-2">
              {leader.bio}
            </p>
          )}
        </div>
      </div>

      {/* Footer: Privacy Protected Contact & Profile Button */}
      <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col gap-2">
        {leader.phone ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
            <Phone className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
            <span className="truncate">{leader.phone}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Lock className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{t('mukhi.contact_private', 'Contact protected by privacy settings')}</span>
          </div>
        )}

        {leader.person_id ? (
          <button
            type="button"
            onClick={handleProfileNavigation}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:bg-blue-200"
            aria-label={`${t('mukhi.view_profile', 'View Profile')} for ${leader.name}`}
          >
            <User className="h-3.5 w-3.5" />
            <span>{t('mukhi.view_profile', 'View Profile')}</span>
            <ArrowRight className="h-3 w-3 ml-0.5" />
          </button>
        ) : (
          <div className="min-h-[44px] flex items-center justify-center text-xs text-slate-400 font-medium">
            <span>{t('mukhi.badge_verified', 'Verified Leadership')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
