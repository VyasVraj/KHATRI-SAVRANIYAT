/**
 * useMyFamilyIds — TanStack Query hook for fetching the IDs of families
 * the current user creates, manages, or is an active member of.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getMyFamilyIds } from '../services/families.service'

export function useMyFamilyIds() {
  const { user, isLoading: isAuthLoading } = useAuthContext()
  const userId = user?.id

  return useQuery({
    queryKey: ['my-family-ids', userId] as const,
    queryFn: async () => {
      if (!userId) return []
      return await getMyFamilyIds(userId)
    },
    enabled: Boolean(userId && !isAuthLoading),
    staleTime: 1000 * 30, // 30 seconds
  })
}
