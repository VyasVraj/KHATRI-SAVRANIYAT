/**
 * useCommittees Hook (Phase 10 / ANDROID-13 Parity)
 */

import { useQuery } from '@tanstack/react-query'
import {
  getCommittees,
  getCommitteeById,
} from '../services/committees.service'
import type { CommitteeFilters } from '../types'

export function useCommittees(filters: CommitteeFilters = {}) {
  const query = useQuery({
    queryKey: ['community', 'committees', filters],
    queryFn: async () => {
      const res = await getCommittees(filters)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })

  return {
    data: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    availableCategories: query.data?.availableCategories ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCommittee(idOrSlug: string | undefined | null) {
  return useQuery({
    queryKey: ['community', 'committee', idOrSlug],
    queryFn: async () => {
      if (!idOrSlug) return null
      const res = await getCommitteeById(idOrSlug)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: Boolean(idOrSlug),
    staleTime: 5 * 60 * 1000,
  })
}
