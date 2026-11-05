/**
 * PersonFamiliesList — Displays family units in which a person is a member.
 *
 * Reverse lookup component for the person detail view (/people/:personId).
 * Sourced from usePersonFamilies (public.family_members joined with public.families).
 *
 * Displays:
 * - Family name (linked to /families/:familyId)
 * - Role in the family (using FAMILY_ROLE_LABELS)
 * - Head of family indicator (Crown icon)
 * - Location (city, state) if available
 * - Joined date and departure status when applicable
 * - Toggle for showing former memberships
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Crown, Calendar, MapPin } from 'lucide-react'
import { usePersonFamilies } from '../hooks/usePersonFamilies'
import { FAMILY_ROLE_LABELS, ROUTES } from '@/constants/app'

/** Formats an ISO timestamp to locale date string. */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export interface PersonFamiliesListProps {
  personId: string
}

export function PersonFamiliesList({ personId }: PersonFamiliesListProps) {
  const [includeFormer, setIncludeFormer] = useState(false)
  const { data: memberships, isLoading, error } = usePersonFamilies(personId, {
    includeFormer,
  })

  return (
    <section
      aria-labelledby="family-memberships-heading"
      className="rounded-lg border border-navy-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-navy-600" aria-hidden="true" />
          <h2 id="family-memberships-heading" className="text-lg font-semibold text-navy-900">
            Family Memberships
          </h2>
        </div>

        {/* Former memberships toggle */}
        <label className="flex items-center gap-2 text-xs text-navy-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeFormer}
            onChange={(e) => setIncludeFormer(e.target.checked)}
            className="rounded border-navy-300 text-teal-600 focus:ring-teal-500"
          />
          Show former memberships
        </label>
      </div>

      {isLoading && (
        <p className="py-4 text-sm text-navy-500">Loading family memberships…</p>
      )}

      {error && (
        <p role="alert" className="py-4 text-sm text-red-600">
          {(error as { message?: string })?.message ?? 'Could not load family memberships.'}
        </p>
      )}

      {!isLoading && !error && (!memberships || memberships.length === 0) && (
        <div className="rounded-lg border border-dashed border-navy-200 p-6 text-center text-sm text-navy-500">
          Not currently listed in any family records
        </div>
      )}

      {!isLoading && !error && memberships && memberships.length > 0 && (
        <ul className="space-y-3" role="list">
          {memberships.map((membership) => {
            const family = membership.family
            const isFormer = Boolean(membership.left_at)
            const isHead = membership.is_head && !isFormer
            const roleLabel = FAMILY_ROLE_LABELS[membership.role] ?? membership.role
            const location = family
              ? [family.city, family.state].filter(Boolean).join(', ')
              : ''

            return (
              <li
                key={membership.id}
                data-testid={`person-family-item-${membership.id}`}
                className={`rounded-md border p-3 transition-colors ${
                  isFormer
                    ? 'border-navy-200 bg-navy-50/50 opacity-75'
                    : 'border-navy-200 bg-white hover:border-navy-300'
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {family ? (
                        <Link
                          to={ROUTES.FAMILY_DETAIL(family.id)}
                          className="font-medium text-navy-900 hover:text-teal-700 hover:underline"
                        >
                          {family.family_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-navy-700">Family record</span>
                      )}

                      {/* Role badge */}
                      <span className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-800">
                        {roleLabel}
                      </span>

                      {/* Head indicator */}
                      {isHead && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <Crown className="h-3 w-3" aria-hidden="true" />
                          Head
                        </span>
                      )}

                      {/* Former member badge */}
                      {isFormer && (
                        <span className="inline-flex items-center rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-500">
                          Former Member
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-navy-500">
                      {location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden="true" />
                        Joined {formatDate(membership.joined_at)}
                      </span>
                      {isFormer && (
                        <span>Left {formatDate(membership.left_at)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
