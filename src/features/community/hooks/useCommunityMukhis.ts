/**
 * Hook: useCommunityMukhis
 * TanStack Query hook for Community Mukhi Directory (118 records).
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCommunityMukhis,
  type CommunityMukhiFilters,
  type CommunityMukhi,
} from '../services/community-mukhis.service'

export const communityMukhiQueryKeys = {
  all: ['community-mukhis'] as const,
  list: (filters: CommunityMukhiFilters) => ['community-mukhis', 'list', filters] as const,
  detail: (id: string) => ['community-mukhis', 'detail', id] as const,
}

export function useCommunityMukhis(initialFilters: CommunityMukhiFilters = {}) {
  const [filters, setFilters] = useState<CommunityMukhiFilters>(initialFilters)

  const query = useQuery({
    queryKey: communityMukhiQueryKeys.list(filters),
    queryFn: async () => {
      const res = await getCommunityMukhis(filters)
      if (res.error && !res.data) throw new Error(res.error.message)
      return res.data || []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const mukhis: CommunityMukhi[] = useMemo(() => query.data || [], [query.data])

  // Extract distinct grams / locations for dropdown filter
  const distinctGrams = useMemo(() => {
    const set = new Set<string>()
    mukhis.forEach((m) => {
      if (m.gram) {
        // Also split comma-separated locations e.g. "Bajwa, Vadodara" -> "Vadodara"
        const parts = m.gram.split(/[,()]/).map((p) => p.trim()).filter(Boolean)
        parts.forEach((p) => {
          if (p.length > 2 && !p.toLowerCase().startsWith('distt')) {
            set.add(p)
          }
        })
        set.add(m.gram.trim())
      }
    })
    return ['ALL', ...Array.from(set).sort()]
  }, [mukhis])

  const setFilter = (key: keyof CommunityMukhiFilters, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const resetFilters = () => {
    setFilters(initialFilters)
  }

  return {
    mukhis,
    totalCount: mukhis.length,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error.message : null,
    filters,
    setFilter,
    resetFilters,
    distinctGrams,
    refetch: query.refetch,
  }
}
