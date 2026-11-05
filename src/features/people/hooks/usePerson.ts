/**
 * usePerson — TanStack Query hook for fetching a single person record.
 *
 * Wraps the getPerson service function. The queryFn throws on service error
 * so TanStack Query's error state works correctly.
 *
 * Query key: ['persons', personId]
 * Enabled: only when personId is a non-empty string.
 */

import { useQuery } from '@tanstack/react-query'
import { getPerson, getPersonByUserId } from '../services/people.service'

/**
 * Fetch a single person by UUID.
 *
 * @param personId - The UUID of the person to fetch. Pass an empty string or
 *   undefined to disable the query (no request is made).
 */
export function usePerson(personId: string | undefined) {
  return useQuery({
    queryKey: ['persons', personId],
    enabled: !!personId,
    queryFn: async () => {
      const result = await getPerson(personId!)
      if (result.error) throw result.error
      return result.data!
    },
  })
}

/**
 * Fetch a person record linked to an authenticated user account (user_id).
 *
 * Implements PERSON != USER:
 * - Enabled only when userId is provided.
 * - Resolves to PersonRow or null (if no record is linked).
 *
 * @param userId - The UUID of the authenticated user.
 */
export function usePersonByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: ['persons', 'user', userId],
    enabled: !!userId,
    queryFn: async () => {
      const result = await getPersonByUserId(userId!)
      if (result.error) throw result.error
      return result.data
    },
  })
}

