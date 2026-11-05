/**
 * NotificationBell — Header notification bell with unread badge & popover trigger
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 *
 * Invariants:
 * - Scoped strictly to authenticated caller.
 * - Displays 1-99 or 99+ badge when unread count > 0, completely hidden when 0.
 * - Activates Supabase Realtime channel to synchronize in-app notifications live.
 */

import { useState, useRef } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUnreadCount } from '../hooks/useUnreadCount'
import { useNotificationRealtime } from '../hooks/useNotificationRealtime'
import { NotificationPopover } from './NotificationPopover'

export interface NotificationBellProps {
  className?: string
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const bellContainerRef = useRef<HTMLDivElement>(null)

  // Retrieve unread count and hook into live Realtime channel
  const { data: unreadCount = 0 } = useUnreadCount()
  useNotificationRealtime()

  const formattedCount = unreadCount > 99 ? '99+' : unreadCount

  const handleToggle = () => {
    setIsOpen((prev) => !prev)
  }

  const handleClose = () => {
    setIsOpen(false)
  }

  return (
    <div className={cn('relative inline-flex items-center', className)} ref={bellContainerRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-navy-200 transition-colors hover:bg-navy-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />

        {/* Unread Badge (1-99 or 99+, hidden when 0) */}
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-navy-900"
            aria-hidden="true"
          >
            {formattedCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      <NotificationPopover
        isOpen={isOpen}
        onClose={handleClose}
        unreadCount={unreadCount}
      />
    </div>
  )
}
