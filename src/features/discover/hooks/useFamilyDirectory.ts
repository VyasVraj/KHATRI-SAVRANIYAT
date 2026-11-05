/**
 * useFamilyDirectory — TanStack Query hook for discovering community family units
 *
 * Query key: ['family-directory', filters, page, pageSize]
 *
 * SECURITY & PRIVACY INVARIANTS:
 * - Gate 1: Table-level privileges require an authenticated community session.
 * - This query is enabled ONLY when the session is authenticated (isAuthenticated === true).
 * - Gate 2: RLS policies in PostgreSQL govern which families and fields are visible.
 * - Directory-safe projections: contact data and sensitive timestamps are never requested or exposed.
 * - FAMILY != HOUSEHOLD: Represents social/genealogical family groups, not residential cohabitation.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { searchFamilies } from '../services/discovery.service'
import type {
  FamilyDiscoveryFilters,
  FamilyDiscoveryResult,
  DiscoveryPage,
} from '../types'

export const familyDirectoryQueryKeys = {
  all: ['family-directory'] as const,
  list: (filters: FamilyDiscoveryFilters, page: number, pageSize: number) =>
    ['family-directory', filters, page, pageSize] as const,
}

/**
 * Hook to discover and search community families with deterministic pagination.
 *
 * @param filters - Validated lineage, location, and status search criteria.
 * @param page - Current 1-based page index.
 * @param pageSize - Page size (max 50, default 20).
 */
export function useFamilyDirectory(
  filters: FamilyDiscoveryFilters = {},
  page: number = 1,
  pageSize: number = 20
) {
  const { user, isAuthenticated } = useAuthContext()

  return useQuery<DiscoveryPage<FamilyDiscoveryResult>>({
    queryKey: familyDirectoryQueryKeys.list(filters, page, pageSize),
    queryFn: async () => {
      const response = await searchFamilies(filters, { page, pageSize }, user?.id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data!
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
