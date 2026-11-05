/**
 * PersonEditPage — edit an existing person record.
 *
 * Obtains personId from route params. Loads existing data via usePerson().
 * Pre-fills PersonForm. Calls useUpdatePerson() on submit.
 * Navigates to the person's detail page on success.
 */

import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePerson } from '../hooks/usePerson'
import { useUpdatePerson } from '../hooks/usePersonMutations'
import { PersonForm } from '../components/PersonForm'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'
import type { CreatePersonInput } from '../schemas/people.schemas'
import type { PrivacyLevel } from '@/types'

export function PersonEditPage() {
  const { personId } = useParams<{ personId: string }>()
  const navigate = useNavigate()

  const { data: person, isLoading, error } = usePerson(personId)
  const updatePerson = useUpdatePerson()

  async function handleSubmit(data: CreatePersonInput) {
    if (!personId) return
    await updatePerson.mutateAsync({ personId, input: data })
    navigate(ROUTES.PERSON_DETAIL(personId))
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-navy-500">Loading person record…</p>
      </div>
    )
  }

  if (error || !person) {
    const message =
      (error as { message?: string } | null)?.message ??
      'Person not found or you do not have permission to edit this record.'
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
        onClick={() => navigate(ROUTES.PERSON_DETAIL(person.id))}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to record
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
          middle_name: person.middle_name,
          maiden_name: person.maiden_name,
          gender: person.gender ?? undefined,
          date_of_birth: person.date_of_birth,
          date_of_death: person.date_of_death,
          birth_place: person.birth_place,
          gotra: person.gotra,
          kul: person.kul,
          nukh: person.nukh,
          email_contact: person.email_contact,
          phone: person.phone,
          phone_secondary: person.phone_secondary,
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
