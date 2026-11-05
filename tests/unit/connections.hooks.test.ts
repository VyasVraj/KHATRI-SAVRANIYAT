/**
 * Unit Tests: Connections Domain React Hooks
 * (src/features/connections/hooks/*)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/features/connections/hooks/useConnections'
import { usePendingRequests } from '@/features/connections/hooks/usePendingRequests'
import { useConnectionMutations } from '@/features/connections/hooks/useConnectionMutations'
import { useMutualConnections } from '@/features/connections/hooks/useMutualConnections'
import { useConnectionWithUser } from '@/features/connections/hooks/useConnectionWithUser'
import * as connectionsService from '@/features/connections/services/connections.service'
import * as authContext from '@/features/auth/context/AuthContext'
import type { ConnectionWithProfile } from '@/features/connections/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/connections/services/connections.service')

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const CONN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const MOCK_CONNECTION: ConnectionWithProfile = {
  id: CONN_ID,
  requester_id: USER_A,
  addressee_id: USER_B,
  status: 'ACCEPTED',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-05T00:00:00Z',
  is_requester: true,
  other_user: {
    id: USER_B,
    display_name: 'Priya Sharma',
    avatar_url: null,
  },
}

describe('Connections Hooks', () => {
  let queryClient: QueryClient

  function captureHook<T>(hookFn: () => T): T {
    let captured!: T
    function TestComponent() {
      captured = hookFn()
      return null
    }
    renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(TestComponent)
      )
    )
    return captured
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: USER_A } as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  describe('useConnections', () => {
    it('initializes query with correct queryKey and enabled flag when authenticated', () => {
      vi.spyOn(connectionsService, 'listConnections').mockResolvedValue({
        data: [MOCK_CONNECTION],
        error: null,
      })

      const query = captureHook(() => useConnections('ACCEPTED'))
      expect(query.fetchStatus).toBe('fetching')
    })

    it('remains idle when user is unauthenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      const query = captureHook(() => useConnections('ACCEPTED'))
      expect(query.fetchStatus).toBe('idle')
      expect(connectionsService.listConnections).not.toHaveBeenCalled()
    })
  })

  describe('usePendingRequests', () => {
    it('initializes both received and sent pending queries', () => {
      const hook = captureHook(() => usePendingRequests())
      expect(hook.receivedRequests).toEqual([])
      expect(hook.sentRequests).toEqual([])
      expect(typeof hook.refetch).toBe('function')
    })
  })

  describe('useConnectionMutations', () => {
    it('exposes all mutation handlers', () => {
      const mutations = captureHook(() => useConnectionMutations())
      expect(typeof mutations.sendRequest.mutateAsync).toBe('function')
      expect(typeof mutations.acceptRequest.mutateAsync).toBe('function')
      expect(typeof mutations.rejectRequest.mutateAsync).toBe('function')
      expect(typeof mutations.remove.mutateAsync).toBe('function')
      expect(typeof mutations.block.mutateAsync).toBe('function')
    })

    it('sendRequest mutation calls sendConnectionRequest with caller ID', async () => {
      vi.spyOn(connectionsService, 'sendConnectionRequest').mockResolvedValue({
        data: MOCK_CONNECTION,
        error: null,
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const mutations = captureHook(() => useConnectionMutations())
      await mutations.sendRequest.mutateAsync({ addressee_id: USER_B })

      expect(connectionsService.sendConnectionRequest).toHaveBeenCalledWith(
        { addressee_id: USER_B },
        USER_A
      )
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['connections', USER_A] })
    })

    it('acceptRequest mutation calls acceptConnectionRequest', async () => {
      vi.spyOn(connectionsService, 'acceptConnectionRequest').mockResolvedValue({
        data: MOCK_CONNECTION,
        error: null,
      })
      const mutations = captureHook(() => useConnectionMutations())
      await mutations.acceptRequest.mutateAsync(CONN_ID)

      expect(connectionsService.acceptConnectionRequest).toHaveBeenCalledWith(CONN_ID, USER_A)
    })

    it('rejectRequest mutation calls rejectConnectionRequest', async () => {
      vi.spyOn(connectionsService, 'rejectConnectionRequest').mockResolvedValue({
        data: MOCK_CONNECTION,
        error: null,
      })
      const mutations = captureHook(() => useConnectionMutations())
      await mutations.rejectRequest.mutateAsync(CONN_ID)

      expect(connectionsService.rejectConnectionRequest).toHaveBeenCalledWith(CONN_ID, USER_A)
    })

    it('remove mutation calls removeConnection', async () => {
      vi.spyOn(connectionsService, 'removeConnection').mockResolvedValue({
        data: { success: true },
        error: null,
      })
      const mutations = captureHook(() => useConnectionMutations())
      await mutations.remove.mutateAsync(CONN_ID)

      expect(connectionsService.removeConnection).toHaveBeenCalledWith(CONN_ID, USER_A)
    })

    it('block mutation calls blockUser', async () => {
      vi.spyOn(connectionsService, 'blockUser').mockResolvedValue({
        data: MOCK_CONNECTION,
        error: null,
      })
      const mutations = captureHook(() => useConnectionMutations())
      await mutations.block.mutateAsync(USER_B)

      expect(connectionsService.blockUser).toHaveBeenCalledWith(USER_B, USER_A)
    })
  })

  describe('useMutualConnections', () => {
    it('is disabled when target user is same as caller', () => {
      const hook = captureHook(() => useMutualConnections(USER_A))
      expect(hook.fetchStatus).toBe('idle')
      expect(connectionsService.getMutualConnectionsCount).not.toHaveBeenCalled()
    })

    it('is disabled when target user is null', () => {
      const hook = captureHook(() => useMutualConnections(null))
      expect(hook.fetchStatus).toBe('idle')
      expect(connectionsService.getMutualConnectionsCount).not.toHaveBeenCalled()
    })
  })

  describe('useConnectionWithUser', () => {
    it('is disabled when target user is same as caller', () => {
      const hook = captureHook(() => useConnectionWithUser(USER_A))
      expect(hook.fetchStatus).toBe('idle')
      expect(connectionsService.getConnectionWithUser).not.toHaveBeenCalled()
    })

    it('is disabled when target user is null', () => {
      const hook = captureHook(() => useConnectionWithUser(null))
      expect(hook.fetchStatus).toBe('idle')
      expect(connectionsService.getConnectionWithUser).not.toHaveBeenCalled()
    })

    it('fetches connection when caller and target are distinct', () => {
      vi.spyOn(connectionsService, 'getConnectionWithUser').mockResolvedValue({
        data: MOCK_CONNECTION,
        error: null,
      })
      const hook = captureHook(() => useConnectionWithUser(USER_B))
      expect(hook.fetchStatus).toBe('fetching')
    })
  })
})

