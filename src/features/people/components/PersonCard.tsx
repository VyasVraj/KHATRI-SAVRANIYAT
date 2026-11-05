/**
 * PersonCard — compact person summary card.
 *
 * Display-only. Shows a person's name, optional gender badge, and
 * community identity fields (gotra/kul/nukh) where the record makes
 * them available.
 *
 * This component does NOT enforce privacy rules — RLS at the database level
 * governs which records and fields are returned to the client. This component
 * renders whatever the service layer provides.
 *
 * Protected/system fields (id, created_by, user_id, status, etc.) are not
 * rendered. This component is intentionally limited to display-safe fields.
 */

import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

/** Human-readable gender labels */
const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
}

/** Gender badge colours */
const GENDER_BADGE_CLASSES: Record<string, string> = {
  MALE: 'bg-blue-50 text-blue-700',
  FEMALE: 'bg-pink-50 text-pink-700',
  OTHER: 'bg-purple-50 text-purple-700',
  PREFER_NOT_TO_SAY: 'bg-navy-100 text-navy-600',
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.trim()[0]?.toUpperCase() ?? ''
  const l = lastName.trim()[0]?.toUpperCase() ?? ''
  return f + l
}

interface PersonCardProps {
  person: PersonRow
  /** Optional click handler — e.g. navigate to person detail */
  onClick?: () => void
}

/**
 * Compact person summary card suitable for use in lists and grids.
 */
export function PersonCard({ person, onClick }: PersonCardProps) {
  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  const initials = getInitials(person.first_name, person.last_name)

  const communityIdentity = [person.gotra, person.nukh]
    .filter(Boolean)
    .join(' · ')

  const genderBadge = person.gender ? GENDER_BADGE_CLASSES[person.gender] : null
  const genderLabel = person.gender ? GENDER_LABELS[person.gender] : null

  return (
    <div
      className={[
        'flex items-start gap-4 rounded-lg border border-navy-200 bg-white p-4 shadow-sm',
        onClick ? 'cursor-pointer transition-colors hover:border-brand-300 hover:bg-brand-50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
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
      aria-label={onClick ? `View ${fullName}'s record` : undefined}
    >
      {/* Avatar initials */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
        aria-hidden="true"
      >
        {initials}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900">{fullName}</p>

        {/* Optional maiden name */}
        {person.maiden_name && (
          <p className="text-xs text-navy-500">née {person.maiden_name}</p>
        )}

        {/* Community identity */}
        {communityIdentity && (
          <p className="mt-0.5 text-xs text-navy-500">{communityIdentity}</p>
        )}

        {/* Gender badge */}
        {genderBadge && genderLabel && (
          <span
            className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${genderBadge}`}
          >
            {genderLabel}
          </span>
        )}
      </div>
    </div>
  )
}
