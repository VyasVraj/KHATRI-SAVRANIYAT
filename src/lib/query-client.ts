/**
 * TanStack Query client configuration
 *
 * Centralizes query defaults for the entire application.
 * Adjust staleTime and retry logic based on production measurements.
 */

import { QueryClient } from '@tanstack/react-query'
import { IS_DEVELOPMENT } from '@/constants/app'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Consider data fresh for 2 minutes before background refetch
      staleTime: 2 * 60 * 1000,
      // Cache data for 10 minutes after all observers unmount
      gcTime: 10 * 60 * 1000,
      // Don't retry failed queries immediately in development for fast feedback
      retry: IS_DEVELOPMENT ? 1 : 3,
      refetchOnWindowFocus: !IS_DEVELOPMENT,
    },
    mutations: {
      // Don't auto-retry mutations — they have side effects
      retry: 0,
    },
  },
})
