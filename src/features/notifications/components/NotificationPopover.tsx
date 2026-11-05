/**
 * NotificationPopover — Dropdown popover for recent notifications
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 *
 * Invariants:
 * - Scoped to authenticated user.
 * - Handles outside click and Escape key dismissal.
 * - Directs to full notification center via accessible router link.
 */

import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { useNotifications } from '../hooks/useNotifications'
import { useNotificationMutations } from '../hooks/useNotificationMutations'
import { NotificationItemRow } from './NotificationItemRow'

export interface NotificationPopoverProps {
  isOpen: boolean
  onClose: () => void
  unreadCount?: number
  anchorRef?: React.RefObject<HTMLElement>
}

export function NotificationPopover({
  isOpen,
  onClose,
  unreadCount = 0,
}: NotificationPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const { data: notifications = [], isLoading, isError } = useNotifications({
    page: 1,
    pageSize: 6,
  })
  const { markRead, markAllRead, dismiss } = useNotificationMutations()

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined)
  }

  const handleMarkRead = (id: string) => {
    markRead.mutate(id)
  }

  const handleDismiss = (id: string) => {
    dismiss.mutate(id)
  }

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Recent notifications"
      className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 rounded-xl border border-navy-200 bg-white shadow-xl z-50 overflow-hidden"
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-navy-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount} new
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50"
            title="Mark all notifications as read"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Mark all read
          </button>
        )}
      </div>

      {/* Popover Content */}
      <div className="max-h-80 overflow-y-auto divide-y divide-navy-100">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-navy-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2 text-brand-600" />
            <span className="text-xs">Loading notifications...</span>
          </div>
        ) : isError ? (
          <div className="p-6 text-center text-xs text-red-600">
            Failed to load notifications. Please try again.
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-navy-500">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-100 text-navy-400 mb-2">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-medium text-navy-700">All caught up!</p>
            <p className="text-[11px] text-navy-500 mt-0.5">No notifications right now.</p>
          </div>
        ) : (
          notifications.map((item) => (
            <NotificationItemRow
              key={item.id}
              notification={item}
              compact
              onMarkRead={handleMarkRead}
              onDismiss={handleDismiss}
              onNavigate={onClose}
            />
          ))
        )}
      </div>

      {/* Popover Footer */}
      <div className="border-t border-navy-100 bg-navy-50/50 p-2.5 text-center">
        <Link
          to={ROUTES.NOTIFICATIONS}
          onClick={onClose}
          className="text-xs font-medium text-brand-700 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          View all notifications &rarr;
        </Link>
      </div>
    </div>
  )
}
