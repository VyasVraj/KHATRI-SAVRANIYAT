/**
 * Relationship mutation hooks — TanStack Query useMutation wrappers.
 *
 * All operations operate strictly through the relationships.service layer.
 *
 * SECURITY & INTEGRITY RULES:
 * - created_by is injected strictly from the authenticated session (useAuthContext().user.id).
 * - Canonical ordering (person_a_id < person_b_id for SPOUSE/SIBLING) is enforced prior to service call.
 * - Directional PARENT rules (person_a_id = parent, person_b_id = child) are normalized from relative roles.
 * - Soft-deletion only: calls softDeleteRelationship which updates deleted_at.
 * - Query cache invalidation refreshes related views across the platform.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  createRelationship,
  updateRelationship,
  softDeleteRelationship,
} from '../services/relationships.service'
import type { CreateRelationshipInput } from '../schemas/relationships.schema'
import type { PersonRelativeRole } from '../types'

/** Parameters for creating a relationship relative to a target person */
export interface AddRelationshipParams {
  /** The person whose profile the user is currently managing */
  targetPersonId: string
  /** The selected relative person */
  relatedPersonId: string
  /** Role of the selected person relative to the target person */
  relativeRole: PersonRelativeRole
  /** Optional relationship notes */
  notes?: string | null
}

/**
 * Pure mapping helper: translates human-facing relative roles to canonical
 * database representation required by createRelationshipSchema.
 *
 * - Parent: relatedPerson is parent (person_a), targetPerson is child (person_b).
 * - Child: targetPerson is parent (person_a), relatedPerson is child (person_b).
 * - Spouse: person_a = min(target, related), person_b = max(target, related).
 * - Sibling: person_a = min(target, related), person_b = max(target, related).
 */
export function mapRoleToCanonicalRelationship({
  targetPersonId,
  relatedPersonId,
  relativeRole,
  notes,
}: AddRelationshipParams): CreateRelationshipInput {
  if (targetPersonId === relatedPersonId) {
    throw new Error('A person cannot have a relationship with themselves.')
  }

  const cleanNotes = notes?.trim() || null

  switch (relativeRole) {
    case 'parent':
      // Selected person is parent of target person
      return {
        person_a_id: relatedPersonId,
        person_b_id: targetPersonId,
        relationship_type: 'PARENT',
        notes: cleanNotes,
      }

    case 'child':
      // Target person is parent of selected person
      return {
        person_a_id: targetPersonId,
        person_b_id: relatedPersonId,
        relationship_type: 'PARENT',
        notes: cleanNotes,
      }

    case 'spouse': {
      const [person_a_id, person_b_id] =
        targetPersonId < relatedPersonId
          ? [targetPersonId, relatedPersonId]
          : [relatedPersonId, targetPersonId]
      return {
        person_a_id,
        person_b_id,
        relationship_type: 'SPOUSE',
        notes: cleanNotes,
      }
    }

    case 'sibling': {
      const [person_a_id, person_b_id] =
        targetPersonId < relatedPersonId
          ? [targetPersonId, relatedPersonId]
          : [relatedPersonId, targetPersonId]
      return {
        person_a_id,
        person_b_id,
        relationship_type: 'SIBLING',
        notes: cleanNotes,
      }
    }

    default:
      throw new Error(`Unsupported relationship role: ${String(relativeRole)}`)
  }
}

/**
 * Mutation hook for adding an interpersonal relationship.
 */
export function useAddRelationship() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation({
    mutationFn: async (params: AddRelationshipParams) => {
      if (!user) throw new Error('Authentication required to record a relationship.')
      const canonicalInput = mapRoleToCanonicalRelationship(params)
      const result = await createRelationship(canonicalInput, user.id)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['relationships'] })
    },
  })
}

/**
 * Mutation hook for updating mutable relationship metadata (notes).
 */
export function useUpdateRelationship() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation({
    mutationFn: async ({
      id,
      notes,
    }: {
      id: string
      notes?: string | null
    }) => {
      if (!user) throw new Error('Authentication required to update a relationship.')
      const result = await updateRelationship(id, { notes }, user.id)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['relationships'] })
    },
  })
}

/**
 * Mutation hook for soft-deleting an interpersonal relationship.
 */
export function useSoftDeleteRelationship() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Authentication required to remove a relationship.')
      const result = await softDeleteRelationship(id, user.id)
      if (result.error) throw result.error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['relationships'] })
    },
  })
}
