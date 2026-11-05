/**
 * FamilyDetailPage — read-only view of a single family record.
 *
 * Obtains familyId from route params. Fetches via useFamily().
 * Displays FamilyDetail with embedded member roster.
 * Provides navigation to edit and soft-delete.
 *
 * Soft-delete: confirmation flow; actual authorization is enforced by RLS.
 * If the current user is not the creator, the service call will be rejected
 * by the database RLS and the UI displays the error.
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useFamily } from '../hooks/useFamily'
import { useSoftDeleteFamily } from '../hooks/useFamilyMutations'
import { FamilyDetail } from '../components/FamilyDetail'
import { FamilyVerificationSection } from '@/features/verification'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { Button } from '@/components/forms/Button'
import { ROUTES, ADMIN_ROLES } from '@/constants/app'

export function FamilyDetailPage() {
  const { familyId } = useParams<{ familyId: string }>()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: family, isLoading, error } = useFamily(familyId)
  const softDelete = useSoftDeleteFamily()
  const { user, profile } = useAuthContext()

  // Derive management capabilities for UX visibility (RLS is the ultimate authority)
  const isCreator = Boolean(user && family && family.created_by === user.id)
  const isModerator = Boolean(
    profile?.is_active &&
    (profile.role === 'ADMIN' ||
     profile.role === 'SUPER_ADMIN' ||
     (ADMIN_ROLES as readonly string[]).includes(profile.role))
  )
  const canManageMembers = isCreator || isModerator

  async function handleSoftDelete() {
    if (!familyId) return
    setDeleteError(null)
    try {
      await softDelete.mutateAsync(familyId)
      navigate(ROUTES.FAMILIES)
    } catch (err) {
      setDeleteError(
        (err as { message?: string }).message ??
          'Could not delete this family record. Please try again.'
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

  if (error || !family) {
    const message =
      (error as { message?: string } | null)?.message ??
      'Family not found or you do not have permission to view this record.'
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.FAMILIES)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to families
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
        onClick={() => navigate(ROUTES.FAMILIES)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to families
      </Button>

      {/* Header and Actions */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy-900">Family Record</h1>
        <div className="flex gap-2">
          {canManageMembers && (
            <Button
              variant="secondary"
              onClick={() => navigate(ROUTES.FAMILY_EDIT(family.id))}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {canManageMembers && (!confirmDelete ? (
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(true)}
              className="text-red-600 hover:bg-red-50 hover:border-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-navy-600">Are you sure?</span>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSoftDelete}
                isLoading={softDelete.isPending}
                disabled={softDelete.isPending}
                className="border-red-400 bg-red-600 text-white hover:bg-red-700"
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

      {/* Detail panel with roster */}
      <div className="rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <FamilyDetail family={family} canManageMembers={canManageMembers} />
      </div>

      {/* Community verification section */}
      <div className="mt-6">
        <FamilyVerificationSection family={family} />
      </div>
    </div>
  )
}
