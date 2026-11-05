/**
 * useMutualConnections — Hook to retrieve count of mutual connections between users
 * (Phase 7 Subtask 2)
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getMutualConnectionsCount } from '../services/connections.service'
import type { MutualConnectionsCountResult } from '../types'

export function useMutualConnections(targetUserId: string | null | undefined) {
  const { user, isAuthenticated } = useAuthContext()
  const callerUserId = user?.id ?? ''

  return useQuery<MutualConnectionsCountResult, Error>({
    queryKey: ['connections', 'mutual', callerUserId, targetUserId],
    queryFn: async () => {
      if (!targetUserId) throw new Error('Target user ID is required')
      const res = await getMutualConnectionsCount(callerUserId, targetUserId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data!
    },
    enabled:
      isAuthenticated &&
      Boolean(callerUserId) &&
      Boolean(targetUserId) &&
      callerUserId !== targetUserId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
