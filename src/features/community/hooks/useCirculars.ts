/**
 * useCirculars Hook (Phase 10 / ANDROID-13 Parity)
 */

import { useQuery } from '@tanstack/react-query'
import {
  getCirculars,
  getCircularById,
} from '../services/circulars.service'
import type { CircularFilters } from '../types'

export function useCirculars(filters: CircularFilters = {}) {
  const query = useQuery({
    queryKey: ['community', 'circulars', filters],
    queryFn: async () => {
      const res = await getCirculars(filters)
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
    availableIssuers: query.data?.availableIssuers ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCircular(idOrNumber: string | undefined | null) {
  return useQuery({
    queryKey: ['community', 'circular', idOrNumber],
    queryFn: async () => {
      if (!idOrNumber) return null
      const res = await getCircularById(idOrNumber)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: Boolean(idOrNumber),
    staleTime: 5 * 60 * 1000,
  })
}
