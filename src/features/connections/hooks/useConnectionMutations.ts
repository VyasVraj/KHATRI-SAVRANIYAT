/**
 * useConnectionMutations — Mutation hooks for all connection actions
 * (Phase 7 Subtask 2)
 *
 * Scoped to current authenticated user. Invalidates only domain connection queries.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
  blockUser,
} from '../services/connections.service'
import type { SendConnectionRequestInput } from '../schemas/connections.schemas'

export function useConnectionMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()
  const callerUserId = user?.id ?? ''

  const invalidateConnections = () => {
    queryClient.invalidateQueries({ queryKey: ['connections', callerUserId] })
  }

  const sendRequest = useMutation({
    mutationFn: async (input: SendConnectionRequestInput) => {
      const res = await sendConnectionRequest(input, callerUserId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: invalidateConnections,
  })

  const acceptRequest = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await acceptConnectionRequest(connectionId, callerUserId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: invalidateConnections,
  })

  const rejectRequest = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await rejectConnectionRequest(connectionId, callerUserId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: invalidateConnections,
  })

  const remove = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await removeConnection(connectionId, callerUserId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: invalidateConnections,
  })

  const block = useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await blockUser(targetUserId, callerUserId)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    onSuccess: invalidateConnections,
  })

  return {
    sendRequest,
    acceptRequest,
    rejectRequest,
    remove,
    block,
  }
}
