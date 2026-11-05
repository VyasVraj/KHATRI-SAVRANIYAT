/**
 * usePersonFamilies — TanStack Query hook for fetching families a person belongs to.
 *
 * Wraps listPersonFamilies from family-members.service.
 * By default returns active memberships (left_at IS NULL).
 * Set options.includeFormer = true to fetch former memberships alongside active memberships.
 *
 * Query key: ['family-members', 'person', personId, options]
 */

import { useQuery } from '@tanstack/react-query'
import {
  listPersonFamilies,
  type ListPersonFamiliesOptions,
  type FamilyMemberWithFamily,
} from '../services/family-members.service'

/**
 * Fetch family memberships for a person.
 *
 * @param personId - UUID of the person
 * @param options - Options such as { includeFormer: true }
 */
export function usePersonFamilies(
  personId: string | undefined,
  options?: ListPersonFamiliesOptions
) {
  return useQuery<FamilyMemberWithFamily[]>({
    queryKey: ['family-members', 'person', personId, options] as const,
    queryFn: async () => {
      if (!personId) return []
      const result = await listPersonFamilies(personId, options)
      if (result.error) throw result.error
      return result.data ?? []
    },
    enabled: Boolean(personId),
  })
}
