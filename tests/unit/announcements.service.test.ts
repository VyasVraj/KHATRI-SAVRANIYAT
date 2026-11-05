import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizeAnnouncementError,
  listAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  archiveAnnouncement,
  deleteAnnouncement,
} from '@/features/community/services/announcements.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

const VALID_UUID_1 = '123e4567-e89b-12d3-a456-426614174000'
const VALID_UUID_2 = '223e4567-e89b-12d3-a456-426614174001'

describe('announcements.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sanitizeAnnouncementError', () => {
    it('returns default message when err is nullish', () => {
      expect(sanitizeAnnouncementError(null)).toBe(
        'An unexpected error occurred. Please try again.'
      )
    })

    it('sanitizes global announcement moderator authorization error', () => {
      expect(
        sanitizeAnnouncementError({
          message: 'Only community moderators can post global community announcements.',
        })
      ).toBe('Only community moderators can post or modify global community announcements.')
    })

    it('sanitizes group announcement admin authorization error', () => {
      expect(
        sanitizeAnnouncementError({
          message: 'Only group administrators or community moderators can post announcements for this group.',
        })
      ).toBe(
        'Only group administrators or community moderators can post or modify announcements for this group.'
      )
    })

    it('sanitizes general unauthorized 42501 error', () => {
      expect(
        sanitizeAnnouncementError({
          message: 'Error 42501: permission denied',
        })
      ).toBe('You do not have permission to perform this action.')
    })

    it('sanitizes not found P0002 error', () => {
      expect(
        sanitizeAnnouncementError({
          message: 'Target announcement does not exist',
        })
      ).toBe('The requested announcement or target group could not be found.')
    })

    it('preserves validation length errors', () => {
      expect(
        sanitizeAnnouncementError({
          message: 'Title must not exceed 200 characters.',
        })
      ).toBe('Title must not exceed 200 characters.')
    })
  })

  describe('listAnnouncements', () => {
    it('fetches announcements with default ordering and filters out deleted items', async () => {
      const mockAnnouncements = [
        {
          id: VALID_UUID_1,
          title: 'Diwali Sneh Milan 2026',
          content: 'Details about the celebration',
          announcement_type: 'CELEBRATION',
          status: 'PUBLISHED',
          group_id: null,
          author_id: 'usr-1',
          is_pinned: true,
          published_at: '2026-10-07T12:00:00Z',
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
          deleted_at: null,
          author: {
            id: 'usr-1',
            display_name: 'President Patel',
            email: 'prez@example.com',
            avatar_url: null,
          },
          group: null,
        },
      ]

      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        is: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
      }
      chain.select.mockReturnValue(chain)
      chain.is.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      chain.order.mockReturnValue(chain)
      ;(chain as unknown as Promise<unknown>).then = vi
        .fn()
        .mockImplementation((resolve) =>
          Promise.resolve({ data: mockAnnouncements, error: null }).then(resolve)
        )

      vi.mocked(supabase.from).mockReturnValue(chain as never)

      const result = await listAnnouncements()

      expect(supabase.from).toHaveBeenCalledWith('announcements')
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].title).toBe('Diwali Sneh Milan 2026')
      expect(result.data?.[0].author_name).toBe('President Patel')
    })

    it('filters by announcement_type and search string in memory', async () => {
      const mockAnnouncements = [
        {
          id: VALID_UUID_1,
          title: 'Blood Donation Camp',
          content: 'Please donate blood this Sunday',
          announcement_type: 'URGENT',
          status: 'PUBLISHED',
          group_id: null,
          author_id: 'usr-1',
          is_pinned: false,
          published_at: '2026-10-07T12:00:00Z',
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
          deleted_at: null,
          author: null,
          group: null,
        },
        {
          id: VALID_UUID_2,
          title: 'Youth Cricket Tournament',
          content: 'Sports committee notice',
          announcement_type: 'EVENT',
          status: 'PUBLISHED',
          group_id: null,
          author_id: 'usr-2',
          is_pinned: false,
          published_at: '2026-10-07T11:00:00Z',
          created_at: '2026-10-07T11:00:00Z',
          updated_at: '2026-10-07T11:00:00Z',
          deleted_at: null,
          author: null,
          group: null,
        },
      ]

      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        is: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
      }
      chain.select.mockReturnValue(chain)
      chain.is.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      chain.order.mockReturnValue(chain)
      ;(chain as unknown as Promise<unknown>).then = vi
        .fn()
        .mockImplementation((resolve) =>
          Promise.resolve({ data: mockAnnouncements, error: null }).then(resolve)
        )

      vi.mocked(supabase.from).mockReturnValue(chain as never)

      const result = await listAnnouncements({
        search: 'cricket',
      })

      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].title).toBe('Youth Cricket Tournament')
    })
  })

  describe('getAnnouncementById', () => {
    it('returns single announcement with formatted author and group data', async () => {
      const mockRecord = {
        id: VALID_UUID_1,
        title: 'Community AGM 2026',
        content: 'Agenda details...',
        announcement_type: 'GENERAL',
        status: 'PUBLISHED',
        group_id: VALID_UUID_2,
        author_id: 'usr-1',
        is_pinned: true,
        published_at: '2026-10-07T10:00:00Z',
        created_at: '2026-10-07T10:00:00Z',
        updated_at: '2026-10-07T10:00:00Z',
        deleted_at: null,
        author: {
          id: 'usr-1',
          display_name: 'Secretary',
          email: 'sec@example.com',
          avatar_url: null,
        },
        group: {
          id: VALID_UUID_2,
          name: 'Executive Committee',
          slug: 'executive-committee',
        },
      }

      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        eq: vi.fn(),
        is: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRecord, error: null }),
      }
      chain.select.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      chain.is.mockReturnValue(chain)

      vi.mocked(supabase.from).mockReturnValue(chain as never)

      const result = await getAnnouncementById(VALID_UUID_1)

      expect(result.error).toBeNull()
      expect(result.data?.group_name).toBe('Executive Committee')
      expect(result.data?.author_name).toBe('Secretary')
    })
  })

  describe('createAnnouncement', () => {
    it('invokes create_community_announcement RPC with mapped parameters', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: VALID_UUID_1,
        error: null,
      } as never)

      const result = await createAnnouncement({
        title: 'New Event Announcement',
        content: 'Detailed description of the upcoming program.',
        announcement_type: 'EVENT',
        group_id: VALID_UUID_2,
        is_pinned: true,
        status: 'PUBLISHED',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('create_community_announcement', {
        p_title: 'New Event Announcement',
        p_content: 'Detailed description of the upcoming program.',
        p_announcement_type: 'EVENT',
        p_group_id: VALID_UUID_2,
        p_is_pinned: true,
        p_status: 'PUBLISHED',
      })
      expect(result.data).toBe(VALID_UUID_1)
      expect(result.error).toBeNull()
    })

    it('defaults status to PUBLISHED and is_pinned to false when omitted', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: VALID_UUID_1,
        error: null,
      } as never)

      const result = await createAnnouncement({
        title: 'Notice With Defaults',
        content: 'Content goes here.',
        announcement_type: 'GENERAL',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('create_community_announcement', {
        p_title: 'Notice With Defaults',
        p_content: 'Content goes here.',
        p_announcement_type: 'GENERAL',
        p_group_id: null,
        p_is_pinned: false,
        p_status: 'PUBLISHED',
      })
      expect(result.data).toBe(VALID_UUID_1)
    })

    it('supports creating announcement in DRAFT status explicitly', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: VALID_UUID_1,
        error: null,
      } as never)

      const result = await createAnnouncement({
        title: 'Draft Notice',
        content: 'Draft content for later review.',
        announcement_type: 'URGENT',
        status: 'DRAFT',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('create_community_announcement', {
        p_title: 'Draft Notice',
        p_content: 'Draft content for later review.',
        p_announcement_type: 'URGENT',
        p_group_id: null,
        p_is_pinned: false,
        p_status: 'DRAFT',
      })
      expect(result.data).toBe(VALID_UUID_1)
    })

    it('returns sanitized error if RPC fails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Only group administrators or community moderators can post announcements for this group.',
          code: '42501',
        },
      } as never)

      const result = await createAnnouncement({
        title: 'Unauthorized Post',
        content: 'Content...',
        announcement_type: 'GENERAL',
        group_id: VALID_UUID_2,
      })

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'Only group administrators or community moderators can post or modify announcements for this group.'
      )
    })
  })

  describe('updateAnnouncement', () => {
    it('invokes update_community_announcement RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await updateAnnouncement({
        id: VALID_UUID_1,
        title: 'Updated Title',
        content: 'Updated Content',
        announcement_type: 'URGENT',
        status: 'PUBLISHED',
        is_pinned: true,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('update_community_announcement', {
        p_announcement_id: VALID_UUID_1,
        p_title: 'Updated Title',
        p_content: 'Updated Content',
        p_announcement_type: 'URGENT',
        p_status: 'PUBLISHED',
        p_is_pinned: true,
      })
      expect(result.data).toBe(true)
    })

    it('handles publishing a DRAFT announcement (DRAFT -> PUBLISHED)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await updateAnnouncement({
        id: VALID_UUID_1,
        title: 'Now Ready',
        content: 'Final content.',
        announcement_type: 'EVENT',
        status: 'PUBLISHED',
        is_pinned: false,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('update_community_announcement', {
        p_announcement_id: VALID_UUID_1,
        p_title: 'Now Ready',
        p_content: 'Final content.',
        p_announcement_type: 'EVENT',
        p_status: 'PUBLISHED',
        p_is_pinned: false,
      })
      expect(result.data).toBe(true)
    })

    it('handles archiving an active announcement (PUBLISHED -> ARCHIVED)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await updateAnnouncement({
        id: VALID_UUID_1,
        title: 'Past Event',
        content: 'Concluded program.',
        announcement_type: 'EVENT',
        status: 'ARCHIVED',
        is_pinned: false,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('update_community_announcement', {
        p_announcement_id: VALID_UUID_1,
        p_title: 'Past Event',
        p_content: 'Concluded program.',
        p_announcement_type: 'EVENT',
        p_status: 'ARCHIVED',
        p_is_pinned: false,
      })
      expect(result.data).toBe(true)
    })

    it('handles reopening an archived announcement (ARCHIVED -> PUBLISHED)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await updateAnnouncement({
        id: VALID_UUID_1,
        title: 'Reactivated Event Notice',
        content: 'Event rescheduled and active again.',
        announcement_type: 'EVENT',
        status: 'PUBLISHED',
        is_pinned: true,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('update_community_announcement', {
        p_announcement_id: VALID_UUID_1,
        p_title: 'Reactivated Event Notice',
        p_content: 'Event rescheduled and active again.',
        p_announcement_type: 'EVENT',
        p_status: 'PUBLISHED',
        p_is_pinned: true,
      })
      expect(result.data).toBe(true)
    })
  })

  describe('archiveAnnouncement', () => {
    it('invokes archive_community_announcement RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await archiveAnnouncement(VALID_UUID_1)

      expect(supabase.rpc).toHaveBeenCalledWith(
        'archive_community_announcement',
        { p_announcement_id: VALID_UUID_1 }
      )
      expect(result.data).toBe(true)
    })
  })

  describe('deleteAnnouncement', () => {
    it('invokes delete_community_announcement RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await deleteAnnouncement(VALID_UUID_1)

      expect(supabase.rpc).toHaveBeenCalledWith(
        'delete_community_announcement',
        { p_announcement_id: VALID_UUID_1 }
      )
      expect(result.data).toBe(true)
    })
  })
})
