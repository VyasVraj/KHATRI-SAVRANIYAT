/**
 * Unit Tests: usePlatformMetrics Hook (Phase 13 Subtask 2)
 * (src/features/admin/hooks/usePlatformMetrics.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePlatformMetrics, ADMIN_METRICS_QUERY_KEY } from '@/features/admin/hooks/usePlatformMetrics'
import * as adminService from '@/features/admin/services/admin.service'

vi.mock('@/features/admin/services/admin.service')

describe('usePlatformMetrics Hook', () => {
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
      },
    })
  })

  it('exposes correct query key ADMIN_METRICS_QUERY_KEY', () => {
    expect(ADMIN_METRICS_QUERY_KEY).toEqual(['admin', 'platform-metrics'])
  })

  it('initializes query in fetching status on mount', () => {
    const mockMetrics = {
      total_users: 25,
      active_users: 20,
      total_persons: 150,
      total_families: 40,
      pending_claims: 5,
      pending_verifications: 2,
      open_duplicates: 0,
      generated_at: '2026-10-16T15:00:00Z',
    }

    vi.mocked(adminService.getPlatformMetrics).mockResolvedValue(mockMetrics)

    const hookResult = captureHook(() => usePlatformMetrics())

    expect(hookResult.isLoading).toBe(true)
    expect(hookResult.fetchStatus).toBe('fetching')
  })

  it('returns cached data and not loading when data exists in queryClient', () => {
    const mockMetrics = {
      total_users: 10,
      active_users: 9,
      total_persons: 45,
      total_families: 12,
      pending_claims: 1,
      pending_verifications: 0,
      open_duplicates: 0,
      generated_at: '2026-10-16T15:00:00Z',
    }

    queryClient.setQueryData(ADMIN_METRICS_QUERY_KEY, mockMetrics)

    const hookResult = captureHook(() => usePlatformMetrics())

    expect(hookResult.data).toEqual(mockMetrics)
    expect(hookResult.isLoading).toBe(false)
  })
})
