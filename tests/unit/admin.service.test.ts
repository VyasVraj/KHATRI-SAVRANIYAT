import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getPlatformMetrics,
  listAdminUsers,
  updateUserRole,
  setUserStatus,
  getAuditLogs,
  listAdminDuplicates,
  resolveAdminDuplicate,
} from '@/features/admin/services/admin.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

describe('admin.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getPlatformMetrics', () => {
    it('successfully calls admin_get_platform_metrics and maps payload', async () => {
      const mockMetricsPayload = {
        total_users: 15,
        active_users: 12,
        total_persons: 120,
        total_families: 35,
        pending_claims: 3,
        pending_verifications: 2,
        open_duplicates: 1,
        generated_at: '2026-10-16T12:00:00Z',
      }

      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockMetricsPayload,
        error: null,
      })

      const result = await getPlatformMetrics()

      expect(supabase.rpc).toHaveBeenCalledWith('admin_get_platform_metrics')
      expect(result).toEqual({
        total_users: 15,
        active_users: 12,
        total_persons: 120,
        total_families: 35,
        pending_claims: 3,
        pending_verifications: 2,
        open_duplicates: 1,
        generated_at: '2026-10-16T12:00:00Z',
      })
    })

    it('gracefully handles missing or null numeric fields with zero defaults', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          total_users: null,
          active_users: undefined,
          generated_at: null,
        },
        error: null,
      })

      const result = await getPlatformMetrics()

      expect(result.total_users).toBe(0)
      expect(result.active_users).toBe(0)
      expect(result.total_persons).toBe(0)
      expect(result.total_families).toBe(0)
      expect(result.pending_claims).toBe(0)
      expect(result.pending_verifications).toBe(0)
      expect(result.open_duplicates).toBe(0)
      expect(typeof result.generated_at).toBe('string')
    })

    it('throws an error when RPC fails with an error message', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' },
      })

      await expect(getPlatformMetrics()).rejects.toThrow(
        'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
      )
    })

    it('throws an error when received data payload is invalid', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: 'not-an-object',
        error: null,
      })

      await expect(getPlatformMetrics()).rejects.toThrow(
        'Invalid platform metrics payload received from server.'
      )
    })
  })

  describe('listAdminUsers', () => {
    it('queries profiles with default bounded pagination and ordering', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'alice@example.com',
          display_name: 'Alice',
          role: 'ADMIN',
          is_active: true,
          email_verified: true,
          created_at: '2026-10-16T10:00:00Z',
          updated_at: '2026-10-16T10:00:00Z',
        },
      ]

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockUsers,
          count: 1,
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockReturnValue(mockQuery as never)

      const result = await listAdminUsers()

      expect(supabase.from).toHaveBeenCalledWith('profiles')
      expect(mockQuery.select).toHaveBeenCalledWith(
        'id, email, display_name, avatar_url, role, is_active, email_verified, created_at, updated_at',
        { count: 'exact' }
      )
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockQuery.range).toHaveBeenCalledWith(0, 14)
      expect(result.users).toEqual(mockUsers)
      expect(result.totalCount).toBe(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(15)
      expect(result.totalPages).toBe(1)
    })

    it('applies search, role, and active status filters', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockReturnValue(mockQuery as never)

      await listAdminUsers({
        search: 'bob',
        role: 'SUPER_ADMIN',
        status: 'active',
        page: 2,
        pageSize: 10,
      })

      expect(mockQuery.or).toHaveBeenCalledWith('display_name.ilike.%bob%,email.ilike.%bob%')
      expect(mockQuery.eq).toHaveBeenCalledWith('role', 'SUPER_ADMIN')
      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true)
      expect(mockQuery.range).toHaveBeenCalledWith(10, 19)
    })

    it('throws error when database query fails', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          count: null,
          error: { message: 'Database connection failed' },
        }),
      }

      vi.mocked(supabase.from).mockReturnValue(mockQuery as never)

      await expect(listAdminUsers()).rejects.toThrow('Database connection failed')
    })
  })

  describe('updateUserRole', () => {
    it('calls admin_update_user_role RPC with correct parameters', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: true,
        error: null,
      })

      const success = await updateUserRole('user-123', 'ADMIN')

      expect(supabase.rpc).toHaveBeenCalledWith('admin_update_user_role', {
        p_user_id: 'user-123',
        p_new_role: 'ADMIN',
      })
      expect(success).toBe(true)
    })

    it('throws error when RPC returns an error', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'FORBIDDEN: Only SUPER_ADMIN can grant the SUPER_ADMIN role' },
      })

      await expect(updateUserRole('user-123', 'SUPER_ADMIN')).rejects.toThrow(
        'FORBIDDEN: Only SUPER_ADMIN can grant the SUPER_ADMIN role'
      )
    })
  })

  describe('setUserStatus', () => {
    it('calls admin_set_user_status RPC with correct parameters', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: true,
        error: null,
      })

      const success = await setUserStatus('user-123', false, 'Terms of service violation')

      expect(supabase.rpc).toHaveBeenCalledWith('admin_set_user_status', {
        p_user_id: 'user-123',
        p_is_active: false,
        p_reason: 'Terms of service violation',
      })
      expect(success).toBe(true)
    })

    it('handles null reason when activating', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: true,
        error: null,
      })

      await setUserStatus('user-123', true)

      expect(supabase.rpc).toHaveBeenCalledWith('admin_set_user_status', {
        p_user_id: 'user-123',
        p_is_active: true,
        p_reason: null,
      })
    })

    it('throws error when RPC returns an error', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'CONFLICT: Cannot deactivate the platform sole active SUPER_ADMIN' },
      })

      await expect(setUserStatus('user-123', false, 'Reason')).rejects.toThrow(
        'CONFLICT: Cannot deactivate the platform sole active SUPER_ADMIN'
      )
    })
  })

  describe('getAuditLogs', () => {
    it('calls admin_get_audit_logs RPC with correct parameters and calculates totalCount', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'USER_ROLE_CHANGED',
          actor_id: 'actor-1',
          actor_name: 'Admin Alice',
          actor_email: 'alice@example.com',
          target_type: 'profile',
          target_id: 'user-2',
          old_data: { role: 'MEMBER' },
          new_data: { role: 'ADMIN' },
          metadata: { caller_role: 'SUPER_ADMIN' },
          created_at: '2026-10-16T11:00:00Z',
          total_count: 42,
        },
      ]

      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockLogs,
        error: null,
      })

      const result = await getAuditLogs({
        action: 'USER_ROLE_CHANGED',
        page: 2,
        pageSize: 10,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('admin_get_audit_logs', {
        p_page: 2,
        p_page_size: 10,
        p_action: 'USER_ROLE_CHANGED',
        p_actor_id: null,
        p_target_type: null,
        p_target_id: null,
        p_start_date: null,
        p_end_date: null,
      })
      expect(result.logs).toEqual(mockLogs)
      expect(result.totalCount).toBe(42)
      expect(result.page).toBe(2)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(5)
    })

    it('returns empty list and zero totalCount when data is empty', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        error: null,
      })

      const result = await getAuditLogs()

      expect(result.logs).toEqual([])
      expect(result.totalCount).toBe(0)
      expect(result.totalPages).toBe(1)
    })

    it('throws error when RPC fails', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' },
      })

      await expect(getAuditLogs()).rejects.toThrow(
        'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
      )
    })
  })

  describe('listAdminDuplicates', () => {
    it('fetches duplicate flags with bounded pagination and enriches person previews', async () => {
      const mockRawFlags = [
        {
          id: 'flag-1',
          entity_type: 'PERSON',
          record_a_id: 'person-a',
          record_b_id: 'person-b',
          confidence: 'STRONG',
          status: 'OPEN',
          match_signals: ['Identical full name', 'Matching birth date'],
          notes: 'Auto-flagged',
          resolution_notes: null,
          flagged_by: 'user-1',
          reviewed_by: null,
          reviewed_at: null,
          created_at: '2026-10-16T12:00:00Z',
          updated_at: '2026-10-16T12:00:00Z',
        },
      ]

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockRawFlags,
          error: null,
          count: 1,
        }),
      }

      const mockPersonsQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'person-a',
              first_name: 'Dev',
              middle_name: null,
              last_name: 'Shah',
              gender: 'MALE',
              date_of_birth: '1985-05-15',
              birth_place: 'Mumbai',
              gotra: 'Kashyap',
              nukh: 'Shah',
              kul: 'Vani',
              status: 'ALIVE',
              date_of_death: null,
              verification_status: 'VERIFIED',
            },
            {
              id: 'person-b',
              first_name: 'Dev',
              middle_name: 'K',
              last_name: 'Shah',
              gender: 'MALE',
              date_of_birth: '1985-05-15',
              birth_place: 'Bombay',
              gotra: 'Kashyap',
              nukh: 'Shah',
              kul: 'Vani',
              status: 'ALIVE',
              date_of_death: null,
              verification_status: 'UNVERIFIED',
            },
          ],
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'duplicate_flags') return mockQueryBuilder as unknown as ReturnType<typeof supabase.from>
        if (table === 'persons' || table === 'community_persons') return mockPersonsQuery as unknown as ReturnType<typeof supabase.from>
        return {} as unknown as ReturnType<typeof supabase.from>
      })

      const result = await listAdminDuplicates({
        page: 1,
        pageSize: 10,
        status: 'OPEN',
        entityType: 'PERSON',
        confidence: 'STRONG',
      })

      expect(supabase.from).toHaveBeenCalledWith('duplicate_flags')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'OPEN')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('entity_type', 'PERSON')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('confidence', 'STRONG')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].record_a_preview?.label).toBe('Dev Shah')
      expect(result.items[0].record_b_preview?.label).toBe('Dev K Shah')
      expect(result.totalCount).toBe(1)
    })

    it('enriches family previews for FAMILY entity type flags', async () => {
      const mockRawFlags = [
        {
          id: 'flag-2',
          entity_type: 'FAMILY',
          record_a_id: 'fam-a',
          record_b_id: 'fam-b',
          confidence: 'POSSIBLE',
          status: 'OPEN',
          match_signals: ['Matching family name and location'],
          notes: null,
          resolution_notes: null,
          flagged_by: null,
          reviewed_by: null,
          reviewed_at: null,
          created_at: '2026-10-16T14:00:00Z',
          updated_at: '2026-10-16T14:00:00Z',
        },
      ]

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockRawFlags,
          error: null,
          count: 1,
        }),
      }

      const mockFamiliesQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'fam-a',
              family_name: 'Shah Parivar',
              gotra: 'Kashyap',
              nukh: null,
              kul: null,
              city: 'Mumbai',
              state: 'Maharashtra',
              country: 'India',
              description: 'Shah lineage',
              verification_status: 'VERIFIED',
            },
            {
              id: 'fam-b',
              family_name: 'Shah Family',
              gotra: 'Kashyap',
              nukh: null,
              kul: null,
              city: 'Mumbai',
              state: 'Maharashtra',
              country: 'India',
              description: null,
              verification_status: 'UNVERIFIED',
            },
          ],
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'duplicate_flags') return mockQueryBuilder as unknown as ReturnType<typeof supabase.from>
        if (table === 'families') return mockFamiliesQuery as unknown as ReturnType<typeof supabase.from>
        return {} as unknown as ReturnType<typeof supabase.from>
      })

      const result = await listAdminDuplicates({ entityType: 'FAMILY' })

      expect(result.items[0].record_a_preview?.family_name).toBe('Shah Parivar')
      expect(result.items[0].record_b_preview?.family_name).toBe('Shah Family')
    })

    it('returns empty list when no flags match query', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        }),
      }

      vi.mocked(supabase.from).mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof supabase.from>)

      const result = await listAdminDuplicates()

      expect(result.items).toEqual([])
      expect(result.totalCount).toBe(0)
      expect(result.totalPages).toBe(1)
    })

    it('throws error when database query fails', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
          count: null,
        }),
      }

      vi.mocked(supabase.from).mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof supabase.from>)

      await expect(listAdminDuplicates()).rejects.toThrow('Database connection failed')
    })
  })

  describe('resolveAdminDuplicate', () => {
    it('successfully calls resolve_duplicate_flag RPC with CONFIRMED_DUPLICATE', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: true,
        error: null,
      })

      const result = await resolveAdminDuplicate({
        flagId: 'flag-123',
        resolution: 'CONFIRMED_DUPLICATE',
        resolutionNotes: 'Verified duplicate census person',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('resolve_duplicate_flag', {
        p_flag_id: 'flag-123',
        p_resolution: 'CONFIRMED_DUPLICATE',
        p_resolution_notes: 'Verified duplicate census person',
      })
      expect(result).toBe(true)
    })

    it('successfully calls resolve_duplicate_flag RPC with NOT_DUPLICATE', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: true,
        error: null,
      })

      const result = await resolveAdminDuplicate({
        flagId: 'flag-456',
        resolution: 'NOT_DUPLICATE',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('resolve_duplicate_flag', {
        p_flag_id: 'flag-456',
        p_resolution: 'NOT_DUPLICATE',
        p_resolution_notes: null,
      })
      expect(result).toBe(true)
    })

    it('detects already resolved concurrent update and marks error as stale', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: {
          message: 'Duplicate flag flag-123 has already been resolved with status "CONFIRMED_DUPLICATE" and cannot be modified.',
        },
      })

      await expect(
        resolveAdminDuplicate({
          flagId: 'flag-123',
          resolution: 'NOT_DUPLICATE',
        })
      ).rejects.toThrow('This duplicate flag has already been resolved by another administrator.')
    })

    it('throws error when RPC returns unexpected error', async () => {
      vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'Network timeout' },
      })

      await expect(
        resolveAdminDuplicate({
          flagId: 'flag-999',
          resolution: 'CONFIRMED_DUPLICATE',
        })
      ).rejects.toThrow('Network timeout')
    })
  })
})
