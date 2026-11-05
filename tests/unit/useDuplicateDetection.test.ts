/**
 * Unit Tests: Duplicate Detection Hooks (Phase 9 — Subtask 4)
 * (src/features/verification/hooks/useDuplicateDetection.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useFlagDuplicate,
  useResolveDuplicate,
  useDuplicateFlags,
} from '@/features/verification/hooks/useDuplicateDetection'
import * as duplicateService from '@/features/verification/services/duplicateDetection.service'
import type { EnrichedDuplicateFlag } from '@/features/verification/types/duplicate.types'

vi.mock('@/features/verification/services/duplicateDetection.service')

describe('Duplicate Detection Hooks', () => {
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

  describe('useFlagDuplicate', () => {
    it('calls flagDuplicateRecord and invalidates duplicate-flags cache on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(duplicateService.flagDuplicateRecord).mockResolvedValue({
        data: 'flag-uuid-123',
        error: null,
      })

      const hook = captureHook(() => useFlagDuplicate())
      const result = await hook.mutateAsync({
        entityType: 'PERSON',
        recordAId: 'rec-a',
        recordBId: 'rec-b',
        confidence: 'STRONG',
        matchReasons: ['Full name match'],
      })

      expect(result).toBe('flag-uuid-123')
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['duplicate-flags'] })
    })

    it('throws error when flagDuplicateRecord fails', async () => {
      vi.mocked(duplicateService.flagDuplicateRecord).mockResolvedValue({
        data: null,
        error: { code: 'RPC_ERROR', message: 'Failed to flag duplicate.' },
      })

      const hook = captureHook(() => useFlagDuplicate())
      await expect(
        hook.mutateAsync({
          entityType: 'PERSON',
          recordAId: 'rec-a',
          recordBId: 'rec-b',
          confidence: 'STRONG',
          matchReasons: ['Full name match'],
        })
      ).rejects.toThrow('Failed to flag duplicate.')
    })
  })

  describe('useResolveDuplicate', () => {
    it('calls resolveDuplicateFlag and invalidates duplicate-flags cache on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(duplicateService.resolveDuplicateFlag).mockResolvedValue({
        data: true,
        error: null,
      })

      const hook = captureHook(() => useResolveDuplicate())
      const result = await hook.mutateAsync({
        flagId: 'flag-uuid-123',
        resolution: 'CONFIRMED_DUPLICATE',
      })

      expect(result).toBe(true)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['duplicate-flags'] })
    })
  })

  describe('useDuplicateFlags', () => {
    it('initializes query correctly', () => {
      vi.mocked(duplicateService.listDuplicateFlags).mockResolvedValue({
        data: [] as EnrichedDuplicateFlag[],
        error: null,
      })

      const hook = captureHook(() => useDuplicateFlags({ status: 'OPEN' }))
      expect(hook.isLoading).toBe(true)
    })
  })
})
