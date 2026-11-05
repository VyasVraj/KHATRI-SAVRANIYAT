/**
 * Unit Tests: useAdminUsers Hook (Phase 13 Subtask 3)
 * (src/features/admin/hooks/useAdminUsers.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAdminUsers, useAdminUserMutations } from '@/features/admin/hooks/useAdminUsers'
import * as adminService from '@/features/admin/services/admin.service'

vi.mock('@/features/admin/services/admin.service')

describe('useAdminUsers Hook', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

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

  it('initializes useAdminUsers query with default parameters', () => {
    vi.spyOn(adminService, 'listAdminUsers').mockResolvedValue({
      users: [],
      totalCount: 0,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    })

    const result = captureHook(() => useAdminUsers({ page: 1, pageSize: 15 }))
    expect(result.isLoading).toBe(true)
  })

  it('executes updateRole mutation and invalidates admin queries', async () => {
    vi.spyOn(adminService, 'updateUserRole').mockResolvedValue(true)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const mutations = captureHook(() => useAdminUserMutations())
    const success = await mutations.updateRole.mutateAsync({
      userId: 'user-123',
      newRole: 'ADMIN',
    })

    expect(adminService.updateUserRole).toHaveBeenCalledWith('user-123', 'ADMIN')
    expect(success).toBe(true)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin'] })
  })

  it('executes setStatus mutation and invalidates admin queries', async () => {
    vi.spyOn(adminService, 'setUserStatus').mockResolvedValue(true)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const mutations = captureHook(() => useAdminUserMutations())
    const success = await mutations.setStatus.mutateAsync({
      userId: 'user-123',
      isActive: false,
      reason: 'Terms violation',
    })

    expect(adminService.setUserStatus).toHaveBeenCalledWith('user-123', false, 'Terms violation')
    expect(success).toBe(true)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin'] })
  })
})
