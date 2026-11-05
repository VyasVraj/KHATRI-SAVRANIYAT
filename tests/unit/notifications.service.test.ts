import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  listMyNotifications,
} from '@/features/notifications/services/notifications.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

const MOCK_UUID_1 = '11111111-1111-1111-1111-111111111111'
const MOCK_UUID_2 = '22222222-2222-2222-2222-222222222222'

describe('notifications.service (Phase 12 Subtask 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUnreadNotificationCount', () => {
    it('returns the count returned by RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 5,
        error: null,
      } as never)

      const count = await getUnreadNotificationCount()
      expect(count).toBe(5)
      expect(supabase.rpc).toHaveBeenCalledWith('get_unread_notification_count')
    })

    it('returns 0 if RPC returns non-number data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as never)

      const count = await getUnreadNotificationCount()
      expect(count).toBe(0)
    })

    it('sanitizes unauthorized P0001 error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'UNAUTHORIZED' },
      } as never)

      await expect(getUnreadNotificationCount()).rejects.toThrow(
        'Unauthorized. Please sign in to manage notifications.'
      )
    })
  })

  describe('markNotificationRead', () => {
    it('throws if notificationId is missing', async () => {
      await expect(markNotificationRead('')).rejects.toThrow('Notification ID is required.')
    })

    it('calls RPC mark_notification_read with correct argument and returns boolean', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const res = await markNotificationRead(MOCK_UUID_1)
      expect(res).toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('mark_notification_read', {
        p_notification_id: MOCK_UUID_1,
      })
    })

    it('handles permission denied error 42501', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      } as never)

      await expect(markNotificationRead(MOCK_UUID_1)).rejects.toThrow(
        'Permission denied. Access restricted.'
      )
    })
  })

  describe('markAllNotificationsRead', () => {
    it('calls RPC without category when omitted', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 12,
        error: null,
      } as never)

      const updatedCount = await markAllNotificationsRead()
      expect(updatedCount).toBe(12)
      expect(supabase.rpc).toHaveBeenCalledWith('mark_all_notifications_read', {
        p_category: null,
      })
    })

    it('calls RPC with category when specified', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 3,
        error: null,
      } as never)

      const updatedCount = await markAllNotificationsRead('CONNECTION')
      expect(updatedCount).toBe(3)
      expect(supabase.rpc).toHaveBeenCalledWith('mark_all_notifications_read', {
        p_category: 'CONNECTION',
      })
    })
  })

  describe('dismissNotification', () => {
    it('throws if notificationId is missing', async () => {
      await expect(dismissNotification('')).rejects.toThrow('Notification ID is required.')
    })

    it('calls RPC dismiss_notification and returns boolean', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const res = await dismissNotification(MOCK_UUID_2)
      expect(res).toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('dismiss_notification', {
        p_notification_id: MOCK_UUID_2,
      })
    })
  })

  describe('getMyNotificationPreferences', () => {
    it('calls get_my_notification_preferences and returns preferences', async () => {
      const mockPrefs = {
        user_id: MOCK_UUID_1,
        in_app_enabled: true,
        email_enabled: true,
        email_connections: true,
        email_invitations: true,
        email_claims: true,
        email_verifications: true,
        email_announcements: false,
        email_events: true,
        email_family_media: false,
        created_at: '2026-10-16T10:00:00Z',
        updated_at: '2026-10-16T10:00:00Z',
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockPrefs,
        error: null,
      } as never)

      const prefs = await getMyNotificationPreferences()
      expect(prefs).toEqual(mockPrefs)
      expect(supabase.rpc).toHaveBeenCalledWith('get_my_notification_preferences')
    })
  })

  describe('updateMyNotificationPreferences', () => {
    it('calls update_my_notification_preferences with sanitized boolean arguments', async () => {
      const updatedPrefs = {
        user_id: MOCK_UUID_1,
        in_app_enabled: true,
        email_enabled: false,
        email_connections: true,
        email_invitations: true,
        email_claims: true,
        email_verifications: true,
        email_announcements: true,
        email_events: true,
        email_family_media: false,
        created_at: '2026-10-16T10:00:00Z',
        updated_at: '2026-10-16T10:05:00Z',
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: updatedPrefs,
        error: null,
      } as never)

      const result = await updateMyNotificationPreferences({
        email_enabled: false,
        email_announcements: true,
      })

      expect(result).toEqual(updatedPrefs)
      expect(supabase.rpc).toHaveBeenCalledWith('update_my_notification_preferences', {
        p_in_app_enabled: true,
        p_email_enabled: false,
        p_email_connections: true,
        p_email_invitations: true,
        p_email_claims: true,
        p_email_verifications: true,
        p_email_announcements: true,
        p_email_events: true,
        p_email_family_media: false,
      })
    })
  })

  describe('listMyNotifications', () => {
    it('executes select query with range and ordering', async () => {
      const mockItems = [
        {
          id: MOCK_UUID_1,
          recipient_id: MOCK_UUID_1,
          category: 'CONNECTION',
          title: 'New Connection Request',
          body: 'Someone wants to connect with you.',
          read_at: null,
          created_at: '2026-10-16T10:00:00Z',
        },
      ]

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValueOnce({ data: mockItems, error: null }),
        is: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }

      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as never)

      const items = await listMyNotifications({ limit: 10, offset: 0 })
      expect(items).toEqual(mockItems)
      expect(supabase.from).toHaveBeenCalledWith('notifications')
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockQuery.range).toHaveBeenCalledWith(0, 9)
    })

    it('applies unread and category filters when provided', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValueOnce({ data: [], error: null }),
      }

      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as never)

      await listMyNotifications({ unreadOnly: true, category: 'CLAIM' })
      expect(mockQuery.is).toHaveBeenCalledWith('read_at', null)
      expect(mockQuery.eq).toHaveBeenCalledWith('category', 'CLAIM')
    })
  })
})
