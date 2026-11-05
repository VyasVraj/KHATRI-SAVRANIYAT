/**
 * usePersonRelationships — TanStack Query hook for fetching relationships of a person.
 *
 * Wraps listPersonRelationships from relationships.service.
 *
 * PRIVACY & SECURITY RULES:
 * - Gate 1: anon and PUBLIC have NO table privileges on public.relationships.
 * - This query is enabled ONLY when the session is authenticated (isAuthenticated === true).
 * - Gate 2: RLS dual-endpoint rule returns rows only when both endpoints are visible.
 *
 * Query key: ['relationships', 'person', personId, options]
 */

import { useQuery } from '@tanstack/react-query'
import { listPersonRelationships } from '../services/relationships.service'
import type {
  ListPersonRelationshipsOptions,
  PersonRelationshipsSummary,
} from '../types'
import { useAuthContext } from '@/features/auth/context/AuthContext'

/**
 * Fetch grouped interpersonal relationships for a person.
 *
 * @param personId - UUID of the person record
 * @param options - Optional filters (includeSoftDeleted, type)
 */
export function usePersonRelationships(
  personId: string | undefined,
  options?: ListPersonRelationshipsOptions
) {
  const { isAuthenticated } = useAuthContext()

  return useQuery<PersonRelationshipsSummary>({
    queryKey: ['relationships', 'person', personId, options] as const,
    queryFn: async () => {
      if (!personId) throw new Error('Person ID is required.')
      const result = await listPersonRelationships(personId, options)
      if (result.error) throw result.error
      return result.data!
    },
    // Only execute query when authenticated and personId is provided.
    // Unauthenticated callers have zero Gate 1 privileges on public.relationships.
    enabled: Boolean(personId) && isAuthenticated,
  })
}
