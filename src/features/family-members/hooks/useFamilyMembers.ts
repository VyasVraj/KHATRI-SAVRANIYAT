/**
 * useFamilyMembers — TanStack Query hook for fetching members of a family.
 *
 * Wraps listFamilyMembers from family-members.service.
 * By default returns active members (left_at IS NULL).
 * Set options.includeFormer = true to fetch former members alongside active members.
 *
 * Query key: ['family-members', 'list', familyId, options]
 */

import { useQuery } from '@tanstack/react-query'
import {
  listFamilyMembers,
  type ListFamilyMembersOptions,
  type FamilyMemberWithPerson,
} from '../services/family-members.service'

/**
 * Fetch members belonging to a family.
 *
 * @param familyId - UUID of the family
 * @param options - Options such as { includeFormer: true }
 */
export function useFamilyMembers(
  familyId: string | undefined,
  options?: ListFamilyMembersOptions
) {
  return useQuery<FamilyMemberWithPerson[]>({
    queryKey: ['family-members', 'list', familyId, options] as const,
    queryFn: async () => {
      if (!familyId) return []
      const result = await listFamilyMembers(familyId, options)
      if (result.error) throw result.error
      return result.data ?? []
    },
    enabled: Boolean(familyId),
  })
}
