/**
 * Hook: usePlatformMetrics
 *
 * TanStack Query hook for fetching platform-wide metrics in the Admin Hub.
 * (Phase 13 Subtask 2)
 */

import { useQuery } from '@tanstack/react-query'
import { getPlatformMetrics } from '../services/admin.service'
import type { PlatformMetrics } from '../types'

export const ADMIN_METRICS_QUERY_KEY = ['admin', 'platform-metrics'] as const

/**
 * Queries platform-level metrics with automatic caching and window refetch.
 */
export function usePlatformMetrics() {
  return useQuery<PlatformMetrics, Error>({
    queryKey: ADMIN_METRICS_QUERY_KEY,
    queryFn: getPlatformMetrics,
    staleTime: 30_000, // 30 seconds fresh
    refetchOnWindowFocus: true,
  })
}
