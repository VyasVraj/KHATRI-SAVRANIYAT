/**
 * usePersonList — TanStack Query hook for fetching a list of person records.
 *
 * Wraps the listPersons service function. Returns records visible to the
 * current session based on the deployed RLS privacy policies.
 *
 * Query key: ['persons', 'list', params]
 * Data: PersonRow[] (empty array when no records match)
 */

import { useQuery } from '@tanstack/react-query'
import { listPersons, type ListPersonsParams } from '../services/people.service'

/**
 * Fetch person records visible to the current session.
 *
 * Visibility is determined by RLS — unauthenticated sessions receive only
 * PUBLIC records; authenticated sessions receive COMMUNITY and above.
 *
 * @param params - Optional list parameters (limit).
 */
export function usePersonList(params?: ListPersonsParams) {
  return useQuery({
    queryKey: ['persons', 'list', params] as const,
    queryFn: async () => {
      const result = await listPersons(params)
      if (result.error) throw result.error
      return result.data!
    },
  })
}
