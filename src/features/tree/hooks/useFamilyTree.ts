/**
 * useFamilyTree — TanStack Query hook for fetching an accurate, interactive genealogical TreeGraph.
 *
 * PRIVACY & SECURITY RULES:
 * - Gate 1: anon and PUBLIC have zero privileges on public.relationships.
 * - This query is enabled ONLY when the session is authenticated (isAuthenticated === true).
 * - Gate 2: RLS dual-endpoint rule returns rows only when both endpoints are visible.
 *
 * Query key: ['family-tree', personId, familyId]
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getPersonTreeGraph } from '../services/tree.service'
import type { TreeGraph } from '../types'

export const treeQueryKeys = {
  all: ['family-tree'] as const,
  tree: (personId: string | undefined, familyId?: string | undefined) =>
    familyId !== undefined
      ? (['family-tree', personId, familyId] as const)
      : (['family-tree', personId] as const),
}

/**
 * Hook to retrieve the genealogical tree graph centered on personId and optional familyId.
 *
 * @param personId - Target root person UUID
 * @param familyId - Optional family UUID to scope the full family roster
 */
export function useFamilyTree(personId: string | undefined, familyId?: string | undefined) {
  const { isAuthenticated } = useAuthContext()

  return useQuery<TreeGraph>({
    queryKey: treeQueryKeys.tree(personId, familyId),
    queryFn: async () => {
      if (!personId) throw new Error('Person ID is required.')
      const result = await getPersonTreeGraph(personId, familyId)
      if (result.error) throw result.error
      return result.data!
    },
    enabled: Boolean(personId) && isAuthenticated,
    staleTime: 1000 * 60 * 3, // 3 minutes
  })
}
