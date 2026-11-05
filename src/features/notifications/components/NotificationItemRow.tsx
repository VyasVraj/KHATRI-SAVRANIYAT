/**
 * NotificationItemRow — Reusable notification item component
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 *
 * Invariants:
 * - Sanitizes navigation URLs to prevent open redirects (only valid relative paths allowed).
 * - Routes mark-read and dismiss actions via authoritative handlers.
 * - Provides explicit accessible buttons for screen readers.
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/utils/common'
import { NotificationCategoryIcon } from './NotificationCategoryIcon'
import { NOTIFICATION_CATEGORY_LABELS } from '../types'
import type { NotificationItem } from '../types'

export interface NotificationItemRowProps {
  notification: NotificationItem
  onMarkRead?: (id: string) => void
  onDismiss?: (id: string) => void
  onNavigate?: () => void
  onSelect?: (notification: NotificationItem) => void
  compact?: boolean
}

/**
 * Validates that an action URL is a safe internal relative path.
 * Disallows external URLs, protocol-relative URLs (//), and javascript: URLs.
 */
function isSafeRelativeUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const trimmed = url.trim()
  return trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')
}

export function NotificationItemRow({
  notification,
  onMarkRead,
  onDismiss,
  onNavigate,
  onSelect,
  compact = false,
}: NotificationItemRowProps) {
  const navigate = useNavigate()
  const isUnread = !notification.read_at
  const categoryLabel = NOTIFICATION_CATEGORY_LABELS[notification.category] ?? notification.category
  const timeString = formatRelativeTime(notification.created_at)
  const hasAction = isSafeRelativeUrl(notification.action_url)

  const handleRowClick = () => {
    if (onSelect) {
      onSelect(notification)
      return
    }

    if (isUnread && onMarkRead) {
      onMarkRead(notification.id)
    }

    if (hasAction && notification.action_url) {
      onNavigate?.()
      navigate(notification.action_url)
    }
  }

  const handleMarkReadClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onMarkRead) {
      onMarkRead(notification.id)
    }
  }

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDismiss) {
      onDismiss(notification.id)
    }
  }

  return (
    <div
      role="article"
      aria-label={`${isUnread ? 'Unread: ' : ''}${notification.title}`}
      data-tour-target={!compact ? 'notification-card-item' : undefined}
      tabIndex={hasAction || !!onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if ((hasAction || !!onSelect) && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleRowClick()
        }
      }}
      onClick={handleRowClick}
      className={cn(
        'group relative flex items-start gap-3 transition-colors',
        compact ? 'p-3 hover:bg-navy-50' : 'p-4 hover:bg-navy-50/80 border-b border-navy-100 last:border-b-0',
        isUnread ? 'bg-brand-50/40' : 'bg-white',
        (hasAction || !!onSelect) && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset'
      )}
    >
      {/* Category Icon */}
      <NotificationCategoryIcon
        category={notification.category}
        className={compact ? 'mt-0.5 h-7 w-7' : 'mt-1 h-9 w-9'}
        iconClassName={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}
      />

      {/* Content Area */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!compact && (
            <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy-700">
              {categoryLabel}
            </span>
          )}
          <span className="text-xs text-navy-500">{timeString}</span>
          {isUnread && (
            <span
              className="inline-block h-2 w-2 rounded-full bg-brand-600"
              title="Unread notification"
              aria-label="Unread"
            />
          )}
        </div>

        <h4
          className={cn(
            'mt-0.5 text-navy-900',
            compact ? 'text-xs font-medium' : 'text-sm font-semibold',
            isUnread ? 'font-semibold' : 'font-normal'
          )}
        >
          {notification.title}
        </h4>

        <p
          className={cn(
            'text-navy-600',
            compact ? 'text-xs line-clamp-2 mt-0.5' : 'text-sm mt-1 whitespace-pre-line'
          )}
        >
          {notification.body}
        </p>

        {hasAction && !compact && (
          <span className="mt-2 inline-flex items-center text-xs font-medium text-brand-600 hover:text-brand-800">
            View details &rarr;
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-shrink-0 items-center gap-1 opacity-80 group-hover:opacity-100">
        {isUnread && onMarkRead && (
          <button
            type="button"
            onClick={handleMarkReadClick}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-navy-400 hover:bg-navy-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            title="Mark as read"
            aria-label="Mark notification as read"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={handleDismissClick}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-navy-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            title="Dismiss notification"
            aria-label="Dismiss notification"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
