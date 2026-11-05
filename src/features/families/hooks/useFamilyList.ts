/**
 * useFamilyList — TanStack Query hook for fetching a list of family records.
 *
 * Wraps the listFamilies service function. Returns records visible to the
 * current session based on the deployed RLS privacy policies.
 *
 * Query key: ['families', 'list', params]
 * Data: FamilyRow[] (empty array when no records match)
 */

import { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listFamilies, type ListFamiliesParams } from '../services/families.service'
import { AuthContext } from '@/features/auth/context/AuthContext'

/**
 * Fetch family records visible to the current session.
 *
 * Visibility is determined by RLS — unauthenticated sessions receive only
 * PUBLIC records; authenticated sessions receive COMMUNITY and above.
 *
 * @param params - Optional list parameters (limit).
 */
export function useFamilyList(params?: ListFamiliesParams) {
  const auth = useContext(AuthContext)
  const isAuthLoading = auth?.isLoading ?? false
  const userId = auth?.user?.id ?? null

  return useQuery({
    queryKey: ['families', 'list', params, userId] as const,
    queryFn: async () => {
      const result = await listFamilies(params)
      if (result.error) throw result.error
      return result.data ?? []
    },
    enabled: !isAuthLoading,
    retry: 2,
    staleTime: 1000 * 30, // 30 seconds fresh
  })
}
