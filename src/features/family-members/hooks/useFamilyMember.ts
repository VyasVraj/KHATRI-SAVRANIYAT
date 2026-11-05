/**
 * useFamilyMember — TanStack Query hook for fetching a single family member record.
 *
 * Wraps getFamilyMember from family-members.service.
 *
 * Query key: ['family-members', 'detail', memberId]
 */

import { useQuery } from '@tanstack/react-query'
import {
  getFamilyMember,
  type FamilyMemberWithPerson,
} from '../services/family-members.service'

/**
 * Fetch a single family member record by UUID, including joined person profile.
 *
 * @param memberId - UUID of the family member row
 */
export function useFamilyMember(memberId: string | undefined) {
  return useQuery<FamilyMemberWithPerson | null>({
    queryKey: ['family-members', 'detail', memberId] as const,
    queryFn: async () => {
      if (!memberId) return null
      const result = await getFamilyMember(memberId)
      if (result.error) throw result.error
      return result.data
    },
    enabled: Boolean(memberId),
  })
}
