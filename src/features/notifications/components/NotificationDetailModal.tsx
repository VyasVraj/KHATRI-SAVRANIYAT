/**
 * NotificationDetailModal — Displays notification detail & metadata
 *
 * Implements Android Screen 09 parity:
 * - From / Sender attribution (e.g. KhatriSetu Community / Actor)
 * - Category badge & audience (e.g. Updates • Audience: all)
 * - Formatted date/time
 * - Full title and message body
 * - Safe action target button (e.g. "Open Calendar", "View Details", etc.)
 * - Delivery status indicator ("Your deliveries")
 * - Close button
 */

import {
  Calendar,
  ExternalLink,
  X,
  CheckCircle2,
  Clock,
  Mail,
  UserCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { NotificationCategoryIcon } from './NotificationCategoryIcon'
import { NOTIFICATION_CATEGORY_LABELS, type NotificationItem } from '../types'

export interface NotificationDetailModalProps {
  notification: NotificationItem | null
  isOpen: boolean
  onClose: () => void
  onMarkRead?: (id: string) => void
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

export function NotificationDetailModal({
  notification,
  isOpen,
  onClose,
  onMarkRead,
}: NotificationDetailModalProps) {
  const navigate = useNavigate()

  if (!isOpen || !notification) return null

  const categoryLabel = NOTIFICATION_CATEGORY_LABELS[notification.category] ?? notification.category
  const hasAction = isSafeRelativeUrl(notification.action_url)
  const isUnread = !notification.read_at

  const handleActionClick = () => {
    if (isUnread && onMarkRead) {
      onMarkRead(notification.id)
    }
    onClose()
    if (hasAction && notification.action_url) {
      navigate(notification.action_url)
    }
  }

  // Determine button text from category/action_url
  let actionButtonText = 'View Details'
  if (notification.category === 'EVENT') {
    actionButtonText = 'Open Calendar'
  } else if (notification.category === 'FAMILY') {
    actionButtonText = 'View Family'
  } else if (notification.category === 'CONNECTION') {
    actionButtonText = 'View Connections'
  } else if (notification.category === 'CLAIM' || notification.category === 'VERIFICATION') {
    actionButtonText = 'Review Request'
  }

  // Format full date time
  const createdDate = new Date(notification.created_at)
  const formattedDate = createdDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const formattedTime = createdDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  // Sender attribution matching Android Screen 09
  const senderName =
    (notification.metadata?.sender_name as string) ||
    (notification.category === 'COMMUNITY' || notification.category === 'EVENT'
      ? 'KHATRI SARVANIYAT'
      : notification.category === 'FAMILY'
      ? 'Family Census'
      : 'KHATRI SARVANIYAT')

  const audienceLabel = (notification.metadata?.audience as string) || 'all'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-navy-950/70 backdrop-blur-2xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative z-50 w-full max-w-lg overflow-hidden rounded-2xl border border-navy-200 bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <NotificationCategoryIcon category={notification.category} className="h-8 w-8" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Notification
              </span>
              <div className="flex items-center gap-1.5 text-xs text-navy-600">
                <span>{categoryLabel}</span>
                <span>•</span>
                <span>Audience: {audienceLabel}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-navy-400 hover:bg-navy-100 hover:text-navy-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Metadata Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 pb-3 text-xs text-navy-500">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-navy-400" />
              <span>
                {formattedDate} {formattedTime}
              </span>
            </div>
            {isUnread ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                Unread
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-teal-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Read
              </span>
            )}
          </div>

          {/* From Attribution */}
          <div className="rounded-lg bg-navy-50/70 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">
              From
            </span>
            <p className="text-sm font-bold text-navy-900">{senderName}</p>
          </div>

          {/* Title & Body */}
          <div className="space-y-2">
            <h3 id="notification-detail-title" className="text-lg font-bold text-navy-900">
              {notification.title}
            </h3>
            <p className="text-sm text-navy-700 whitespace-pre-line leading-relaxed">
              {notification.body}
            </p>
          </div>

          {/* Deliveries Status Section (Android Screen 09 Parity) */}
          <div className="rounded-lg border border-navy-200 bg-white p-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-navy-800">
              Your deliveries
            </h4>
            <div className="mt-2 flex items-center gap-2 text-xs text-navy-600">
              <Mail className="h-4 w-4 text-navy-400" />
              <span>
                In-app notification delivered
                {notification.read_at ? ` (viewed)` : ` (pending view)`}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-navy-500 leading-normal">
              Community notifications keep every family informed and help preserve our shared heritage.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-navy-100 bg-navy-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-navy-300 bg-white px-4 py-2 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Close
          </button>

          {hasAction && (
            <button
              type="button"
              onClick={handleActionClick}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
            >
              {notification.category === 'EVENT' ? (
                <Calendar className="h-3.5 w-3.5" />
              ) : notification.category === 'CONNECTION' ? (
                <UserCheck className="h-3.5 w-3.5" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              <span>{actionButtonText}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
