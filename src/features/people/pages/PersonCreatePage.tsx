/**
 * PersonCreatePage — create a new person record.
 *
 * Renders PersonForm in create mode. On successful creation, navigates to
 * the new person's detail page.
 *
 * The authenticated user's ID is read by useCreatePerson() from AuthContext.
 * It is NEVER sourced from the form.
 */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCreatePerson } from '../hooks/usePersonMutations'
import { PersonForm } from '../components/PersonForm'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'
import type { CreatePersonInput } from '../schemas/people.schemas'

export function PersonCreatePage() {
  const navigate = useNavigate()
  const createPerson = useCreatePerson()

  async function handleSubmit(data: CreatePersonInput) {
    const person = await createPerson.mutateAsync(data)
    navigate(ROUTES.PERSON_DETAIL(person.id))
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

      <h1 className="text-2xl font-semibold text-navy-900">Add person</h1>
      <p className="mt-1 mb-8 text-sm text-navy-500">
        Add a new person to the community census registry.
      </p>

      <PersonForm
        mode="create"
        onSubmit={handleSubmit}
        isSubmitting={createPerson.isPending}
        submitError={
          createPerson.error
            ? ((createPerson.error as { message?: string }).message ??
              'Could not create person. Please try again.')
            : null
        }
      />
    </div>
  )
}
