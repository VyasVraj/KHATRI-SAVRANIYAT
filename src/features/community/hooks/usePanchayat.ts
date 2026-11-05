/**
 * usePanchayat Hook (Phase 10 / ANDROID-13 Parity)
 */

import { useQuery } from '@tanstack/react-query'
import { getPanchayatDirectory } from '../services/panchayat.service'
import type { PanchayatFilters } from '../types'

export function usePanchayat(filters: PanchayatFilters = {}) {
  const query = useQuery({
    queryKey: ['community', 'panchayat', filters],
    queryFn: async () => {
      const res = await getPanchayatDirectory(filters)
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
    availableZones: query.data?.availableZones ?? [],
    availableSections: query.data?.availableSections ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
