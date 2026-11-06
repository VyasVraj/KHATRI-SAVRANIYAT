/**
 * MemberList — Comprehensive family membership roster component.
 *
 * Displays active and former members for a specific family.
 * Provides management controls (Add, Edit, Transfer Head, Soft-Remove)
 * when authorized (canManageMembers = isCreator || isCommunityModerator).
 *
 * PRIVACY & RLS BEHAVIOR:
 * - Read access is enforced by PostgreSQL RLS (family_members_select_community).
 * - Only active members are shown by default; former members can be toggled.
 * - Soft-removal preserves genealogical history by setting left_at timestamp.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, AlertCircle, Eye, EyeOff, Mail } from 'lucide-react'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useRemoveFamilyMember } from '../hooks/useFamilyMemberMutations'
import type { FamilyMemberWithPerson } from '../services/family-members.service'
import { MemberCard } from './MemberCard'
import { AddMemberModal } from './AddMemberModal'
import { TransferHeadModal } from './TransferHeadModal'
import { CreateInvitationModal } from '@/features/invitations'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

export interface MemberListProps {
  familyId: string
  canManageMembers?: boolean
}

export function MemberList({ familyId, canManageMembers = false }: MemberListProps) {
  const navigate = useNavigate()
  const [showFormer, setShowFormer] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [transferHeadMember, setTransferHeadMember] = useState<FamilyMemberWithPerson | null>(null)
  const [removingMember, setRemovingMember] = useState<FamilyMemberWithPerson | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  // Fetch family members (includes former if toggled)
  const {
    data: members = [],
    isLoading,
    error,
  } = useFamilyMembers(familyId, { includeFormer: showFormer })

  const removeMutation = useRemoveFamilyMember(familyId)

  // Separate active and former members
  const activeMembers = members.filter((m) => !m.left_at)
  const formerMembers = members.filter((m) => Boolean(m.left_at))
  const currentHead = activeMembers.find((m) => m.is_head) ?? null

  async function handleConfirmRemove() {
    if (!removingMember) return
    setRemoveError(null)

    try {
      await removeMutation.mutateAsync(removingMember.id)
      setRemovingMember(null)
    } catch (err) {
      setRemoveError(
        (err as { message?: string }).message ??
          'Could not remove member from this family. Please try again.'
      )
    }
  }

  return (
    <section aria-labelledby="family-roster-heading" className="space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h3 id="family-roster-heading" className="text-base font-semibold text-navy-900">
            Family Roster
          </h3>
          <span
            data-testid="member-count-badge"
            className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-700"
          >
            {activeMembers.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Former members toggle */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowFormer(!showFormer)}
            className="text-xs"
            aria-pressed={showFormer}
          >
            {showFormer ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Hide Departed
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                Show Departed
              </>
            )}
          </Button>

          {/* Add member and Invite member buttons */}
          {canManageMembers && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsInviteModalOpen(true)}
                className="text-xs"
              >
                <Mail className="h-3.5 w-3.5" />
                Invite Member
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Member
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-lg border border-navy-100 bg-white p-6 text-center text-sm text-navy-500">
          Loading family members…
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {(error as { message?: string }).message ??
                'Could not load family members. RLS privacy settings may restrict viewing.'}
            </p>
          </div>
        </div>
      )}

      {/* Soft-Remove Confirmation Modal / Banner */}
      {removingMember && (
        <div
          role="alertdialog"
          aria-labelledby="remove-confirm-title"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-3"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <div>
              <h4 id="remove-confirm-title" className="font-semibold text-red-900">
                Confirm Member Departure
              </h4>
              <p className="mt-1 text-xs text-red-700">
                Are you sure you want to remove{' '}
                <strong>
                  {removingMember.person
                    ? `${removingMember.person.first_name} ${removingMember.person.last_name}`
                    : 'this member'}
                </strong>{' '}
                from the active family roster? This performs a soft-exit (sets departure timestamp) to
                preserve genealogical records.
              </p>
            </div>
          </div>

          {removeError && <p className="text-xs font-medium text-red-700">{removeError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setRemovingMember(null)
                setRemoveError(null)
              }}
              disabled={removeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmRemove}
              isLoading={removeMutation.isPending}
              disabled={removeMutation.isPending}
              className="bg-red-600 text-white hover:bg-red-700 border-red-600"
            >
              Confirm Removal
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && activeMembers.length === 0 && (
        <div className="rounded-lg border border-dashed border-navy-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-navy-800">No active family members registered yet.</p>
          <p className="mt-1 text-xs text-navy-500">
            {canManageMembers
              ? 'Click "+ Add Member" to add existing community members to this family.'
              : 'Members will appear here once registered by the family creator.'}
          </p>
        </div>
      )}

      {/* Active Members Roster */}
      {!isLoading && !error && activeMembers.length > 0 && (
        <div className="space-y-2">
          {activeMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              canManageMembers={canManageMembers}
              onEdit={(m) => {
                navigate(ROUTES.PERSON_EDIT(m.person_id), {
                  state: { returnUrl: ROUTES.FAMILY_DETAIL(familyId) },
                })
              }}
              onTransferHead={(m) => setTransferHeadMember(m)}
              onRemove={(m) => setRemovingMember(m)}
            />
          ))}
        </div>
      )}

      {/* Former Members Subsection */}
      {showFormer && formerMembers.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-navy-200">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-navy-400">
            Departed / Former Members ({formerMembers.length})
          </h4>
          <div className="space-y-2">
            {formerMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                canManageMembers={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <AddMemberModal
        familyId={familyId}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        hasActiveHead={Boolean(currentHead)}
        headPersonId={currentHead?.person_id}
      />

      <TransferHeadModal
        familyId={familyId}
        newHeadMember={transferHeadMember}
        currentHeadMember={currentHead}
        isOpen={Boolean(transferHeadMember)}
        onClose={() => setTransferHeadMember(null)}
      />

      <CreateInvitationModal
        familyId={familyId}
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </section>
  )
}
