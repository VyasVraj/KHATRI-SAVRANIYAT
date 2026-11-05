/**
 * useFamily — TanStack Query hook for fetching a single family record.
 *
 * Wraps the getFamily service function. Throws on service error so that
 * TanStack Query's error state is populated appropriately.
 *
 * Query key: ['families', familyId]
 * Enabled: only when familyId is a non-empty string.
 */

import { useQuery } from '@tanstack/react-query'
import { getFamily } from '../services/families.service'

/**
 * Fetch a single family record by UUID.
 *
 * @param familyId - The UUID of the family to fetch. Pass undefined or empty string to disable.
 */
export function useFamily(familyId: string | undefined) {
  return useQuery({
    queryKey: ['families', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const result = await getFamily(familyId!)
      if (result.error) throw result.error
      return result.data!
    },
  })
}
