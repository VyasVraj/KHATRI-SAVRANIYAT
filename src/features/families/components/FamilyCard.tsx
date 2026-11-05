/**
 * FamilyCard — Comprehensive Family Summary Card.
 *
 * Requirements:
 * - Display Family Name / Household Title.
 * - Display Family Head name and details (with Crown icon).
 * - Display selected Gotra and Nukh (with lineage tags).
 * - Display Family Location (City, State, Country).
 * - Display Total number of family members.
 * - Allow the user to open the family profile and view its members.
 * - Highlight newly created families.
 */

import React from 'react'
import { Users, Crown, MapPin, ArrowRight, Sparkles } from 'lucide-react'
import type { FamilyWithDetails } from '../services/families.service'
import { PRIVACY_LEVEL_LABELS, ROUTES } from '@/constants/app'
import type { PrivacyLevel } from '@/types'
import { Link } from 'react-router-dom'

interface FamilyCardProps {
  family: FamilyWithDetails
  /** Optional click handler — e.g. navigate to family detail */
  onClick?: () => void
  isHighlighted?: boolean
}

/**
 * Family summary card for census and My Family directory views.
 */
export const FamilyCard: React.FC<FamilyCardProps> = ({
  family,
  onClick,
  isHighlighted = false,
}) => {
  const location = [family.city, family.state, family.country]
    .filter(Boolean)
    .join(', ')

  const profilePrivacyLabel =
    PRIVACY_LEVEL_LABELS[family.profile_privacy as PrivacyLevel] ?? family.profile_privacy

  const memberCount = family.member_count ?? 1

  return (
    <div
      className={[
        'rounded-xl border bg-white p-5 shadow-xs transition-all hover:shadow-md relative',
        isHighlighted
          ? 'border-brand-500 bg-brand-50/20 ring-2 ring-brand-400/40'
          : 'border-navy-200 hover:border-brand-300',
      ]
        .filter(Boolean)
        .join(' ')}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      aria-label={`View ${family.family_name} family record`}
    >
      {/* Newly Registered Highlight Badge */}
      {isHighlighted && (
        <div className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-sm">
          <Sparkles className="h-3 w-3" />
          <span>Newly Registered Family</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Left: Info */}
        <div className="space-y-3 min-w-0 flex-1">
          {/* Header Row: Title & Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-navy-900 truncate">
              {family.family_name}
            </h3>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 border border-teal-200">
                <Users className="h-3.5 w-3.5" />
                {memberCount} {memberCount === 1 ? 'Member' : 'Members'}
              </span>
              <span className="inline-flex items-center rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-medium text-navy-700">
                {profilePrivacyLabel}
              </span>
            </div>
          </div>

          {/* Family Head Section */}
          <div className="flex items-center gap-2 rounded-lg bg-amber-50/70 border border-amber-200/80 px-3 py-1.5 text-xs text-amber-900">
            <Crown className="h-4 w-4 text-amber-700 shrink-0" />
            <span className="font-semibold text-amber-800">Family Head:</span>
            {family.head ? (
              <span className="font-bold text-navy-900 truncate">{family.head.name}</span>
            ) : (
              <span className="text-amber-700 italic">No Head designated</span>
            )}
          </div>

          {/* Location & Heritage Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* Location */}
            {location && (
              <div className="flex items-center gap-1.5 text-navy-600 truncate">
                <MapPin className="h-3.5 w-3.5 text-navy-400 shrink-0" />
                <span className="truncate">{location}</span>
              </div>
            )}

            {/* Cultural Lineage (Gotra & Nukh) */}
            {(family.gotra || family.nukh) && (
              <div className="flex items-center gap-2 text-navy-600 flex-wrap">
                {family.gotra && family.nukh ? (
                  <span className="rounded bg-navy-100 px-2 py-0.5 font-medium text-navy-800">
                    {family.gotra} · {family.nukh}
                  </span>
                ) : (
                  <>
                    {family.gotra && (
                      <span className="rounded bg-navy-100 px-2 py-0.5 font-medium text-navy-800">
                        Gotra: {family.gotra}
                      </span>
                    )}
                    {family.nukh && (
                      <span className="rounded bg-navy-100 px-2 py-0.5 font-medium text-navy-800">
                        Nukh: {family.nukh}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Optional Family Description */}
          {family.description && (
            <p className="text-xs text-navy-600 line-clamp-2 pt-1 border-t border-navy-100">
              {family.description}
            </p>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex sm:flex-col items-end justify-between shrink-0 pt-2 sm:pt-0">
          <Link
            to={ROUTES.FAMILY_DETAIL(family.id)}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-navy-800 transition-colors"
          >
            <span>View Profile</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
