import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizeGroupError,
  listGroups,
  getGroupBySlug,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupMembers,
} from '@/features/community/services/groups.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

describe('groups.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sanitizeGroupError', () => {
    it('returns default message when err is nullish', () => {
      expect(sanitizeGroupError(null)).toBe(
        'An unexpected error occurred. Please try again.'
      )
    })

    it('sanitizes duplicate slug error', () => {
      expect(
        sanitizeGroupError({ message: 'A group with this slug already exists.' })
      ).toBe('A group with this URL slug already exists. Please choose a different slug.')
    })

    it('sanitizes already a member error', () => {
      expect(
        sanitizeGroupError({ message: 'User is already a member of this group.' })
      ).toBe('You are already a member of this group.')
    })

    it('sanitizes private group join error', () => {
      expect(
        sanitizeGroupError({
          message: 'Cannot directly join a private group. An invitation or admin approval is required.',
        })
      ).toBe('This is a private group. An invitation or administrator approval is required to join.')
    })

    it('sanitizes sole admin leave error', () => {
      expect(
        sanitizeGroupError({
          message: 'Sole group administrator cannot leave the group. Transfer admin role first.',
        })
      ).toBe(
        'As the sole administrator, you cannot leave the group. Please designate another administrator first.'
      )
    })

    it('sanitizes unauthenticated error', () => {
      expect(
        sanitizeGroupError({
          message: 'Unauthorized: Authentication required to create a community group.',
        })
      ).toBe('You do not have permission to perform this action. Please sign in.')
    })
  })

  describe('createGroup', () => {
    it('rejects if callerUserId is missing', async () => {
      const res = await createGroup({
        name: 'New Group',
        slug: 'new-group',
        group_type: 'OTHER',
        is_private: false,
      })
      expect(res.error?.message).toBe('You must be signed in to create a community group.')
      expect(res.data).toBeNull()
    })

    it('rejects invalid schema inputs', async () => {
      const res = await createGroup(
        {
          name: '',
          slug: 'bad slug!',
          group_type: 'OTHER',
          is_private: false,
        },
        'user-123'
      )
      expect(res.error).toBeDefined()
      expect(res.data).toBeNull()
    })

    it('calls create_community_group RPC and returns groupId on success', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'group-uuid-1',
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      })

      const res = await createGroup(
        {
          name: 'Anjar Mitra Mandal',
          slug: 'anjar-mitra-mandal',
          group_type: 'VILLAGE_ASSOCIATION',
          location: 'Anjar, Gujarat',
          description: 'Native place association for Anjar community.',
          is_private: false,
        },
        'user-123'
      )

      expect(supabase.rpc).toHaveBeenCalledWith('create_community_group', {
        p_name: 'Anjar Mitra Mandal',
        p_slug: 'anjar-mitra-mandal',
        p_description: 'Native place association for Anjar community.',
        p_group_type: 'VILLAGE_ASSOCIATION',
        p_location: 'Anjar, Gujarat',
        p_is_private: false,
      })
      expect(res.data).toBe('group-uuid-1')
      expect(res.error).toBeNull()
    })

    it('handles RPC errors gracefully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'A group with this slug already exists.' } as unknown as null,
        count: null,
        status: 400,
        statusText: 'Bad Request',
      })

      const res = await createGroup(
        {
          name: 'Anjar Mitra Mandal',
          slug: 'anjar-mitra-mandal',
          group_type: 'VILLAGE_ASSOCIATION',
          is_private: false,
        },
        'user-123'
      )

      expect(res.error?.message).toBe(
        'A group with this URL slug already exists. Please choose a different slug.'
      )
      expect(res.data).toBeNull()
    })
  })

  describe('joinGroup', () => {
    it('rejects if callerUserId is missing', async () => {
      const res = await joinGroup('group-123')
      expect(res.error?.message).toBe('You must be signed in to join a group.')
      expect(res.data).toBeNull()
    })

    it('calls join_community_group RPC and returns memberId', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'member-uuid-1',
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      })

      const res = await joinGroup('group-123', 'user-456')
      expect(supabase.rpc).toHaveBeenCalledWith('join_community_group', {
        p_group_id: 'group-123',
      })
      expect(res.data).toBe('member-uuid-1')
      expect(res.error).toBeNull()
    })
  })

  describe('leaveGroup', () => {
    it('rejects if callerUserId is missing', async () => {
      const res = await leaveGroup('group-123')
      expect(res.error?.message).toBe('You must be signed in to leave a group.')
      expect(res.data).toBeNull()
    })

    it('calls leave_community_group RPC and returns true', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      })

      const res = await leaveGroup('group-123', 'user-456')
      expect(supabase.rpc).toHaveBeenCalledWith('leave_community_group', {
        p_group_id: 'group-123',
      })
      expect(res.data).toBe(true)
      expect(res.error).toBeNull()
    })
  })

  describe('listGroups', () => {
    it('fetches groups and enriches them with membership counts and caller role', async () => {
      const mockGroups = [
        {
          id: 'g-1',
          name: 'Group 1',
          slug: 'group-1',
          group_type: 'CULTURAL',
          is_verified: true,
          is_private: false,
          created_by: 'creator-1',
          created_at: '2026-10-07T00:00:00Z',
          updated_at: '2026-10-07T00:00:00Z',
          deleted_at: null,
        },
      ]

      const mockMembers = [
        { group_id: 'g-1', user_id: 'user-caller', role: 'ADMIN' },
        { group_id: 'g-1', user_id: 'user-other', role: 'MEMBER' },
      ]

      const groupsQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (val: unknown) => void) =>
          resolve({ data: mockGroups, error: null })
        ),
      }

      const membersQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValueOnce({
          data: mockMembers,
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'groups') return groupsQueryBuilder as unknown as ReturnType<typeof supabase.from>
        if (table === 'group_members') return membersQueryBuilder as unknown as ReturnType<typeof supabase.from>
        return {} as unknown as ReturnType<typeof supabase.from>
      })

      const res = await listGroups(undefined, 'user-caller')
      expect(res.error).toBeNull()
      expect(res.data).toHaveLength(1)
      expect(res.data![0].member_count).toBe(2)
      expect(res.data![0].is_caller_member).toBe(true)
      expect(res.data![0].caller_role).toBe('ADMIN')
    })
  })

  describe('getGroupBySlug', () => {
    it('returns group with membership details', async () => {
      const mockGroup = {
        id: 'g-2',
        name: 'Group 2',
        slug: 'group-2',
        group_type: 'YOUTH',
        is_verified: false,
        is_private: false,
        created_by: 'creator-2',
        created_at: '2026-10-07T00:00:00Z',
        updated_at: '2026-10-07T00:00:00Z',
        deleted_at: null,
      }

      const groupsQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: mockGroup,
          error: null,
        }),
      }

      const membersQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValueOnce({
          data: [{ group_id: 'g-2', user_id: 'user-caller', role: 'MEMBER' }],
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'groups') return groupsQueryBuilder as unknown as ReturnType<typeof supabase.from>
        if (table === 'group_members') return membersQueryBuilder as unknown as ReturnType<typeof supabase.from>
        return {} as unknown as ReturnType<typeof supabase.from>
      })

      const res = await getGroupBySlug('group-2', 'user-caller')
      expect(res.error).toBeNull()
      expect(res.data?.name).toBe('Group 2')
      expect(res.data?.member_count).toBe(1)
      expect(res.data?.is_caller_member).toBe(true)
      expect(res.data?.caller_role).toBe('MEMBER')
    })
  })

  describe('getGroupMembers', () => {
    it('retrieves members mapped with profiles', async () => {
      const mockRows = [
        {
          id: 'gm-1',
          group_id: 'g-1',
          user_id: 'u-1',
          role: 'ADMIN',
          joined_at: '2026-10-07T00:00:00Z',
          profiles: {
            id: 'u-1',
            display_name: 'Harish Khatri',
            email: 'harish@example.com',
            avatar_url: null,
          },
        },
      ]

      const membersQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValueOnce({
          data: mockRows,
          error: null,
        }),
      }

      vi.mocked(supabase.from).mockReturnValueOnce(
        membersQueryBuilder as unknown as ReturnType<typeof supabase.from>
      )

      const res = await getGroupMembers('g-1')
      expect(res.error).toBeNull()
      expect(res.data).toHaveLength(1)
      expect(res.data![0].profile?.display_name).toBe('Harish Khatri')
      expect(res.data![0].role).toBe('ADMIN')
    })
  })
})
