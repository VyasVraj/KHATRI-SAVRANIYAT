/**
 * Notifications Service Layer
 *
 * Phase 12 — Subtask 1: Foundation Data Access & Authoritative RPC Wrappers
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. PERSON != USER:
 *    Notifications are scoped strictly to auth.users (recipient_id / user_id).
 * 2. ZERO DIRECT CLIENT INSERT / DELETE:
 *    Mutations route strictly through audited SECURITY DEFINER RPCs.
 * 3. ERROR SANITIZATION:
 *    Database errors and schema details are sanitized into user-safe error messages.
 */

import { supabase } from '@/lib/supabase'
import type {
  NotificationItem,
  NotificationPreferences,
  NotificationCategory,
  UpdatePreferencesInput,
} from '../types'

/**
 * Standard sanitized error representation
 */
export class NotificationServiceError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'NotificationServiceError'
  }
}

function sanitizeNotificationError(error: unknown, fallbackMessage: string): NotificationServiceError {
  if (error instanceof NotificationServiceError) {
    return error
  }

  const err = error as { code?: string; message?: string }
  if (err?.code === 'P0001') {
    return new NotificationServiceError('Unauthorized. Please sign in to manage notifications.', 'P0001', error)
  }
  if (err?.code === '22023') {
    return new NotificationServiceError('Invalid argument provided.', '22023', error)
  }
  if (err?.code === '42501') {
    return new NotificationServiceError('Permission denied. Access restricted.', '42501', error)
  }

  return new NotificationServiceError(fallbackMessage, err?.code, error)
}

// Helper accessors for untyped client access before remote code generation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notificationsTable = () => (supabase.from as any)('notifications')
const rpcCall = (name: string, params?: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params !== undefined ? (supabase.rpc as any)(name, params) : (supabase.rpc as any)(name)

/**
 * Retrieves the total count of unread active notifications for the current authenticated user.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const { data, error } = await rpcCall('get_unread_notification_count')
    if (error) throw error
    return typeof data === 'number' ? data : 0
  } catch (error) {
    throw sanitizeNotificationError(error, 'Failed to retrieve unread notification count.')
  }
}

/**
 * Marks a specific notification as read. Idempotent.
 */
export async function markNotificationRead(notificationId: string): Promise<boolean> {
  if (!notificationId) {
    throw new NotificationServiceError('Notification ID is required.', 'INVALID_ARGUMENT')
  }

  try {
    const { data, error } = await rpcCall('mark_notification_read', {
      p_notification_id: notificationId,
    })
    if (error) throw error
    return Boolean(data)
  } catch (error) {
    throw sanitizeNotificationError(error, 'Failed to mark notification as read.')
  }
}

/**
 * Marks all unread notifications as read, optionally filtered by category.
 */
export async function markAllNotificationsRead(category?: NotificationCategory): Promise<number> {
  try {
    const { data, error } = await rpcCall('mark_all_notifications_read', {
      p_category: category ?? null,
    })
    if (error) throw error
    return typeof data === 'number' ? data : 0
  } catch (error) {
    throw sanitizeNotificationError(error, 'Failed to mark all notifications as read.')
  }
}

/**
 * Soft-deletes / dismisses a notification.
 */
export async function dismissNotification(notificationId: string): Promise<boolean> {
  if (!notificationId) {
    throw new NotificationServiceError('Notification ID is required.', 'INVALID_ARGUMENT')
  }

  try {
    const { data, error } = await rpcCall('dismiss_notification', {
      p_notification_id: notificationId,
    })
    if (error) throw error
    return Boolean(data)
  } catch (error) {
    throw sanitizeNotificationError(error, 'Failed to dismiss notification.')
  }
}

/**
 * Retrieves notification preferences for current user (lazy-initializing defaults if missing).
 */
export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const { data, error } = await rpcCall('get_my_notification_preferences')
    if (error) throw error
    return data as unknown as NotificationPreferences
  } catch (error) {
    throw sanitizeNotificationError(error, 'Failed to load notification preferences.')
  }
}

/**
 * Updates notification preferences for current user.
 */
export async function updateMyNotificationPreferences(
  input: UpdatePreferencesInput
): Promise<NotificationPreferences> {
  try {
    const { data, error } = await rpcCall('update_my_notification_preferences', {
      p_in_app_enabled: input.in_app_enabled ?? true,
      p_email_enabled: input.email_enabled ?? true,
      p_email_connections: input.email_connections ?? true,
      p_email_invitations: input.email_invitations ?? true,
      p_email_claims: input.email_claims ?? true,
      p_email_verifications: input.email_verifications ?? true,
      p_email_announcements: input.email_announcements ?? false,
      p_email_events: input.email_events ?? true,
      p_email_family_media: input.email_family_media ?? false,
    })
    if (error) throw error
    return data as unknown as NotificationPreferences
  } catch (error) {
    throw sanitizeNotificationError(error, 'Failed to update notification preferences.')
  }
}

export interface ListNotificationsOptions {
  limit?: number
  offset?: number
  unreadOnly?: boolean
  category?: NotificationCategory
}

/**
 * Lists notifications for the authenticated caller respecting RLS.
 */
export async function listMyNotifications(
  options: ListNotificationsOptions = {}
): Promise<NotificationItem[]> {
  const { limit = 20, offset = 0, unreadOnly = false, category } = options

  try {
    let query = notificationsTable()
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.is('read_at', null)
    }

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query
    if (error) throw error

    return (data ?? []) as unknown as NotificationItem[]
  } catch (error) {
    throw sanitizeNotificationError(error, 'Failed to fetch notifications.')
  }
}
