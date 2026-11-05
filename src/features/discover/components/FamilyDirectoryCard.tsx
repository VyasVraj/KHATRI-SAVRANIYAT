/**
 * FamilyDirectoryCard component
 *
 * Directory-safe summary card for a community family unit.
 *
 * PRIVACY & SECURITY INVARIANTS:
 * - Displays ONLY public directory attributes:
 *   family name, description, lineage (gotra, nukh, kul),
 *   residential location (city, state, country), status, and verification state.
 * - Internal identifiers and timestamps (created_by, created_at, updated_at, deleted_at)
 *   are strictly excluded and never rendered.
 * - ZERO access to private member records or user credentials.
 * - Navigates to /families/:id on interaction.
 */

import { useNavigate } from 'react-router-dom'
import { Users, MapPin, CheckCircle2, Clock, AlertCircle, GitFork, Home } from 'lucide-react'
import type { FamilyDiscoveryResult } from '../types'
import { ROUTES } from '@/constants/app'
import { useTranslation } from '@/features/i18n'

interface FamilyDirectoryCardProps {
  family: FamilyDiscoveryResult
  onClick?: () => void
  className?: string
}

export function FamilyDirectoryCard({
  family,
  onClick,
  className = '',
}: FamilyDirectoryCardProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const location = [family.city, family.state, family.country]
    .filter(Boolean)
    .join(', ')

  const lineageBadges = [
    family.gotra ? `Gotra: ${family.gotra}` : null,
    family.nukh ? `Nukh: ${family.nukh}` : null,
  ].filter(Boolean)

  function handleClick() {
    if (onClick) {
      onClick()
    } else {
      navigate(ROUTES.FAMILY_DETAIL(family.id))
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      aria-label={`View ${family.family_name} family record`}
      className={[
        'group flex flex-col justify-between rounded-lg border border-navy-200 bg-white p-4 shadow-sm',
        'cursor-pointer transition-all duration-150 hover:border-brand-400 hover:shadow-md focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
        className,
      ].join(' ')}
    >
      <div>
        {/* Top row: Icon + Name + Verification */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 group-hover:bg-teal-100"
            aria-hidden="true"
          >
            <Users className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-base font-semibold text-navy-900 group-hover:text-brand-600">
                {family.family_name}
              </h3>
              {family.verification_status === 'VERIFIED' && (
                <span title="Verified Family" aria-label="Verified Family">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                </span>
              )}
            </div>

            {/* Location (City, State, Country) */}
            {location && (
              <div className="mt-1 flex items-center gap-1 text-xs text-navy-600">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-navy-400" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description preview */}
        {family.description && (
          <p className="mt-3 line-clamp-2 text-xs text-navy-600">
            {family.description}
          </p>
        )}

        {/* Lineage (Gotra, Nukh, Kul) */}
        {lineageBadges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-navy-600">
            {lineageBadges.map((badge, idx) => (
              <span
                key={idx}
                className="rounded bg-navy-50 px-1.5 py-0.5 font-medium text-navy-700"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Footer: Status, Verification, and Quick Actions */}
      <div className="mt-4 space-y-2.5 border-t border-navy-100 pt-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <div>
            {family.status === 'ACTIVE' ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                Active
              </span>
            ) : family.status === 'ARCHIVED' ? (
              <span className="rounded-full bg-navy-100 px-2 py-0.5 font-medium text-navy-600">
                Archived
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                Draft
              </span>
            )}
          </div>

          <div>
            {family.verification_status === 'VERIFIED' ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                Verified
              </span>
            ) : family.verification_status === 'PENDING' ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Clock className="h-3 w-3" />
                <span>Pending</span>
              </span>
            ) : family.verification_status === 'REJECTED' ? (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertCircle className="h-3 w-3" />
                <span>Rejected</span>
              </span>
            ) : (
              <span className="text-navy-400">Unverified</span>
            )}
          </div>
        </div>

        {/* Quick Action Navigation Buttons (Screen 20 Parity) */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate(ROUTES.FAMILY_DETAIL(family.id))
            }}
            className="flex-1 inline-flex min-h-[44px] items-center justify-center gap-1 rounded border border-navy-200 bg-white py-2 px-2 text-[11px] font-medium text-navy-700 hover:bg-navy-50 hover:text-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
            aria-label={`${t('directory.view_family')} for ${family.family_name}`}
          >
            <Home className="h-3.5 w-3.5 text-navy-400" />
            <span>{t('directory.view_family')}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/tree?familyId=${family.id}`)
            }}
            className="flex-1 inline-flex min-h-[44px] items-center justify-center gap-1 rounded border border-navy-200 bg-white py-2 px-2 text-[11px] font-medium text-navy-700 hover:bg-navy-50 hover:text-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
            aria-label={`${t('directory.view_tree')} for ${family.family_name}`}
          >
            <GitFork className="h-3.5 w-3.5 text-navy-400" />
            <span>{t('directory.view_tree')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
