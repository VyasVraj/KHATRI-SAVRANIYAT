/**
 * Unit Tests: Verification Service (Phase 9 Subtask 2)
 * (src/features/verification/services/verification.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  submitVerificationRequest,
  sanitizeVerificationError,
} from '@/features/verification/services/verification.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

const PERSON_ID = '11111111-1111-4111-8111-111111111111'
const FAMILY_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'

describe('Verification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('submitVerificationRequest', () => {
    it('returns UNAUTHORIZED when no user session is available and no callerUserId passed', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const res = await submitVerificationRequest({
        entityType: 'PERSON',
        entityId: PERSON_ID,
      })

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('UNAUTHORIZED')
      expect(res.error?.message).toContain('signed in')
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('returns VALIDATION_ERROR on malformed input prior to RPC call', async () => {
      const res = await submitVerificationRequest({
        entityType: 'INVALID' as unknown as 'PERSON',
        entityId: 'not-a-uuid',
      }, USER_ID)

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('successfully calls submit_verification_request RPC for PERSON and returns requestId', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: REQUEST_ID,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await submitVerificationRequest({
        entityType: 'PERSON',
        entityId: PERSON_ID,
        supportingNotes: 'Valid identification records available.',
      }, USER_ID)

      expect(supabase.rpc).toHaveBeenCalledWith('submit_verification_request', {
        p_entity_type: 'PERSON',
        p_entity_id: PERSON_ID,
        p_supporting_notes: 'Valid identification records available.',
      })

      expect(res.error).toBeNull()
      expect(res.data).toEqual({
        requestId: REQUEST_ID,
        entityType: 'PERSON',
        entityId: PERSON_ID,
        status: 'PENDING',
      })
    })

    it('successfully calls submit_verification_request RPC for FAMILY with null supporting notes', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: REQUEST_ID,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await submitVerificationRequest({
        entityType: 'FAMILY',
        entityId: FAMILY_ID,
      }, USER_ID)

      expect(supabase.rpc).toHaveBeenCalledWith('submit_verification_request', {
        p_entity_type: 'FAMILY',
        p_entity_id: FAMILY_ID,
        p_supporting_notes: null,
      })

      expect(res.error).toBeNull()
      expect(res.data?.requestId).toBe(REQUEST_ID)
    })

    it('fetches authenticated user if callerUserId is omitted', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: REQUEST_ID,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await submitVerificationRequest({
        entityType: 'PERSON',
        entityId: PERSON_ID,
      })

      expect(supabase.auth.getUser).toHaveBeenCalled()
      expect(res.data?.requestId).toBe(REQUEST_ID)
    })

    it('handles RPC error when deceased person is submitted', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Cannot verify deceased persons' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await submitVerificationRequest({
        entityType: 'PERSON',
        entityId: PERSON_ID,
      }, USER_ID)

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('RPC_ERROR')
      expect(res.error?.message).toContain('Cannot verify deceased persons')
    })

    it('handles RPC error when entity is already verified', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Entity is already verified' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await submitVerificationRequest({
        entityType: 'FAMILY',
        entityId: FAMILY_ID,
      }, USER_ID)

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('RPC_ERROR')
      expect(res.error?.message).toContain('already verified')
    })

    it('handles RPC error when verification is already pending', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'A verification request is already pending for this entity' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await submitVerificationRequest({
        entityType: 'PERSON',
        entityId: PERSON_ID,
      }, USER_ID)

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('RPC_ERROR')
      expect(res.error?.message).toContain('already pending')
    })

    it('handles unexpected thrown exceptions', async () => {
      vi.mocked(supabase.rpc).mockRejectedValue(new Error('Network failure'))

      const res = await submitVerificationRequest({
        entityType: 'PERSON',
        entityId: PERSON_ID,
      }, USER_ID)

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('NETWORK_ERROR')
      expect(res.error?.message).toContain('Network failure')
    })
  })

  describe('sanitizeVerificationError', () => {
    it('sanitizes deceased error', () => {
      expect(sanitizeVerificationError('Cannot verify deceased persons')).toBe(
        'Cannot verify deceased persons.'
      )
    })

    it('sanitizes already verified error', () => {
      expect(sanitizeVerificationError('Entity is already verified')).toBe(
        'This record is already verified.'
      )
    })

    it('sanitizes already pending error', () => {
      expect(sanitizeVerificationError('A verification request is already pending for this entity')).toBe(
        'A verification request is already pending for this record.'
      )
    })

    it('sanitizes inactive/not found person error', () => {
      expect(sanitizeVerificationError('Person not found or is inactive')).toBe(
        'The specified record was not found or is inactive.'
      )
    })

    it('sanitizes permission denied error', () => {
      expect(sanitizeVerificationError('permission denied for function submit_verification_request')).toBe(
        'You do not have permission to submit verification requests.'
      )
    })

    it('falls back to generic error for unmapped messages', () => {
      expect(sanitizeVerificationError('some unknown postgres error')).toBe(
        'An error occurred while submitting the verification request. Please try again.'
      )
    })
  })

  describe('cancelVerificationRequest', () => {
    it('returns VALIDATION_ERROR if requestId is invalid or missing', async () => {
      const { cancelVerificationRequest } = await import('@/features/verification/services/verification.service')
      const res = await cancelVerificationRequest('')
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('returns UNAUTHORIZED if user session is not available', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const { cancelVerificationRequest } = await import('@/features/verification/services/verification.service')
      const res = await cancelVerificationRequest(REQUEST_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('UNAUTHORIZED')
    })

    it('successfully cancels verification request when authorized', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: true,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { cancelVerificationRequest } = await import('@/features/verification/services/verification.service')
      const res = await cancelVerificationRequest(REQUEST_ID)
      expect(res.data).toBe(true)
      expect(res.error).toBeNull()
      expect(supabase.rpc).toHaveBeenCalledWith('cancel_verification_request', {
        p_request_id: REQUEST_ID,
      })
    })

    it('returns RPC_ERROR when cancellation fails at database level', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Cannot cancel verification request: request is in APPROVED state' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { cancelVerificationRequest } = await import('@/features/verification/services/verification.service')
      const res = await cancelVerificationRequest(REQUEST_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('RPC_ERROR')
    })
  })
})

