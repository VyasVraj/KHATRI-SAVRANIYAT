/**
 * PersonDetailPage — read-only view of a single person record.
 *
 * Obtains personId from route params. Fetches via usePerson().
 * Displays PersonDetail. Provides navigation to edit and soft-delete.
 *
 * Soft-delete: only shown; the actual authorization is enforced by RLS.
 * If the current user is not the creator, the service call will be rejected
 * by the database and the UI will show the error. No client-side auth check.
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Trash2, Network } from 'lucide-react'
import { usePerson } from '../hooks/usePerson'
import { useSoftDeletePerson } from '../hooks/usePersonMutations'
import { PersonDetail } from '../components/PersonDetail'
import { PersonRelationshipsList } from '@/features/relationships'
import { PersonFamiliesList } from '@/features/family-members'
import { PersonConnectionSection } from '@/features/connections'
import { PersonClaimSection, usePersonClaim } from '@/features/claims'
import { PersonVerificationSection } from '@/features/verification'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useActiveMukhiAuthority } from '@/features/community/hooks/useActiveMukhiAuthority'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

export function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, profile } = useAuthContext()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: person, isLoading, error } = usePerson(personId)
  const { data: myClaim } = usePersonClaim(personId)
  const softDelete = useSoftDeletePerson()

  // Strict Scope: Authenticated normal users can edit ONLY:
  // 1. Records they originally created (persons.created_by = auth.uid())
  // 2. Their OWN existing linked person record (persons.user_id = auth.uid())
  // 3. Approved profile claim (status = 'APPROVED')
  // Super Admin and Admin retain system administrative management.
  const { data: mukhiAuth } = useActiveMukhiAuthority()

  // Mukhi retains only established role permissions (no arbitrary member editing).
  const isOwner = Boolean(user?.id && person?.user_id === user.id)
  const isCreator = Boolean(user?.id && person?.created_by === user.id)
  const isApprovedClaimant = Boolean(myClaim?.status === 'APPROVED')
  const isSameFamily = Boolean((person as unknown as { is_same_family?: boolean })?.is_same_family)
  const isAdmin = Boolean(profile?.role && ['SUPER_ADMIN', 'ADMIN'].includes(profile.role))
  const isMukhi = Boolean(mukhiAuth?.isActiveMukhi) || Boolean(profile?.role && ['MUKHI', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI'].includes(profile.role))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAuthorizedByPolicy = Boolean((person as any)?.can_edit)
  const canEdit = isOwner || isCreator || isApprovedClaimant || isAdmin || isAuthorizedByPolicy

  // Family Tree button is ONLY visible if user is authorized to view this person's family tree
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canViewTreePolicy = Boolean((person as any)?.can_view_tree)
  const canViewTree = isOwner || isCreator || isApprovedClaimant || isSameFamily || isAdmin || isMukhi || canViewTreePolicy

  // Protected family details (interpersonal relationships, full memberships list)
  const canViewProtected = isOwner || isCreator || isApprovedClaimant || isSameFamily || isAdmin || isMukhi || isAuthorizedByPolicy

  async function handleSoftDelete() {
    if (!personId) return
    setDeleteError(null)
    try {
      await softDelete.mutateAsync(personId)
      navigate(ROUTES.PEOPLE)
    } catch (err) {
      setDeleteError(
        (err as { message?: string }).message ??
          'Could not delete this record. Please try again.'
      )
      setConfirmDelete(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-navy-500">Loading…</p>
      </div>
    )
  }

  if (error || !person) {
    const message =
      (error as { message?: string } | null)?.message ??
      'Person not found or you do not have permission to view this record.'
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.PEOPLE)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to census
        </Button>
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Back navigation */}
      <Button
        variant="secondary"
        onClick={() => navigate(ROUTES.PEOPLE)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to census
      </Button>

      {/* Actions */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold text-navy-900">Person record</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {canViewTree && (
            <Button
              variant="secondary"
              onClick={() => navigate(ROUTES.PERSON_TREE(person.id))}
              className="flex-1 sm:flex-none justify-center min-h-[44px]"
            >
              <Network className="h-4 w-4" />
              Family tree
            </Button>
          )}
          {canEdit && (
            <Button
              variant="secondary"
              onClick={() => navigate(ROUTES.PERSON_EDIT(person.id))}
              className="flex-1 sm:flex-none justify-center min-h-[44px]"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {canEdit && (!confirmDelete ? (
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(true)}
              className="flex-1 sm:flex-none justify-center text-red-600 hover:bg-red-50 hover:border-red-300 min-h-[44px]"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <span className="text-sm text-navy-600">Are you sure?</span>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSoftDelete}
                isLoading={softDelete.isPending}
                disabled={softDelete.isPending}
                className="border-red-400 bg-red-600 text-white hover:bg-red-700 min-h-[44px]"
              >
                Confirm delete
              </Button>
            </div>
          ))}
        </div>
      </div>

      {deleteError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {deleteError}
        </p>
      )}

      {/* Detail panel */}
      <div className="rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <PersonDetail
          person={person}
          canEdit={canEdit}
          onAvatarUpdated={() => {
            if (personId) {
              void queryClient.invalidateQueries({ queryKey: ['persons', personId] })
              void queryClient.invalidateQueries({ queryKey: ['persons'] })
            }
          }}
        />
      </div>

      {/* Community verification section */}
      <div className="mt-6">
        <PersonVerificationSection person={person} />
      </div>

      {/* Census record claim management */}
      <div className="mt-6">
        <PersonClaimSection person={person} />
      </div>

      {/* Social connection section for linked accounts */}
      {person.user_id && (
        <div className="mt-8">
          <PersonConnectionSection
            targetUserId={person.user_id}
            personName={[person.first_name, person.last_name].filter(Boolean).join(' ')}
          />
        </div>
      )}

      {/* Interpersonal relationships — protected family details */}
      {canViewProtected && (
        <div className="mt-8">
          <PersonRelationshipsList personId={person.id} />
        </div>
      )}

      {/* Family memberships — protected family details */}
      {canViewProtected && (
        <div className="mt-8">
          <PersonFamiliesList personId={person.id} />
        </div>
      )}
    </div>
  )
}
