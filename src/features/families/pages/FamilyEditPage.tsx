/**
 * FamilyEditPage — edit an existing family record.
 *
 * Obtains familyId from route params. Loads existing data via useFamily().
 * Pre-fills FamilyForm. Calls useUpdateFamily() on submit.
 * Navigates to the family's detail page on success.
 */

import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useFamily } from '../hooks/useFamily'
import { useFamilyMembers } from '@/features/family-members/hooks/useFamilyMembers'
import { useUpdateFamily } from '../hooks/useFamilyMutations'
import { FamilyForm } from '../components/FamilyForm'
import { Button } from '@/components/forms/Button'
import { ROUTES, ADMIN_ROLES } from '@/constants/app'
import type { CreateFamilyInput } from '../schemas/families.schemas'
import type { PrivacyLevel } from '@/types'

export function FamilyEditPage() {
  const { familyId } = useParams<{ familyId: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuthContext()

  const { data: family, isLoading: isFamilyLoading, error } = useFamily(familyId)
  const { data: members = [], isLoading: isMembersLoading } = useFamilyMembers(familyId, {
    includeFormer: false,
  })
  const updateFamily = useUpdateFamily()

  const isLoading = isFamilyLoading || isMembersLoading

  // Management authorization check: Manager, Creator (when manager unset), Head, or Admin
  const isManager = Boolean(
    user &&
    family &&
    (family.manager_user_id === user.id ||
      (!family.manager_user_id && family.created_by === user.id))
  )
  const isHead = Boolean(
    user && members.some((m) => m.is_head && m.person?.user_id === user.id)
  )
  const isModerator = Boolean(
    profile?.is_active &&
    (profile.role === 'ADMIN' ||
     profile.role === 'SUPER_ADMIN' ||
     profile.role === 'COMMUNITY_MODERATOR' ||
     (ADMIN_ROLES as readonly string[]).includes(profile.role))
  )
  const canManage = isManager || isHead || isModerator

  async function handleSubmit(data: CreateFamilyInput) {
    if (!familyId) return
    await updateFamily.mutateAsync({ familyId, input: data })
    navigate(ROUTES.FAMILY_DETAIL(familyId))
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-navy-500">Loading family record…</p>
      </div>
    )
  }

  if (error || !family) {
    const message =
      (error as { message?: string } | null)?.message ??
      'Family not found or you do not have permission to edit this record.'
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

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.FAMILY_DETAIL(family.id))}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to family
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          You do not have permission to edit this family record. Only the designated Family Manager, Family Head, or an Administrator may edit family details.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Back navigation */}
      <Button
        variant="secondary"
        onClick={() => navigate(ROUTES.FAMILY_DETAIL(family.id))}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to family
      </Button>

      <h1 className="text-2xl font-semibold text-navy-900">Edit family</h1>
      <p className="mt-1 mb-8 text-sm text-navy-500">
        Update details for <span className="font-medium">{family.family_name}</span>.
      </p>

      <FamilyForm
        mode="edit"
        defaultValues={{
          family_name: family.family_name,
          description: family.description,
          city: family.city,
          state: family.state,
          country: family.country,
          gotra: family.gotra,
          kul: family.kul,
          nukh: family.nukh,
          profile_privacy: family.profile_privacy as PrivacyLevel,
          members_privacy: family.members_privacy as PrivacyLevel,
        }}
        onSubmit={handleSubmit}
        isSubmitting={updateFamily.isPending}
        submitError={
          updateFamily.error
            ? ((updateFamily.error as { message?: string }).message ??
              'Could not update family. Please try again.')
            : null
        }
      />
    </div>
  )
}
