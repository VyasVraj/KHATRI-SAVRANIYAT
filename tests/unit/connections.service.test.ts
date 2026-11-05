/**
 * Unit Tests: Connections Service Layer (Phase 7 Subtask 1)
 * (src/features/connections/services/connections.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
  blockUser,
  listConnections,
  getMutualConnectionsCount,
  getConnectionWithUser,
} from '@/features/connections/services/connections.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const USER_C = '33333333-3333-4333-8333-333333333333'
const CONNECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('Connections Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendConnectionRequest', () => {
    it('rejects unauthenticated caller', async () => {
      const res = await sendConnectionRequest({ addressee_id: USER_B }, 'invalid-id')
      expect(res.error?.code).toBe('UNAUTHORIZED')
    })

    it('rejects self-connection attempts', async () => {
      const res = await sendConnectionRequest({ addressee_id: USER_A }, USER_A)
      expect(res.error?.code).toBe('VALIDATION_ERROR')
      expect(res.error?.message).toContain('themselves')
    })

    it('handles target user not found or inactive', async () => {
      const mockProfiles = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockProfiles as unknown as ReturnType<typeof supabase.from>)

      const res = await sendConnectionRequest({ addressee_id: USER_B }, USER_A)
      expect(res.error?.code).toBe('NOT_FOUND')
    })

    it('successfully sends connection request', async () => {
      const mockProfiles = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: USER_B, is_active: true }, error: null }),
      }
      const mockConnections = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'PENDING',
            created_at: '2026-10-05T00:00:00Z',
            updated_at: '2026-10-05T00:00:00Z',
          },
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') return mockProfiles as unknown as ReturnType<typeof supabase.from>
        return mockConnections as unknown as ReturnType<typeof supabase.from>
      })

      const res = await sendConnectionRequest({ addressee_id: USER_B }, USER_A)
      expect(res.error).toBeNull()
      expect(res.data?.status).toBe('PENDING')
      expect(res.data?.requester_id).toBe(USER_A)
    })

    it('handles duplicate connection request conflict (23505)', async () => {
      const mockProfiles = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: USER_B, is_active: true }, error: null }),
      }
      const mockConnections = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') return mockProfiles as unknown as ReturnType<typeof supabase.from>
        return mockConnections as unknown as ReturnType<typeof supabase.from>
      })

      const res = await sendConnectionRequest({ addressee_id: USER_B }, USER_A)
      expect(res.error?.code).toBe('CONFLICT')
    })
  })

  describe('acceptConnectionRequest', () => {
    it('rejects invalid parameters', async () => {
      const res = await acceptConnectionRequest('invalid', 'invalid')
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('forbids acceptance if caller is not the addressee', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'PENDING',
          },
          error: null,
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      // USER_A (the requester) tries to accept
      const res = await acceptConnectionRequest(CONNECTION_ID, USER_A)
      expect(res.error?.code).toBe('FORBIDDEN')
    })

    it('successfully accepts when caller is the addressee', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'PENDING',
          },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'ACCEPTED',
          },
          error: null,
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await acceptConnectionRequest(CONNECTION_ID, USER_B)
      expect(res.error).toBeNull()
      expect(res.data?.status).toBe('ACCEPTED')
    })
  })

  describe('rejectConnectionRequest', () => {
    it('successfully rejects when caller is the addressee', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'PENDING',
          },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'REJECTED',
          },
          error: null,
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await rejectConnectionRequest(CONNECTION_ID, USER_B)
      expect(res.error).toBeNull()
      expect(res.data?.status).toBe('REJECTED')
    })
  })

  describe('removeConnection', () => {
    it('forbids removal by non-participant', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'ACCEPTED',
          },
          error: null,
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await removeConnection(CONNECTION_ID, USER_C)
      expect(res.error?.code).toBe('FORBIDDEN')
    })

    it('forbids participant from deleting a BLOCKED connection', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'BLOCKED',
          },
          error: null,
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      // Both participant A and participant B are rejected
      const resA = await removeConnection(CONNECTION_ID, USER_A)
      expect(resA.error?.code).toBe('FORBIDDEN')
      expect(resA.error?.message).toContain('Blocked connections cannot be deleted')

      const resB = await removeConnection(CONNECTION_ID, USER_B)
      expect(resB.error?.code).toBe('FORBIDDEN')
      expect(resB.error?.message).toContain('Blocked connections cannot be deleted')
    })

    it('allows participant to delete ACCEPTED connection', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'ACCEPTED',
          },
          error: null,
        }),
        delete: vi.fn().mockReturnThis(),
      }
      mockConnections.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await removeConnection(CONNECTION_ID, USER_A)
      expect(res.error).toBeNull()
      expect(res.data?.success).toBe(true)
    })

    it('allows participant to cancel PENDING connection', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'PENDING',
          },
          error: null,
        }),
        delete: vi.fn().mockReturnThis(),
      }
      mockConnections.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await removeConnection(CONNECTION_ID, USER_A)
      expect(res.error).toBeNull()
      expect(res.data?.success).toBe(true)
    })

    it('allows participant to clean up REJECTED connection', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'REJECTED',
          },
          error: null,
        }),
        delete: vi.fn().mockReturnThis(),
      }
      mockConnections.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await removeConnection(CONNECTION_ID, USER_B)
      expect(res.error).toBeNull()
      expect(res.data?.success).toBe(true)
    })
  })

  describe('blockUser', () => {
    it('rejects self-blocking', async () => {
      const res = await blockUser(USER_A, USER_A)
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('updates existing connection to BLOCKED', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'ACCEPTED',
          },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'BLOCKED',
          },
          error: null,
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await blockUser(USER_B, USER_A)
      expect(res.error).toBeNull()
      expect(res.data?.status).toBe('BLOCKED')
    })

    it('returns existing row idempotently if already BLOCKED', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: CONNECTION_ID,
            requester_id: USER_A,
            addressee_id: USER_B,
            status: 'BLOCKED',
          },
          error: null,
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await blockUser(USER_B, USER_A)
      expect(res.error).toBeNull()
      expect(res.data?.status).toBe('BLOCKED')
    })
  })

  describe('listConnections', () => {
    it('returns empty array when user has no connections', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await listConnections(USER_A, 'ACCEPTED')
      expect(res.error).toBeNull()
      expect(res.data).toEqual([])
    })

    it('correctly maps profiles relative to the caller', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: CONNECTION_ID,
              requester_id: USER_A,
              addressee_id: USER_B,
              status: 'ACCEPTED',
              created_at: '2026-10-05T00:00:00Z',
              updated_at: '2026-10-05T00:00:00Z',
            },
          ],
          error: null,
        }),
      }

      const mockProfiles = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: USER_B,
              display_name: 'Bhavna Mehta',
              avatar_url: null,
            },
          ],
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'profiles') return mockProfiles as unknown as ReturnType<typeof supabase.from>
        return mockConnections as unknown as ReturnType<typeof supabase.from>
      })

      const res = await listConnections(USER_A, 'ACCEPTED')
      expect(res.error).toBeNull()
      expect(res.data?.length).toBe(1)
      expect(res.data?.[0].is_requester).toBe(true)
      expect(res.data?.[0].other_user.display_name).toBe('Bhavna Mehta')
    })
  })

  describe('getMutualConnectionsCount', () => {
    it('returns 0 for identical users', async () => {
      const res = await getMutualConnectionsCount(USER_A, USER_A)
      expect(res.error).toBeNull()
      expect(res.data?.mutual_count).toBe(0)
    })

    it('calculates intersection count accurately', async () => {
      // User A connects with User C
      const mockConnA = [
        { requester_id: USER_A, addressee_id: USER_C },
      ]
      // User B connects with User C
      const mockConnB = [
        { requester_id: USER_C, addressee_id: USER_B },
      ]

      let callCount = 0
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ data: mockConnA, error: null })
          }
          return Promise.resolve({ data: mockConnB, error: null })
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await getMutualConnectionsCount(USER_A, USER_B)
      expect(res.error).toBeNull()
      expect(res.data?.mutual_count).toBe(1) // USER_C is mutual
    })
  })

  describe('getConnectionWithUser', () => {
    it('rejects invalid UUID parameters', async () => {
      const res = await getConnectionWithUser('invalid-caller', USER_B)
      expect(res.error?.code).toBe('VALIDATION_ERROR')
    })

    it('returns null when caller and target are the same user', async () => {
      const res = await getConnectionWithUser(USER_A, USER_A)
      expect(res.error).toBeNull()
      expect(res.data).toBeNull()
    })

    it('returns existing connection record between two users', async () => {
      const mockConn = {
        id: CONNECTION_ID,
        requester_id: USER_A,
        addressee_id: USER_B,
        status: 'ACCEPTED',
        created_at: '2026-10-05T00:00:00Z',
        updated_at: '2026-10-05T00:00:00Z',
      }
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockConn, error: null }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await getConnectionWithUser(USER_A, USER_B)
      expect(res.error).toBeNull()
      expect(res.data).toEqual(mockConn)
    })

    it('returns null when no connection exists between two users', async () => {
      const mockConnections = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockConnections as unknown as ReturnType<typeof supabase.from>)

      const res = await getConnectionWithUser(USER_A, USER_B)
      expect(res.error).toBeNull()
      expect(res.data).toBeNull()
    })
  })
})

