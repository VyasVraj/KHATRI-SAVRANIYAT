/**
 * useExecutiveCommittee — TanStack Query hook for the 31-member Executive Committee directory.
 */

import { useQuery } from '@tanstack/react-query'
import {
  getExecutiveCommitteeMembers,
  type ExecutiveCommitteeFilters,
  type ExecutiveCommitteeMember,
} from '../services/executive-committee.service'

export function useExecutiveCommittee(filters: ExecutiveCommitteeFilters = {}) {
  const query = useQuery<ExecutiveCommitteeMember[]>({
    queryKey: ['community', 'executive-committee', filters],
    queryFn: async () => {
      const res = await getExecutiveCommitteeMembers(filters)
      if (res.error) throw res.error
      return res.data ?? []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  return {
    members: query.data ?? [],
    totalCount: query.data?.length ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
