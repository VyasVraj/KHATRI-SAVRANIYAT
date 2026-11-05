/**
 * Unit Tests: Claim Review Service & Schemas (Phase 8 Subtask 3)
 * (src/features/claims/services/claims.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listPendingClaimsForReview,
  getClaimForReview,
  approveClaim,
  rejectClaim,
} from '@/features/claims/services/claims.service'
import {
  approveClaimSchema,
  rejectClaimSchema,
} from '@/features/claims/schemas/claims.schemas'
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

const CLAIM_ID = '33333333-3333-4333-8333-333333333333'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const CLAIMANT_ID = '11111111-1111-4111-8111-111111111111'
const MODERATOR_ID = '99999999-9999-4999-8999-999999999999'

const MOCK_RAW_ROW = {
  id: CLAIM_ID,
  person_id: PERSON_ID,
  claimant_id: CLAIMANT_ID,
  status: 'PENDING',
  evidence_notes: 'I am Aarav Patel, verified by my birth certificate.',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
  person: {
    id: PERSON_ID,
    first_name: 'Aarav',
    middle_name: 'K.',
    last_name: 'Patel',
    date_of_birth: '1990-05-15',
    birth_place: 'Mumbai',
    gotra: 'Kashyap',
    nukh: 'Shah',
    kul: null,
    status: 'ACTIVE',
    verification_status: 'VERIFIED',
    user_id: null,
  },
  claimant: {
    id: CLAIMANT_ID,
    display_name: 'Aarav Patel',
    avatar_url: null,
    email: 'aarav@example.com',
  },
}

describe('Claim Review Schemas', () => {
  it('approveClaimSchema validates valid claimId UUID', () => {
    const valid = approveClaimSchema.safeParse({ claimId: CLAIM_ID })
    expect(valid.success).toBe(true)
  })

  it('approveClaimSchema rejects invalid claimId UUID', () => {
    const invalid = approveClaimSchema.safeParse({ claimId: 'invalid-uuid' })
    expect(invalid.success).toBe(false)
  })

  it('rejectClaimSchema accepts valid trimmed reason', () => {
    const valid = rejectClaimSchema.safeParse({
      claimId: CLAIM_ID,
      reason: 'Information does not match community record.',
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.reason).toBe('Information does not match community record.')
    }
  })

  it('rejectClaimSchema rejects empty or whitespace reason', () => {
    const empty = rejectClaimSchema.safeParse({
      claimId: CLAIM_ID,
      reason: '   ',
    })
    expect(empty.success).toBe(false)
  })

  it('rejectClaimSchema rejects reasons exceeding 1000 characters', () => {
    const tooLong = rejectClaimSchema.safeParse({
      claimId: CLAIM_ID,
      reason: 'a'.repeat(1001),
    })
    expect(tooLong.success).toBe(false)
  })
})

describe('Claim Review Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: MODERATOR_ID } },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)
  })

  describe('listPendingClaimsForReview', () => {
    it('queries person_claims with PENDING status and returns mapped records', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'person_claims') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [MOCK_RAW_ROW],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'persons') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_RAW_ROW.person],
                error: null,
              }),
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_RAW_ROW.claimant],
                error: null,
              }),
            }),
          }
        }
        return {}
      })

      const res = await listPendingClaimsForReview(MODERATOR_ID)

      expect(res.error).toBeNull()
      expect(res.data).toHaveLength(1)
      expect(res.data?.[0]?.person?.first_name).toBe('Aarav')
      expect(res.data?.[0]?.claimant?.display_name).toBe('Aarav Patel')
    })

    it('returns empty array when no claims are pending', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'person_claims') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      })

      const res = await listPendingClaimsForReview(MODERATOR_ID)
      expect(res.error).toBeNull()
      expect(res.data).toEqual([])
    })

    it('returns error when query fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((): any => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database query failed', code: 'PGRST500' },
            }),
          }),
        }),
      }))

      const res = await listPendingClaimsForReview(MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('PGRST500')
    })
  })

  describe('getClaimForReview', () => {
    it('returns validation error on invalid UUID', async () => {
      const res = await getClaimForReview('bad-uuid', MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('returns claim for review when found', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'person_claims') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: MOCK_RAW_ROW,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'persons') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: MOCK_RAW_ROW.person,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: MOCK_RAW_ROW.claimant,
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      })

      const res = await getClaimForReview(CLAIM_ID, MODERATOR_ID)
      expect(res.error).toBeNull()
      expect(res.data?.id).toBe(CLAIM_ID)
      expect(res.data?.person?.last_name).toBe('Patel')
      expect(res.data?.claimant?.email).toBe('aarav@example.com')
    })

    it('returns null data when claim row does not exist', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((): any => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }))

      const res = await getClaimForReview(CLAIM_ID, MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error).toBeNull()
    })
  })

  describe('approveClaim', () => {
    it('returns validation error on invalid UUID', async () => {
      const res = await approveClaim({ claimId: 'bad-uuid' }, MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('invokes approve_person_claim RPC with claimId', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: true,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await approveClaim({ claimId: CLAIM_ID }, MODERATOR_ID)
      expect(supabase.rpc).toHaveBeenCalledWith('approve_person_claim', {
        p_claim_id: CLAIM_ID,
      })
      expect(res.data?.success).toBe(true)
      expect(res.error).toBeNull()
    })

    it('sanitizes concurrency error when claim is already reviewed', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Claim is in state APPROVED, expected PENDING',
        },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await approveClaim({ claimId: CLAIM_ID }, MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('P0001')
      expect(res.error?.message).toContain('already been reviewed')
    })

    it('propagates unauthorized database error with user friendly message', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: {
          code: '42501',
          message: 'Unauthorized: caller is not a community moderator',
        },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await approveClaim({ claimId: CLAIM_ID }, MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('42501')
      expect(res.error?.message).toContain('Community moderator access is required')
    })
  })

  describe('rejectClaim', () => {
    it('returns validation error on empty reason', async () => {
      const res = await rejectClaim({ claimId: CLAIM_ID, reason: '   ' }, MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('invokes reject_person_claim RPC with trimmed reason', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: true,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await rejectClaim(
        {
          claimId: CLAIM_ID,
          reason: '  Duplicate record submitted.  ',
        },
        MODERATOR_ID
      )
      expect(supabase.rpc).toHaveBeenCalledWith('reject_person_claim', {
        p_claim_id: CLAIM_ID,
        p_reason: 'Duplicate record submitted.',
      })
      expect(res.data?.success).toBe(true)
      expect(res.error).toBeNull()
    })

    it('sanitizes concurrency error when claim was already reviewed', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Claim is in state REJECTED, expected PENDING',
        },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await rejectClaim(
        {
          claimId: CLAIM_ID,
          reason: 'Duplicate entry',
        },
        MODERATOR_ID
      )
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('P0001')
      expect(res.error?.message).toContain('already been reviewed')
    })
  })
})
