/**
 * usePendingRequests — Hook to retrieve incoming and outgoing pending connection requests
 * (Phase 7 Subtask 2)
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { listConnections } from '../services/connections.service'
import type { ConnectionWithProfile } from '../types'

export function usePendingRequests() {
  const { user, isAuthenticated } = useAuthContext()
  const callerUserId = user?.id ?? ''

  const receivedQuery = useQuery<ConnectionWithProfile[], Error>({
    queryKey: ['connections', callerUserId, 'PENDING_RECEIVED'],
    queryFn: async () => {
      const res = await listConnections(callerUserId, 'PENDING_RECEIVED')
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data ?? []
    },
    enabled: isAuthenticated && Boolean(callerUserId),
    staleTime: 1000 * 60 * 1, // 1 minute
  })

  const sentQuery = useQuery<ConnectionWithProfile[], Error>({
    queryKey: ['connections', callerUserId, 'PENDING_SENT'],
    queryFn: async () => {
      const res = await listConnections(callerUserId, 'PENDING_SENT')
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data ?? []
    },
    enabled: isAuthenticated && Boolean(callerUserId),
    staleTime: 1000 * 60 * 1, // 1 minute
  })

  return {
    receivedRequests: receivedQuery.data ?? [],
    sentRequests: sentQuery.data ?? [],
    isLoading: receivedQuery.isLoading || sentQuery.isLoading,
    isError: receivedQuery.isError || sentQuery.isError,
    error: receivedQuery.error ?? sentQuery.error,
    refetch: async () => {
      await Promise.all([receivedQuery.refetch(), sentQuery.refetch()])
    },
  }
}
