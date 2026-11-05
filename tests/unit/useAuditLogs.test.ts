/**
 * Unit Tests: useAuditLogs Hook (Phase 13 Subtask 3)
 * (src/features/admin/hooks/useAuditLogs.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuditLogs } from '@/features/admin/hooks/useAuditLogs'
import * as adminService from '@/features/admin/services/admin.service'

vi.mock('@/features/admin/services/admin.service')

describe('useAuditLogs Hook', () => {
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

  it('initializes useAuditLogs query with provided filter parameters', () => {
    vi.spyOn(adminService, 'getAuditLogs').mockResolvedValue({
      logs: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    })

    const result = captureHook(() =>
      useAuditLogs({ action: 'USER_ROLE_CHANGED', page: 1, pageSize: 20 })
    )
    expect(result.isLoading).toBe(true)
  })
})
