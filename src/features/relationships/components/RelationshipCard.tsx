/**
 * RelationshipCard — Displays an individual interpersonal relationship.
 *
 * Shows related person name (linked to /people/:id), role badge,
 * optional notes, and Edit/Remove management actions when authorized.
 *
 * PRIVACY & SECURITY:
 * - If relatedPerson metadata is null (e.g. restricted in elevated query),
 *   renders an anonymized fallback without any profile link or leaked attributes.
 * - Edit and Remove actions are presented only if the current user is
 *   the record creator or an authorized community moderator.
 * - Database RLS and triggers remain authoritative.
 */

import { Link } from 'react-router-dom'
import { Pencil, Trash2, FileText } from 'lucide-react'
import type { PersonRelationshipItem } from '../types'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { ADMIN_ROLES, ROUTES } from '@/constants/app'
import { Button } from '@/components/forms/Button'

export interface RelationshipCardProps {
  item: PersonRelationshipItem
  onEdit?: (item: PersonRelationshipItem) => void
  onRemove?: (item: PersonRelationshipItem) => void
}

const ROLE_LABELS: Record<PersonRelationshipItem['role'], string> = {
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse',
  sibling: 'Sibling',
}

const ROLE_BADGE_STYLES: Record<PersonRelationshipItem['role'], string> = {
  parent: 'bg-blue-100 text-blue-800',
  child: 'bg-indigo-100 text-indigo-800',
  spouse: 'bg-rose-100 text-rose-800',
  sibling: 'bg-teal-100 text-teal-800',
}

export function RelationshipCard({ item, onEdit, onRemove }: RelationshipCardProps) {
  const { user, profile } = useAuthContext()

  const isCreator = Boolean(user?.id && item.relationship.created_by === user.id)
  const isModerator = Boolean(profile?.role && ADMIN_ROLES.includes(profile.role))
  const canManage = isCreator || isModerator

  const { relatedPerson, role, relationship } = item
  const roleLabel = ROLE_LABELS[role] ?? role
  const badgeStyle = ROLE_BADGE_STYLES[role] ?? 'bg-navy-100 text-navy-800'

  return (
    <article
      data-testid={`relationship-card-${relationship.id}`}
      className="rounded-lg border border-navy-200 bg-white p-4 shadow-sm transition-colors hover:border-navy-300"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Person Identity & Role */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {relatedPerson ? (
              <Link
                to={ROUTES.PERSON_DETAIL(relatedPerson.id)}
                className="font-medium text-navy-900 hover:text-teal-700 hover:underline"
              >
                {relatedPerson.first_name} {relatedPerson.last_name}
              </Link>
            ) : (
              <span className="font-medium text-navy-500 italic">
                Unavailable Record
              </span>
            )}

            {/* Role Badge */}
            <span
              data-testid={`role-badge-${role}`}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}
            >
              {roleLabel}
            </span>

            {/* Gender indicator if available */}
            {relatedPerson?.gender && (
              <span className="text-xs text-navy-500">
                ({relatedPerson.gender.toLowerCase()})
              </span>
            )}
          </div>

          {/* Relationship Notes (if present) */}
          {relationship.notes && (
            <div className="flex items-start gap-1.5 pt-1 text-xs text-navy-600">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" aria-hidden="true" />
              <p className="line-clamp-2 italic">{relationship.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Actions (Creator or Moderator only) */}
        {canManage && (
          <div className="flex items-center gap-1.5 self-end sm:self-center">
            {onEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(item)}
                aria-label={`Edit notes for relationship with ${relatedPerson?.first_name ?? 'relative'}`}
                className="h-8 px-2 text-xs text-navy-600 hover:text-navy-900"
              >
                <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Button>
            )}

            {onRemove && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRemove(item)}
                aria-label={`Remove relationship with ${relatedPerson?.first_name ?? 'relative'}`}
                className="h-8 px-2 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
