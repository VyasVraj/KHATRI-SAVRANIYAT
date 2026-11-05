/**
 * useConnectionWithUser — Hook to retrieve the connection between the current user and a target user
 * (Phase 7 Subtask 4)
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getConnectionWithUser } from '../services/connections.service'
import type { ConnectionRow } from '../types'

export function useConnectionWithUser(targetUserId: string | null | undefined) {
  const { user, isAuthenticated } = useAuthContext()
  const callerUserId = user?.id ?? ''

  return useQuery<ConnectionRow | null, Error>({
    queryKey: ['connections', 'user-connection', callerUserId, targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null
      const res = await getConnectionWithUser(callerUserId, targetUserId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled:
      isAuthenticated &&
      Boolean(callerUserId) &&
      Boolean(targetUserId) &&
      callerUserId !== targetUserId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
