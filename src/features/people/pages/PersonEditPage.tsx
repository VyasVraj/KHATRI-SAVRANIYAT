/**
 * PersonEditPage — edit an existing person record.
 *
 * Obtains personId from route params. Loads existing data via usePerson().
 * Pre-fills PersonForm. Calls useUpdatePerson() on submit.
 * Navigates to the person's detail page on success.
 */

import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePerson } from '../hooks/usePerson'
import { useUpdatePerson } from '../hooks/usePersonMutations'
import { PersonForm } from '../components/PersonForm'
import { Button } from '@/components/forms/Button'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { ROUTES } from '@/constants/app'
import type { CreatePersonInput } from '../schemas/people.schemas'
import type { PrivacyLevel } from '@/types'

export function PersonEditPage() {
  const { personId } = useParams<{ personId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const returnUrl = (location.state as { returnUrl?: string } | undefined)?.returnUrl
  const { user, profile } = useAuthContext()

  const { data: person, isLoading, error } = usePerson(personId)
  const updatePerson = useUpdatePerson()

  async function handleSubmit(data: CreatePersonInput) {
    if (!personId) return
    await updatePerson.mutateAsync({ personId, input: data })
    if (returnUrl) {
      navigate(returnUrl)
    } else {
      navigate(ROUTES.PERSON_DETAIL(personId))
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-navy-500">Loading person record…</p>
      </div>
    )
  }

  // Strict Matrix: Authenticated normal users can edit ONLY their OWN existing linked person record (persons.user_id = auth.uid()).
  // Family head status does NOT grant permission to edit other members' profiles.
  // Super Admin and Admin retain system administrative management.
  const isOwner = Boolean(user?.id && person?.user_id === user.id)
  const isAdmin = Boolean(profile?.role && ['SUPER_ADMIN', 'ADMIN'].includes(profile.role))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAuthorizedByPolicy = Boolean((person as any)?.can_edit)
  const hasEditPermission = isOwner || isAdmin || isAuthorizedByPolicy

  if (error || !person || !hasEditPermission) {
    const message =
      !hasEditPermission
        ? "Unauthorized: You do not have permission to edit this person's record. Community members are only permitted to edit their own personal profile."
        : (error as { message?: string } | null)?.message ??
          'Person not found or you do not have permission to edit this record.'
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Button
          variant="secondary"
          onClick={() => {
            if (returnUrl) {
              navigate(returnUrl)
            } else {
              navigate(ROUTES.PEOPLE)
            }
          }}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {returnUrl ? 'family record' : 'census'}
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
        onClick={() => {
          if (returnUrl) {
            navigate(returnUrl)
          } else {
            navigate(ROUTES.PERSON_DETAIL(person.id))
          }
        }}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {returnUrl ? 'family record' : 'record'}
      </Button>

      <h1 className="text-2xl font-semibold text-navy-900">Edit person</h1>
      <p className="mt-1 mb-8 text-sm text-navy-500">
        Update the details for{' '}
        <span className="font-medium">
          {person.first_name} {person.last_name}
        </span>
        .
      </p>

      <PersonForm
        mode="edit"
        defaultValues={{
          first_name: person.first_name,
          last_name: person.last_name,
          middle_name: person.middle_name ?? undefined,
          maiden_name: person.maiden_name ?? undefined,
          gender: person.gender === 'PREFER_NOT_TO_SAY' ? undefined : (person.gender ?? undefined),
          blood_group: (person as unknown as { blood_group?: CreatePersonInput['blood_group'] })?.blood_group ?? undefined,
          date_of_birth: person.date_of_birth ?? undefined,
          date_of_death: person.date_of_death ?? undefined,
          is_deceased: Boolean(person.is_deceased || person.status === 'DECEASED' || person.date_of_death),
          birth_place: person.birth_place ?? undefined,
          gotra: person.gotra ?? undefined,
          kul: person.kul ?? undefined,
          nukh: person.nukh ?? undefined,
          email_contact: person.email_contact ?? undefined,
          phone: person.phone ?? undefined,
          phone_secondary: person.phone_secondary ?? undefined,
          profile_privacy: person.profile_privacy as PrivacyLevel,
          contact_privacy: person.contact_privacy as PrivacyLevel,
          dob_privacy: person.dob_privacy as PrivacyLevel,
        }}
        onSubmit={handleSubmit}
        isSubmitting={updatePerson.isPending}
        submitError={
          updatePerson.error
            ? ((updatePerson.error as { message?: string }).message ??
              'Could not update person. Please try again.')
            : null
        }
      />
    </div>
  )
}
