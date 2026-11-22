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
import { Crown, Calendar, Pencil, UserMinus, ArrowRightLeft, Shield, Briefcase } from 'lucide-react'
import type { FamilyMemberWithPerson } from '../services/family-members.service'
import { FAMILY_ROLE_LABELS } from '@/constants/app'
import { ROUTES } from '@/constants/app'
import { Button } from '@/components/forms/Button'
import { toProperCaseName } from '@/utils/text-casing'
import { formatRelationshipDisplay } from '@/constants/familyRelationships'
import { AvatarImage } from '@/features/media'

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
  currentUserId?: string | null
  familyMukhi?: { id: string; full_name: string; gram?: string | null } | null
  onEdit?: (member: FamilyMemberWithPerson) => void
  onTransferHead?: (member: FamilyMemberWithPerson) => void
  onRemove?: (member: FamilyMemberWithPerson) => void
}

export function MemberCard({
  member,
  canManageMembers = false,
  currentUserId = null,
  familyMukhi = null,
  onEdit,
  onTransferHead,
  onRemove,
}: MemberCardProps) {
  const isFormer = Boolean(member.left_at)
  const isHead = member.is_head && !isFormer
  const personName = member.person
    ? toProperCaseName(`${member.person.first_name} ${member.person.last_name}`)
    : 'Unknown Person'
  const roleLabel = FAMILY_ROLE_LABELS[member.role] ?? member.role

  // Strict Matrix: Authenticated normal users can edit ONLY their OWN existing linked person record (persons.user_id = auth.uid()).
  // Family head status does NOT grant permission to edit other members' personal profiles.
  // Super Admin and Admin retain system administrative management.
  const isSelf = Boolean(currentUserId && member.person?.user_id === currentUserId)
  const canEditThisMember = isSelf || canManageMembers
  const canAdministerMember = Boolean(canManageMembers && !isFormer)

  // Only the active designated head displays 'Head of Family'.
  // If a member is not active head, avoid showing 'Head of Family' even if DB role has legacy 'HEAD'.
  const formattedRelationship = member.relationship_to_head
    ? formatRelationshipDisplay(member.relationship_to_head)
    : null

  const displayRoleLabel =
    !isHead && member.role === 'HEAD'
      ? 'Family Member'
      : formattedRelationship || roleLabel
  // Prevent duplicate 'Head of Family' badge if member already has the crown head badge
  const showRoleBadge = !isHead || (isHead && member.role !== 'HEAD')

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
        {/* Person details with profile avatar */}
        <div className="flex items-center gap-3 min-w-0">
          <AvatarImage
            src={member.person?.avatar_url}
            name={personName}
            alt={personName}
            size="md"
            shape="circle"
          />
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={ROUTES.PERSON_DETAIL(member.person_id)}
                className="font-medium text-navy-900 hover:text-teal-700 hover:underline"
              >
                {personName}
              </Link>

            {member.person?.age != null && (
              <span
                data-testid="member-age"
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200"
              >
                {member.person.age} yrs
              </span>
            )}

            {/* Head of Family Badge */}
            {isHead && (
              <span
                data-testid="head-badge"
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
              >
                <Crown className="h-3 w-3" aria-hidden="true" />
                Head of Family
              </span>
            )}

            {/* Role Badge */}
            {showRoleBadge && (
              <span
                data-testid="role-badge"
                className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-700"
              >
                {displayRoleLabel}
              </span>
            )}

            {/* Occupation Badge */}
            {member.person?.occupation &&
              member.person.occupation !== 'Occupation Pending' &&
              member.person.occupation !== 'Occupation Not Provided' && (
                <span
                  data-testid="member-occupation-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-800"
                >
                  <Briefcase className="h-3 w-3 text-blue-600" />
                  {(member.person as unknown as { custom_occupation?: string | null })?.custom_occupation &&
                  (member.person as unknown as { custom_occupation?: string | null }).custom_occupation!.toLowerCase() !== member.person.occupation.toLowerCase()
                    ? `${member.person.occupation} (${(member.person as unknown as { custom_occupation?: string | null }).custom_occupation})`
                    : member.person.occupation}
                </span>
              )}

            {/* Deceased Badge */}
            {(member.person?.is_deceased || member.person?.status === 'DECEASED' || Boolean(member.person?.date_of_death)) && (
              <span
                data-testid="deceased-badge"
                className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 border border-slate-300"
              >
                Deceased
              </span>
            )}

            {/* Former Member Badge */}
            {isFormer && (
              <span
                data-testid="former-badge"
                className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
              >
                Departed / Former
              </span>
            )}

            {/* Assigned Family Mukhi Badge */}
            {familyMukhi && (
              <span
                data-testid="member-mukhi-badge"
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-medium text-blue-800"
                title={`Assigned Mukhi: ${familyMukhi.full_name}${familyMukhi.gram ? ` (${familyMukhi.gram})` : ''}`}
              >
                <Shield className="h-3 w-3 text-blue-600" />
                Mukhi: {familyMukhi.full_name}
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
      </div>

        {/* Action buttons (only for active members when authorized) */}
        {!isFormer && (canAdministerMember || canEditThisMember) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
            {canAdministerMember && !isHead && onTransferHead && (
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

            {canEditThisMember && onEdit && (
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

            {canAdministerMember && onRemove && (
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
