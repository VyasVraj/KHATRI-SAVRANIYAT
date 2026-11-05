/**
 * useConnections — Hook to retrieve user connections with status filtering
 * (Phase 7 Subtask 2)
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { listConnections } from '../services/connections.service'
import type { ConnectionListFilter, ConnectionWithProfile } from '../types'

export function useConnections(filter: ConnectionListFilter = 'ACCEPTED') {
  const { user, isAuthenticated } = useAuthContext()
  const callerUserId = user?.id ?? ''

  return useQuery<ConnectionWithProfile[], Error>({
    queryKey: ['connections', callerUserId, filter],
    queryFn: async () => {
      const res = await listConnections(callerUserId, filter)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data ?? []
    },
    enabled: isAuthenticated && Boolean(callerUserId),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
