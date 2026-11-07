/**
 * Unit Tests: Claims Service (Phase 8 Subtask 2)
 * (src/features/claims/services/claims.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  submitPersonClaim,
  getMyClaimForPerson,
  getMyClaims,
  cancelPersonClaim,
} from '@/features/claims/services/claims.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const CLAIM_ID = '33333333-3333-4333-8333-333333333333'

const MOCK_CLAIM = {
  id: CLAIM_ID,
  person_id: PERSON_ID,
  claimant_id: USER_ID,
  status: 'PENDING' as const,
  evidence_notes: 'My verification note',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
}

describe('Claims Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default RPC to function not found so legacy direct-insert fallback is tested
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((supabase as any).rpc).mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    })
  })

  describe('submitPersonClaim', () => {
    it('returns error if user is unauthenticated and no callerUserId provided', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const res = await submitPersonClaim({ personId: PERSON_ID })
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('UNAUTHORIZED')
      expect(res.error?.message).toContain('signed in')
    })

    it('returns validation error on invalid personId UUID', async () => {
      const res = await submitPersonClaim(
        { personId: 'not-a-uuid' },
        USER_ID
      )
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('returns validation error if evidenceNotes exceed 1000 characters', async () => {
      const longNotes = 'a'.repeat(1001)
      const res = await submitPersonClaim(
        { personId: PERSON_ID, evidenceNotes: longNotes },
        USER_ID
      )
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
      expect(res.error?.message).toContain('1000 characters')
    })

    it('successfully submits claim with trimmed notes', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: MOCK_CLAIM,
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await submitPersonClaim(
        { personId: PERSON_ID, evidenceNotes: '  My verification note   ' },
        USER_ID
      )

      expect(res.error).toBeNull()
      expect(res.data).toEqual(MOCK_CLAIM)
      expect(mockInsert).toHaveBeenCalledWith({
        person_id: PERSON_ID,
        claimant_id: USER_ID,
        status: 'PENDING',
        evidence_notes: 'My verification note',
      })
    })

    it('sanitizes duplicate pending claim for target person error (23505)', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "idx_person_claims_pending_person"',
        },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await submitPersonClaim({ personId: PERSON_ID }, USER_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('23505')
      expect(res.error?.message).toBe(
        'There is already a pending claim under review for this person.'
      )
    })

    it('sanitizes duplicate pending claim for claimant account error (23505)', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "idx_person_claims_pending_claimant"',
        },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await submitPersonClaim({ personId: PERSON_ID }, USER_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('23505')
      expect(res.error?.message).toBe(
        'You already have an active pending claim. You can only have one pending claim at a time.'
      )
    })

    it('sanitizes RLS permission denied error (42501)', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '42501',
          message: 'new row violates row-level security policy for table "person_claims"',
        },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await submitPersonClaim({ personId: PERSON_ID }, USER_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('42501')
      expect(res.error?.message).toContain('Unable to submit claim')
    })

    it('successfully submits claim via submit_profile_claim RPC when available', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked((supabase as any).rpc).mockResolvedValue({
        data: {
          success: true,
          claim_id: CLAIM_ID,
          message: 'Claim submitted successfully.',
        },
        error: null,
      })

      const res = await submitPersonClaim(
        { personId: PERSON_ID, evidenceNotes: '  RPC verification note   ' },
        USER_ID
      )

      expect(res.error).toBeNull()
      expect(res.data?.id).toBe(CLAIM_ID)
      expect(res.data?.status).toBe('PENDING')
      expect(res.data?.evidence_notes).toBe('RPC verification note')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((supabase as any).rpc).toHaveBeenCalledWith('submit_profile_claim', {
        p_person_id: PERSON_ID,
        p_family_id: null,
        p_evidence_notes: 'RPC verification note',
      })
    })

    it('preserves specific error messages returned by submit_profile_claim RPC', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked((supabase as any).rpc).mockResolvedValue({
        data: null,
        error: {
          code: '23514',
          message: 'Your account is already linked to a community person profile.',
        },
      })

      const res = await submitPersonClaim({ personId: PERSON_ID }, USER_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('23514')
      expect(res.error?.message).toBe('Your account is already linked to a community person profile.')
    })
  })

  describe('getMyClaimForPerson', () => {
    it('returns null if unauthenticated', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const res = await getMyClaimForPerson(PERSON_ID)
      expect(res.data).toBeNull()
      expect(res.error).toBeNull()
    })

    it('returns validation error on invalid personId', async () => {
      const res = await getMyClaimForPerson('invalid-uuid', USER_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('returns claim row if found for user', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: MOCK_CLAIM,
        error: null,
      })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockEqClaimant = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEqPerson = vi.fn().mockReturnValue({ eq: mockEqClaimant })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqPerson })

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await getMyClaimForPerson(PERSON_ID, USER_ID)
      expect(res.error).toBeNull()
      expect(res.data).toEqual(MOCK_CLAIM)
    })

    it('returns null if no claim exists', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockEqClaimant = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEqPerson = vi.fn().mockReturnValue({ eq: mockEqClaimant })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqPerson })

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await getMyClaimForPerson(PERSON_ID, USER_ID)
      expect(res.error).toBeNull()
      expect(res.data).toBeNull()
    })
  })

  describe('getMyClaims', () => {
    it('returns empty array if unauthenticated', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const res = await getMyClaims()
      expect(res.data).toEqual([])
      expect(res.error).toBeNull()
    })

    it('returns list of user claims', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [MOCK_CLAIM],
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await getMyClaims(USER_ID)
      expect(res.error).toBeNull()
      expect(res.data).toEqual([MOCK_CLAIM])
    })
  })

  describe('cancelPersonClaim', () => {
    it('returns error if unauthenticated', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const res = await cancelPersonClaim({
        claimId: CLAIM_ID,
        personId: PERSON_ID,
      })
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('UNAUTHORIZED')
    })

    it('successfully cancels claim', async () => {
      const cancelledClaim = { ...MOCK_CLAIM, status: 'CANCELLED' as const }
      const mockSingle = vi.fn().mockResolvedValue({
        data: cancelledClaim,
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqStatus = vi.fn().mockReturnValue({ select: mockSelect })
      const mockEqClaimant = vi.fn().mockReturnValue({ eq: mockEqStatus })
      const mockEqId = vi.fn().mockReturnValue({ eq: mockEqClaimant })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId })

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await cancelPersonClaim(
        { claimId: CLAIM_ID, personId: PERSON_ID },
        USER_ID
      )
      expect(res.error).toBeNull()
      expect(res.data).toEqual(cancelledClaim)
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'CANCELLED' })
    })

    it('handles database error when cancelling claim', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqStatus = vi.fn().mockReturnValue({ select: mockSelect })
      const mockEqClaimant = vi.fn().mockReturnValue({ eq: mockEqStatus })
      const mockEqId = vi.fn().mockReturnValue({ eq: mockEqClaimant })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId })

      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
      } as unknown as ReturnType<typeof supabase.from>)

      const res = await cancelPersonClaim(
        { claimId: CLAIM_ID, personId: PERSON_ID },
        USER_ID
      )
      expect(res.data).toBeNull()
      expect(res.error?.message).toContain('Unable to cancel claim')
    })
  })
})
