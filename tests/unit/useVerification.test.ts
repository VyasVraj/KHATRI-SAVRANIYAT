/**
 * Unit Tests: Verification Hooks (Phase 9 Subtask 2)
 * (src/features/verification/hooks/useVerification.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSubmitVerificationRequest } from '@/features/verification/hooks/useVerification'
import * as verificationService from '@/features/verification/services/verification.service'

vi.mock('@/features/verification/services/verification.service')

const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const FAMILY_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'

describe('useSubmitVerificationRequest', () => {
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

  it('submits verification for PERSON and invalidates persons cache', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    vi.mocked(verificationService.submitVerificationRequest).mockResolvedValue({
      data: {
        requestId: REQUEST_ID,
        entityType: 'PERSON',
        entityId: PERSON_ID,
        status: 'PENDING',
      },
      error: null,
    })

    const mutation = captureHook(() => useSubmitVerificationRequest())

    const res = await mutation.mutateAsync({
      entityType: 'PERSON',
      entityId: PERSON_ID,
      supportingNotes: 'Identification note',
    })

    expect(res.requestId).toBe(REQUEST_ID)
    expect(verificationService.submitVerificationRequest).toHaveBeenCalledWith({
      entityType: 'PERSON',
      entityId: PERSON_ID,
      supportingNotes: 'Identification note',
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['persons', PERSON_ID],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['people'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['people-directory'],
    })
  })

  it('submits verification for FAMILY and invalidates families cache', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    vi.mocked(verificationService.submitVerificationRequest).mockResolvedValue({
      data: {
        requestId: REQUEST_ID,
        entityType: 'FAMILY',
        entityId: FAMILY_ID,
        status: 'PENDING',
      },
      error: null,
    })

    const mutation = captureHook(() => useSubmitVerificationRequest())

    const res = await mutation.mutateAsync({
      entityType: 'FAMILY',
      entityId: FAMILY_ID,
    })

    expect(res.requestId).toBe(REQUEST_ID)
    expect(verificationService.submitVerificationRequest).toHaveBeenCalledWith({
      entityType: 'FAMILY',
      entityId: FAMILY_ID,
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['families', FAMILY_ID],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['families'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['family-directory'],
    })
  })

  it('throws an error when service returns an error', async () => {
    vi.mocked(verificationService.submitVerificationRequest).mockResolvedValue({
      data: null,
      error: {
        code: 'RPC_ERROR',
        message: 'A verification request is already pending for this record.',
      },
    })

    const mutation = captureHook(() => useSubmitVerificationRequest())

    await expect(
      mutation.mutateAsync({
        entityType: 'PERSON',
        entityId: PERSON_ID,
      })
    ).rejects.toThrow('A verification request is already pending for this record.')
  })
})
