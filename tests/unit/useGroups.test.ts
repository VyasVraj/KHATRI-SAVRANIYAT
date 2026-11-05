/**
 * Unit Tests: Community Groups Hooks (Phase 10 — Subtask 1)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useCreateGroup,
  useJoinGroup,
  useLeaveGroup,
} from '@/features/community/hooks/useGroups'
import * as groupsService from '@/features/community/services/groups.service'

vi.mock('@/features/community/services/groups.service')
vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    profile: { id: 'test-user-id', role: 'MEMBER' },
    isAuthenticated: true,
  }),
}))

describe('Community Groups Hooks', () => {
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
  })

  describe('useCreateGroup', () => {
    it('calls createGroup service and invalidates community-groups queries on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(groupsService.createGroup).mockResolvedValueOnce({
        data: 'new-group-id',
        error: null,
      })

      const hook = captureHook(() => useCreateGroup())

      const result = await hook.mutateAsync({
        name: 'Vadodara Mandal',
        slug: 'vadodara-mandal',
        group_type: 'CULTURAL',
        is_private: false,
      })

      expect(result).toBe('new-group-id')
      expect(groupsService.createGroup).toHaveBeenCalledWith(
        {
          name: 'Vadodara Mandal',
          slug: 'vadodara-mandal',
          group_type: 'CULTURAL',
          is_private: false,
        },
        'test-user-id'
      )
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-groups'],
      })
    })

    it('throws error when service returns an error', async () => {
      vi.mocked(groupsService.createGroup).mockResolvedValueOnce({
        data: null,
        error: { message: 'Slug is already taken.', code: 'GROUP_ERROR' },
      })

      const hook = captureHook(() => useCreateGroup())

      await expect(
        hook.mutateAsync({
          name: 'Taken Group',
          slug: 'taken-group',
          group_type: 'OTHER',
          is_private: false,
        })
      ).rejects.toThrow('Slug is already taken.')
    })
  })

  describe('useJoinGroup', () => {
    it('calls joinGroup service and invalidates group queries on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(groupsService.joinGroup).mockResolvedValueOnce({
        data: 'member-row-id',
        error: null,
      })

      const hook = captureHook(() => useJoinGroup())

      const result = await hook.mutateAsync('group-uuid-1')

      expect(result).toBe('member-row-id')
      expect(groupsService.joinGroup).toHaveBeenCalledWith(
        'group-uuid-1',
        'test-user-id'
      )
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-groups'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-group'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-group-members'],
      })
    })
  })

  describe('useLeaveGroup', () => {
    it('calls leaveGroup service and invalidates group queries on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(groupsService.leaveGroup).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const hook = captureHook(() => useLeaveGroup())

      const result = await hook.mutateAsync('group-uuid-1')

      expect(result).toBe(true)
      expect(groupsService.leaveGroup).toHaveBeenCalledWith(
        'group-uuid-1',
        'test-user-id'
      )
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-groups'],
      })
    })
  })
})
