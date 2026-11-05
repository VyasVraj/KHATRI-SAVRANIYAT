/**
 * usePeopleDirectory — TanStack Query hook for discovering census persons
 *
 * Query key: ['people-directory', filters, page, pageSize]
 *
 * SECURITY & PRIVACY INVARIANTS:
 * - Gate 1: Table-level privileges require an authenticated community session.
 * - This query is enabled ONLY when the session is authenticated (isAuthenticated === true).
 * - Gate 2: RLS policies in PostgreSQL govern which rows and profiles are visible.
 * - Directory-safe projections: contact data and sensitive timestamps are never requested or exposed.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  searchPersons,
  getDiscoveryFilterOptions,
} from '../services/discovery.service'
import type {
  PersonDiscoveryFilters,
  PersonDiscoveryResult,
  DiscoveryPage,
  DiscoveryFilterOptions,
} from '../types'

export const directoryQueryKeys = {
  all: ['people-directory'] as const,
  list: (filters: PersonDiscoveryFilters, page: number, pageSize: number) =>
    ['people-directory', filters, page, pageSize] as const,
  filterOptions: () => ['discovery-filter-options'] as const,
}

/**
 * Hook to discover and search community persons with deterministic pagination.
 *
 * @param filters - Validated lineage, origin, and status search criteria.
 * @param page - Current 1-based page index.
 * @param pageSize - Page size (max 50, default 20).
 */
export function usePeopleDirectory(
  filters: PersonDiscoveryFilters = {},
  page: number = 1,
  pageSize: number = 20
) {
  const { user, isAuthenticated } = useAuthContext()

  return useQuery<DiscoveryPage<PersonDiscoveryResult>>({
    queryKey: directoryQueryKeys.list(filters, page, pageSize),
    queryFn: async () => {
      const response = await searchPersons(filters, { page, pageSize }, user?.id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data!
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to load distinct filter options for gotra, nukh, and kul dropdowns.
 */
export function useDiscoveryFilterOptions() {
  const { isAuthenticated } = useAuthContext()

  return useQuery<DiscoveryFilterOptions>({
    queryKey: directoryQueryKeys.filterOptions(),
    queryFn: async () => {
      const response = await getDiscoveryFilterOptions()
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data!
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}
