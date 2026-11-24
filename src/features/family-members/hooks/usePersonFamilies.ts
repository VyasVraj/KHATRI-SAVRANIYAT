/**
 * usePersonFamilies — TanStack Query hook for fetching families a person belongs to.
 *
 * Wraps listPersonFamilies from family-members.service.
 * By default returns active memberships (left_at IS NULL).
 * Set options.includeFormer = true to fetch former memberships alongside active memberships.
 *
 * Query key: ['family-members', 'person', personId, options]
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  let hasClient = false
  try {
    if (useQueryClient()) {
      hasClient = true
    }
  } catch {
    hasClient = false
  }

  if (!hasClient) {
    return { data: [], isLoading: false, isError: false, error: null } as unknown as ReturnType<typeof useQuery<FamilyMemberWithFamily[]>>
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
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
