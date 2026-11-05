/**
 * useNotifications — Hook to retrieve paginated/filtered notifications
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { listMyNotifications } from '../services/notifications.service'
import type { NotificationItem, NotificationCategory } from '../types'

export interface UseNotificationsParams {
  page?: number
  pageSize?: number
  category?: NotificationCategory
  unreadOnly?: boolean
}

export function useNotifications(params: UseNotificationsParams = {}) {
  const { user, isAuthenticated } = useAuthContext()
  const userId = user?.id ?? ''
  const { page = 1, pageSize = 20, category, unreadOnly = false } = params

  const offset = Math.max(0, (page - 1) * pageSize)

  return useQuery<NotificationItem[], Error>({
    queryKey: ['notifications', 'list', userId, { page, pageSize, category, unreadOnly }],
    queryFn: async () => {
      return await listMyNotifications({
        limit: pageSize,
        offset,
        category,
        unreadOnly,
      })
    },
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 1000 * 30, // 30 seconds
  })
}
