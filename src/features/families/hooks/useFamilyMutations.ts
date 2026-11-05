/**
 * Family mutation hooks — TanStack Query useMutation wrappers.
 *
 * All mutations operate through the families service layer. The service layer
 * is the authority for schema validation, error sanitization, and security boundaries.
 *
 * SECURITY NOTE:
 * - useCreateFamily() reads the authenticated user's ID from useAuthContext().
 *   created_by is NEVER accepted from form input.
 * - useUpdateFamily() does not accept or mutate created_by.
 * - No mutation exposes protected fields (id, status, verification_status, etc.).
 * - ZERO access to family_members table.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  createFamily,
  updateFamily,
  softDeleteFamily,
} from '../services/families.service'
import type { CreateFamilyInput, UpdateFamilyInput } from '../schemas/families.schemas'

// ---------------------------------------------------------------------------
// useCreateFamily
// ---------------------------------------------------------------------------

/**
 * Mutation hook for creating a new family record.
 *
 * Sourced from the authenticated user's ID via AuthContext to set created_by.
 * created_by is NOT accepted from form input.
 *
 * On success: invalidates all ['families'] queries.
 */
export function useCreateFamily() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation({
    mutationFn: async (input: CreateFamilyInput) => {
      if (!user) throw new Error('Authentication required to create a family record.')
      const result = await createFamily(input, user.id)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['families'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useUpdateFamily
// ---------------------------------------------------------------------------

/**
 * Mutation hook for updating a family record.
 *
 * On success: invalidates the specific family query and the family list.
 */
export function useUpdateFamily() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      familyId,
      input,
    }: {
      familyId: string
      input: UpdateFamilyInput
    }) => {
      const result = await updateFamily(familyId, input)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: (_, { familyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['families', familyId] })
      void queryClient.invalidateQueries({ queryKey: ['families', 'list'] })
    },
  })
}

// ---------------------------------------------------------------------------
// useSoftDeleteFamily
// ---------------------------------------------------------------------------

/**
 * Mutation hook for soft-deleting a family record.
 *
 * Sets deleted_at via the service. Never executes a SQL DELETE.
 * On success: invalidates all ['families'] queries.
 */
export function useSoftDeleteFamily() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (familyId: string) => {
      const result = await softDeleteFamily(familyId)
      if (result.error) throw result.error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['families'] })
    },
  })
}
