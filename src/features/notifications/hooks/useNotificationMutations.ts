/**
 * useNotificationMutations — Mutation hooks for notification actions
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 *
 * Invariants:
 * - Scoped strictly to authenticated user.
 * - Routes strictly through SECURITY DEFINER RPCs.
 * - Invalidates all notifications queries on mutation success.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from '../services/notifications.service'
import type { NotificationCategory } from '../types'

export function useNotificationMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()
  const userId = user?.id ?? ''

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      return await markNotificationRead(notificationId)
    },
    onSuccess: invalidateNotifications,
  })

  const markAllRead = useMutation({
    mutationFn: async (category?: NotificationCategory) => {
      return await markAllNotificationsRead(category)
    },
    onSuccess: invalidateNotifications,
  })

  const dismiss = useMutation({
    mutationFn: async (notificationId: string) => {
      return await dismissNotification(notificationId)
    },
    onSuccess: invalidateNotifications,
  })

  return {
    markRead,
    markAllRead,
    dismiss,
    userId,
  }
}
