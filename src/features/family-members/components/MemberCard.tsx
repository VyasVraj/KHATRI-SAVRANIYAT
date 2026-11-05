/**
 * MemberCard — Renders a single family member in the family roster.
 *
 * Displays person identity, role, head status, joined/left dates,
 * and management action buttons when authorized (canManageMembers).
 *
 * PERSON != USER:
 * Links to the census person profile (/people/:personId).
 */

import { Link } from 'react-router-dom'
import { Crown, Calendar, Pencil, UserMinus, ArrowRightLeft } from 'lucide-react'
import type { FamilyMemberWithPerson } from '../services/family-members.service'
import { FAMILY_ROLE_LABELS } from '@/constants/app'
import { ROUTES } from '@/constants/app'
import { Button } from '@/components/forms/Button'

/** Formats an ISO timestamp to locale date string. */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export interface MemberCardProps {
  member: FamilyMemberWithPerson
  canManageMembers?: boolean
  onEdit?: (member: FamilyMemberWithPerson) => void
  onTransferHead?: (member: FamilyMemberWithPerson) => void
  onRemove?: (member: FamilyMemberWithPerson) => void
}

export function MemberCard({
  member,
  canManageMembers = false,
  onEdit,
  onTransferHead,
  onRemove,
}: MemberCardProps) {
  const isFormer = Boolean(member.left_at)
  const isHead = member.is_head && !isFormer
  const personName = member.person
    ? `${member.person.first_name} ${member.person.last_name}`
    : 'Unknown Person'
  const roleLabel = FAMILY_ROLE_LABELS[member.role] ?? member.role

  return (
    <article
      data-testid={`member-card-${member.id}`}
      className={`rounded-lg border p-4 transition-colors ${
        isFormer
          ? 'border-navy-200 bg-navy-50/50 opacity-75'
          : 'border-navy-200 bg-white shadow-sm'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Person details */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={ROUTES.PERSON_DETAIL(member.person_id)}
              className="font-medium text-navy-900 hover:text-teal-700 hover:underline"
            >
              {personName}
            </Link>

            {/* Head of Family Badge */}
            {isHead && (
              <span
                data-testid="head-badge"
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
              >
                <Crown className="h-3 w-3" aria-hidden="true" />
                Ghar Mukhi (Head of Family)
              </span>
            )}

            {/* Role Badge */}
            <span
              data-testid="role-badge"
              className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-700"
            >
              {roleLabel}
            </span>

            {/* Former Member Badge */}
            {isFormer && (
              <span
                data-testid="former-badge"
                className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
              >
                Departed / Former
              </span>
            )}
          </div>

          {/* Temporal dates */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Joined: {formatDate(member.joined_at)}
            </span>
            {isFormer && member.left_at && (
              <span className="text-red-600">Left: {formatDate(member.left_at)}</span>
            )}
            <Link
              to={`${ROUTES.PERSON_DETAIL(member.person_id)}#relationships`}
              className="text-navy-500 hover:text-brand-600 hover:underline"
            >
              Relationships &rarr;
            </Link>
          </div>
        </div>

        {/* Action buttons (only for active members when caller can manage) */}
        {canManageMembers && !isFormer && (
          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
            {!isHead && onTransferHead && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onTransferHead(member)}
                className="text-xs text-amber-700 hover:bg-amber-50 hover:border-amber-300"
                title="Designate as new Head of Family"
              >
                <ArrowRightLeft className="h-3 w-3" />
                Make Head
              </Button>
            )}

            {onEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(member)}
                className="text-xs"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}

            {onRemove && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRemove(member)}
                className="text-xs text-red-600 hover:bg-red-50 hover:border-red-300"
              >
                <UserMinus className="h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
