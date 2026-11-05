/**
 * PersonListPage — browse person records visible to the current session.
 *
 * Fetches persons via usePersonList(). Visibility is governed by RLS —
 * authenticated users see COMMUNITY and PUBLIC records plus their own.
 *
 * Displays persons as PersonCard components.
 * Provides navigation to PersonDetailPage and PersonCreatePage.
 */

import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { usePersonList } from '../hooks/usePersonList'
import { PersonCard } from '../components/PersonCard'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

export function PersonListPage() {
  const navigate = useNavigate()
  const { data: persons, isLoading, error } = usePersonList()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-navy-500">Loading person records…</p>
      </div>
    )
  }

  if (error) {
    const message =
      (error as { message?: string }).message ??
      'Could not load person records. Please try again.'
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand-600" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-navy-900">Community Census</h1>
        </div>
        <Button onClick={() => navigate(ROUTES.PERSON_CREATE)}>Add person</Button>
      </div>
      <p className="mt-1 text-sm text-navy-500">
        Person records in the community registry. Visibility is governed by each
        record's privacy settings.
      </p>

      {/* List or empty state */}
      {persons && persons.length > 0 ? (
        <ul className="mt-8 space-y-3" aria-label="Person records">
          {persons.map((person) => (
            <li key={person.id}>
              <PersonCard
                person={person}
                onClick={() => navigate(ROUTES.PERSON_DETAIL(person.id))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-16 flex flex-col items-center text-center">
          <Users className="h-12 w-12 text-navy-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-medium text-navy-700">No person records yet</h2>
          <p className="mt-1 text-sm text-navy-500">
            Start building the community census by adding the first person record.
          </p>
          <Button className="mt-6" onClick={() => navigate(ROUTES.PERSON_CREATE)}>
            Add first person
          </Button>
        </div>
      )}
    </div>
  )
}
