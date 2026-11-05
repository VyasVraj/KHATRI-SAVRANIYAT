/**
 * Unit Tests: Verification Review Service & Schemas (Phase 9 Subtask 3)
 * (src/features/verification/services/verification.review.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listVerificationRequestsForReview,
  getVerificationRequestForReview,
  approveVerificationRequest,
  rejectVerificationRequest,
  sanitizeVerificationReviewError,
} from '@/features/verification/services/verification.review.service'
import {
  approveVerificationRequestSchema,
  rejectVerificationRequestSchema,
} from '@/features/verification/schemas/verification.schemas'
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

const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const PERSON_ID = '11111111-1111-4111-8111-111111111111'
const FAMILY_ID = '22222222-2222-4222-8222-222222222222'
const REQUESTER_ID = '44444444-4444-4444-8444-444444444444'
const MODERATOR_ID = '99999999-9999-4999-8999-999999999999'

const MOCK_PERSON_REQ = {
  id: REQUEST_ID,
  entity_type: 'PERSON',
  entity_id: PERSON_ID,
  requester_id: REQUESTER_ID,
  status: 'PENDING',
  supporting_notes: 'Valid family certificate provided.',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T12:00:00Z',
  updated_at: '2026-10-06T12:00:00Z',
}

const MOCK_FAMILY_REQ = {
  id: '55555555-5555-4555-8555-555555555555',
  entity_type: 'FAMILY',
  entity_id: FAMILY_ID,
  requester_id: REQUESTER_ID,
  status: 'PENDING',
  supporting_notes: 'Community elders confirmed family records.',
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-10-06T13:00:00Z',
  updated_at: '2026-10-06T13:00:00Z',
}

const MOCK_PERSON_ROW = {
  id: PERSON_ID,
  first_name: 'Aarav',
  middle_name: 'K.',
  last_name: 'Patel',
  gender: 'MALE',
  date_of_birth: '1990-01-01',
  date_of_death: null,
  birth_place: 'Ahmedabad',
  gotra: 'Kashyap',
  nukh: 'Shah',
  kul: null,
  status: 'ACTIVE',
  verification_status: 'PENDING',
}

const MOCK_FAMILY_ROW = {
  id: FAMILY_ID,
  family_name: 'Patel Heritage',
  description: 'Ancient lineage',
  gotra: 'Kashyap',
  nukh: 'Shah',
  kul: null,
  city: 'Mumbai',
  state: 'MH',
  country: 'India',
  status: 'ACTIVE',
  verification_status: 'PENDING',
}

const MOCK_REQUESTER_PROFILE = {
  id: REQUESTER_ID,
  display_name: 'Rohan Patel',
  avatar_url: null,
  email: 'rohan@example.com',
}

describe('Verification Review Schemas', () => {
  it('approveVerificationRequestSchema accepts valid request UUID', () => {
    const res = approveVerificationRequestSchema.safeParse({ requestId: REQUEST_ID })
    expect(res.success).toBe(true)
  })

  it('approveVerificationRequestSchema rejects invalid UUID', () => {
    const res = approveVerificationRequestSchema.safeParse({ requestId: 'invalid-id' })
    expect(res.success).toBe(false)
  })

  it('rejectVerificationRequestSchema accepts valid reason', () => {
    const res = rejectVerificationRequestSchema.safeParse({
      requestId: REQUEST_ID,
      reason: 'Missing birth registration document.',
    })
    expect(res.success).toBe(true)
  })

  it('rejectVerificationRequestSchema rejects empty reason', () => {
    const res = rejectVerificationRequestSchema.safeParse({
      requestId: REQUEST_ID,
      reason: '   ',
    })
    expect(res.success).toBe(false)
  })

  it('rejectVerificationRequestSchema rejects reason longer than 1000 characters', () => {
    const res = rejectVerificationRequestSchema.safeParse({
      requestId: REQUEST_ID,
      reason: 'x'.repeat(1001),
    })
    expect(res.success).toBe(false)
  })
})

describe('Verification Review Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: MODERATOR_ID } },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)
  })

  describe('listVerificationRequestsForReview', () => {
    it('returns UNAUTHORIZED if caller is unauthenticated and no callerUserId provided', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const res = await listVerificationRequestsForReview()
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('UNAUTHORIZED')
    })

    it('queries verification_requests and joins persons, families, and profiles', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'verification_requests') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_REQ, MOCK_FAMILY_REQ],
                error: null,
              }),
            }),
          }
        }
        if (table === 'persons') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_ROW],
                error: null,
              }),
            }),
          }
        }
        if (table === 'families') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_FAMILY_ROW],
                error: null,
              }),
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_REQUESTER_PROFILE],
                error: null,
              }),
            }),
          }
        }
        return { select: vi.fn() }
      })

      const res = await listVerificationRequestsForReview(undefined, MODERATOR_ID)
      expect(res.error).toBeNull()
      expect(res.data).toHaveLength(2)

      const personReq = res.data?.find((r) => r.entity_type === 'PERSON')
      expect(personReq?.person?.first_name).toBe('Aarav')
      expect(personReq?.requester?.display_name).toBe('Rohan Patel')

      const familyReq = res.data?.find((r) => r.entity_type === 'FAMILY')
      expect(familyReq?.family?.family_name).toBe('Patel Heritage')
      expect(familyReq?.requester?.email).toBe('rohan@example.com')
    })

    it('filters verification requests by status and entityType when provided', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockQueryBuilder: any = {
        then: (resolve: (val: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      }
      mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'verification_requests') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue(mockQueryBuilder),
            }),
          }
        }
        return { select: vi.fn() }
      })

      const res = await listVerificationRequestsForReview(
        { status: 'PENDING', entityType: 'PERSON' },
        MODERATOR_ID
      )
      expect(res.error).toBeNull()
      expect(res.data).toEqual([])
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'PENDING')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('entity_type', 'PERSON')
    })

    it('performs client-side search filtering by person name or supporting notes', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'verification_requests') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_REQ, MOCK_FAMILY_REQ],
                error: null,
              }),
            }),
          }
        }
        if (table === 'persons') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_ROW],
                error: null,
              }),
            }),
          }
        }
        if (table === 'families') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_FAMILY_ROW],
                error: null,
              }),
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_REQUESTER_PROFILE],
                error: null,
              }),
            }),
          }
        }
        return { select: vi.fn() }
      })

      const res = await listVerificationRequestsForReview(
        { search: 'Aarav' },
        MODERATOR_ID
      )
      expect(res.error).toBeNull()
      expect(res.data).toHaveLength(1)
      expect(res.data?.[0].entity_type).toBe('PERSON')
    })
  })

  describe('getVerificationRequestForReview', () => {
    it('validates UUID and returns error for invalid format', async () => {
      const res = await getVerificationRequestForReview('not-a-uuid', MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('returns null if verification request does not exist', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((): any => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }))

      const res = await getVerificationRequestForReview(REQUEST_ID, MODERATOR_ID)
      expect(res.error).toBeNull()
      expect(res.data).toBeNull()
    })

    it('retrieves single verification request and enriches target person', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'verification_requests') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: MOCK_PERSON_REQ, error: null }),
              }),
            }),
          }
        }
        if (table === 'persons') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: MOCK_PERSON_ROW, error: null }),
              }),
            }),
          }
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_REQUESTER_PROFILE],
                error: null,
              }),
            }),
          }
        }
        return { select: vi.fn() }
      })

      const res = await getVerificationRequestForReview(REQUEST_ID, MODERATOR_ID)
      expect(res.error).toBeNull()
      expect(res.data?.id).toBe(REQUEST_ID)
      expect(res.data?.person?.first_name).toBe('Aarav')
      expect(res.data?.requester?.display_name).toBe('Rohan Patel')
    })
  })

  describe('approveVerificationRequest', () => {
    it('validates input and calls approve_verification_request RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: true,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await approveVerificationRequest({ requestId: REQUEST_ID }, MODERATOR_ID)
      expect(supabase.rpc).toHaveBeenCalledWith('approve_verification_request', {
        p_request_id: REQUEST_ID,
      })
      expect(res.error).toBeNull()
      expect(res.data?.success).toBe(true)
    })

    it('returns error if input validation fails', async () => {
      const res = await approveVerificationRequest({ requestId: 'invalid' }, MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('sanitizes RPC error message on already approved/reviewed state conflict', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Cannot approve verification request: request is in APPROVED state, expected PENDING.' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await approveVerificationRequest({ requestId: REQUEST_ID }, MODERATOR_ID)
      expect(res.data).toBeNull()
      expect(res.error?.message).toContain('already been reviewed')
    })
  })

  describe('rejectVerificationRequest', () => {
    it('validates input and calls reject_verification_request RPC with reason', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: true,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await rejectVerificationRequest({
        requestId: REQUEST_ID,
        reason: 'Lineage details could not be corroborated.',
      }, MODERATOR_ID)

      expect(supabase.rpc).toHaveBeenCalledWith('reject_verification_request', {
        p_request_id: REQUEST_ID,
        p_rejection_reason: 'Lineage details could not be corroborated.',
      })
      expect(res.error).toBeNull()
      expect(res.data?.success).toBe(true)
    })

    it('returns error if reason is missing', async () => {
      const res = await rejectVerificationRequest({
        requestId: REQUEST_ID,
        reason: '',
      }, MODERATOR_ID)

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('sanitizes RPC error message on target entity mismatch', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Cannot reject verification request: target person is in VERIFIED verification status, expected PENDING.' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await rejectVerificationRequest({
        requestId: REQUEST_ID,
        reason: 'Rejected due to duplicate claim.',
      }, MODERATOR_ID)

      expect(res.data).toBeNull()
      expect(res.error?.message).toContain('already been reviewed')
    })
  })

  describe('sanitizeVerificationReviewError', () => {
    it('returns custom message for state conflict', () => {
      expect(sanitizeVerificationReviewError('terminal state reached')).toContain(
        'already been reviewed or cancelled'
      )
    })

    it('returns custom message for soft-deleted / inactive', () => {
      expect(sanitizeVerificationReviewError('Cannot verify a soft-deleted person record')).toContain(
        'inactive or deleted'
      )
    })

    it('returns custom message for unauthorized', () => {
      expect(sanitizeVerificationReviewError('Unauthorized: only community moderators')).toContain(
        'only community moderators'
      )
    })

    it('returns fallback message if error is unknown', () => {
      expect(sanitizeVerificationReviewError(null)).toBe(
        'An error occurred during verification review. Please try again.'
      )
    })
  })
})
