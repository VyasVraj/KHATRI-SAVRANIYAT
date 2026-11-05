/**
 * Unit Tests: useAdminDuplicates Hook (Phase 13 Subtask 4)
 * (src/features/admin/hooks/useAdminDuplicates.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAdminDuplicates, useResolveAdminDuplicate } from '@/features/admin/hooks/useAdminDuplicates'
import * as adminService from '@/features/admin/services/admin.service'

vi.mock('@/features/admin/services/admin.service')

describe('useAdminDuplicates Hook', () => {
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

  it('initializes useAdminDuplicates query with parameters', () => {
    vi.spyOn(adminService, 'listAdminDuplicates').mockResolvedValue({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })

    const hook = captureHook(() => useAdminDuplicates({ status: 'OPEN', page: 1 }))
    expect(hook).toBeDefined()
    expect(hook.isLoading).toBe(true)
  })

  it('useResolveAdminDuplicate provides mutateAsync and invalidates cache', async () => {
    vi.spyOn(adminService, 'resolveAdminDuplicate').mockResolvedValue(true)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const mutation = captureHook(() => useResolveAdminDuplicate())
    expect(mutation.mutateAsync).toBeDefined()

    await mutation.mutateAsync({
      flagId: 'flag-1',
      resolution: 'CONFIRMED_DUPLICATE',
      resolutionNotes: 'Confirmed duplicate note',
    })

    expect(adminService.resolveAdminDuplicate).toHaveBeenCalledWith({
      flagId: 'flag-1',
      resolution: 'CONFIRMED_DUPLICATE',
      resolutionNotes: 'Confirmed duplicate note',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'duplicates'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'platform-metrics'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['duplicate-flags'] })
  })
})
