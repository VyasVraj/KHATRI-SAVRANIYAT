/**
 * useFamilyTree — TanStack Query hook for fetching a bounded genealogical TreeGraph.
 *
 * PRIVACY & SECURITY RULES:
 * - Gate 1: anon and PUBLIC have zero privileges on public.relationships.
 * - This query is enabled ONLY when the session is authenticated (isAuthenticated === true).
 * - Gate 2: RLS dual-endpoint rule returns rows only when both endpoints are visible.
 *
 * Query key: ['family-tree', personId]
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getPersonTreeGraph } from '../services/tree.service'
import type { TreeGraph } from '../types'

export const treeQueryKeys = {
  all: ['family-tree'] as const,
  tree: (personId: string | undefined) => ['family-tree', personId] as const,
}

/**
 * Hook to retrieve the bounded genealogical tree graph centered on personId.
 *
 * @param personId - Target root person UUID
 */
export function useFamilyTree(personId: string | undefined) {
  const { isAuthenticated } = useAuthContext()

  return useQuery<TreeGraph>({
    queryKey: treeQueryKeys.tree(personId),
    queryFn: async () => {
      if (!personId) throw new Error('Person ID is required.')
      const result = await getPersonTreeGraph(personId)
      if (result.error) throw result.error
      return result.data!
    },
    // Only execute query when authenticated and personId is provided.
    // Unauthenticated visitors receive zero relationship data under Gate 1 privileges.
    enabled: Boolean(personId) && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
