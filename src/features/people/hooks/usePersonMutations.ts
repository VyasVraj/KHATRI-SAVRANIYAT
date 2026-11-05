/**
 * Person mutation hooks — TanStack Query useMutation wrappers.
 *
 * All mutations operate through the people service layer. The service layer
 * is the authority for schema validation, error sanitization, and the
 * PERSON != USER boundary.
 *
 * SECURITY NOTE:
 * - useCreatePerson() reads the authenticated user's ID from useAuthContext().
 *   created_by is NEVER accepted from form input.
 * - useUpdatePerson() does not set created_by — it is RLS-protected.
 * - No mutation exposes protected fields (id, user_id, status, etc.).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  createPerson,
  updatePerson,
  softDeletePerson,
} from '../services/people.service'
import type { CreatePersonInput, UpdatePersonInput } from '../schemas/people.schemas'

// ---------------------------------------------------------------------------
// useCreatePerson
// ---------------------------------------------------------------------------

/**
 * Mutation hook for creating a new person record.
 *
 * Reads the authenticated user's ID from AuthContext to set created_by.
 * created_by is NOT accepted from the mutation input.
 *
 * On success: invalidates all ['persons'] queries.
 */
export function useCreatePerson() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation({
    mutationFn: async (input: CreatePersonInput) => {
      if (!user) throw new Error('Authentication required to create a person record.')
      const result = await createPerson(input, user.id)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['persons'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useUpdatePerson
// ---------------------------------------------------------------------------

/**
 * Mutation hook for updating a person record.
 *
 * On success: invalidates the specific person query and the person list.
 */
export function useUpdatePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      personId,
      input,
    }: {
      personId: string
      input: UpdatePersonInput
    }) => {
      const result = await updatePerson(personId, input)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: (_, { personId }) => {
      void queryClient.invalidateQueries({ queryKey: ['persons', personId] })
      void queryClient.invalidateQueries({ queryKey: ['persons', 'list'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useSoftDeletePerson
// ---------------------------------------------------------------------------

/**
 * Mutation hook for soft-deleting a person record.
 *
 * Sets deleted_at via the service. Never executes a SQL DELETE.
 * On success: invalidates all ['persons'] queries so the record disappears
 * from lists and cached detail views.
 */
export function useSoftDeletePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (personId: string) => {
      const result = await softDeletePerson(personId)
      if (result.error) throw result.error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['persons'] })
    },
  })
}
