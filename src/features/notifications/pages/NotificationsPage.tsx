/**
 * NotificationsPage — Main In-App Notification Center
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 *
 * Invariants:
 * - Scoped strictly to authenticated caller.
 * - Supports category filtering and unread-only toggle.
 * - Supports pagination without manual SQL manipulation.
 * - Mutations route through SECURITY DEFINER RPCs.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { useNotifications } from '../hooks/useNotifications'
import { useUnreadCount } from '../hooks/useUnreadCount'
import { useNotificationMutations } from '../hooks/useNotificationMutations'
import { useNotificationRealtime } from '../hooks/useNotificationRealtime'
import { NotificationFilterTabs } from '../components/NotificationFilterTabs'
import { NotificationItemRow } from '../components/NotificationItemRow'
import { NotificationDetailModal } from '../components/NotificationDetailModal'
import {
  NOTIFICATION_TABS,
  type NotificationCategory,
  type NotificationItem,
  type NotificationTabKey,
} from '../types'

const PAGE_SIZE = 15

export function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<NotificationTabKey>('ALL')
  const [selectedSubCategory, setSelectedSubCategory] = useState<NotificationCategory | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)

  // Live real-time synchronisation
  useNotificationRealtime()

  // Query unread count for header summary
  const { data: unreadCount = 0 } = useUnreadCount()

  // Compute active category and unreadOnly from activeTab and selectedSubCategory
  const currentTabDef = NOTIFICATION_TABS.find((t) => t.key === activeTab) ?? NOTIFICATION_TABS[0]
  const unreadOnly = currentTabDef.unreadOnly ?? false
  const activeCategory =
    selectedSubCategory !== 'ALL'
      ? selectedSubCategory
      : currentTabDef.categories && currentTabDef.categories.length === 1
      ? currentTabDef.categories[0]
      : undefined

  // Query notifications list with active filters and pagination
  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useNotifications({
    page,
    pageSize: PAGE_SIZE,
    category: activeCategory,
    unreadOnly,
  })

  // Client-side category match when multi-category tab (e.g. SYSTEM or UPDATES) has selectedSubCategory === 'ALL'
  const filteredNotifications =
    currentTabDef.categories && selectedSubCategory === 'ALL' && currentTabDef.categories.length > 1
      ? notifications.filter((item) => currentTabDef.categories?.includes(item.category))
      : notifications

  const { markRead, markAllRead, dismiss } = useNotificationMutations()

  const handleSelectTab = (tab: NotificationTabKey) => {
    setActiveTab(tab)
    setSelectedSubCategory('ALL')
    setPage(1)
  }

  const handleSelectSubCategory = (category: NotificationCategory | 'ALL') => {
    setSelectedSubCategory(category)
    setPage(1)
  }

  const handleMarkAllRead = () => {
    markAllRead.mutate(activeCategory)
  }

  const handleMarkRead = (id: string) => {
    markRead.mutate(id)
  }

  const handleDismiss = (id: string) => {
    dismiss.mutate(id)
  }

  const handleSelectNotification = (item: NotificationItem) => {
    setSelectedNotification(item)
    if (!item.read_at) {
      markRead.mutate(item.id)
    }
  }

  const hasNextPage = filteredNotifications.length === PAGE_SIZE
  const hasPreviousPage = page > 1

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-navy-900">
              Notification Center
            </h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount} unread
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-navy-600">
            Stay updated on connections, family stories, community events, and verification reviews.
          </p>
        </div>

        {/* Global Header Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-300 bg-white px-3 py-2 text-xs font-medium text-navy-700 shadow-sm transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 min-h-[44px]"
            >
              <CheckCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Mark all as read
            </button>
          )}

          <Link
            to={ROUTES.NOTIFICATION_PREFERENCES}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-300 bg-white px-3 py-2 text-xs font-medium text-navy-700 shadow-sm transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 min-h-[44px]"
            title="Notification preferences"
          >
            <Settings className="h-4 w-4 text-navy-500" aria-hidden="true" />
            Preferences
          </Link>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center justify-center rounded-lg border border-navy-300 bg-white p-2 text-navy-600 shadow-sm hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 min-h-[44px] min-w-[44px]"
            title="Refresh notifications"
            aria-label="Refresh notifications"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Category Filters Bar (Android Screen 07 & 08 Parity) */}
      <div className="mb-6">
        <NotificationFilterTabs
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          selectedSubCategory={selectedSubCategory}
          onSelectSubCategory={handleSelectSubCategory}
          unreadCount={unreadCount}
        />
      </div>

      {/* Main Notifications Container */}
      <div className="rounded-xl border border-navy-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 text-navy-500">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600 mb-3" />
            <p className="text-sm font-medium">Loading notifications...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <h3 className="text-base font-semibold text-navy-900">Failed to load notifications</h3>
            <p className="mt-1 text-sm text-navy-600 max-w-sm">
              We encountered an issue fetching your notifications. Please check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Try Again
            </button>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-100 text-navy-400 mb-3">
              <Bell className="h-7 w-7" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-navy-900">No notifications found</h3>
            <p className="mt-1 text-sm text-navy-600 max-w-sm">
              {unreadOnly
                ? 'You have no unread notifications in this category.'
                : 'You have no notifications in this category yet. When new activity happens, it will appear here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-navy-100">
            {filteredNotifications.map((item) => (
              <NotificationItemRow
                key={item.id}
                notification={item}
                onMarkRead={handleMarkRead}
                onDismiss={handleDismiss}
                onSelect={handleSelectNotification}
              />
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        {!isLoading && !isError && (hasPreviousPage || hasNextPage) && (
          <div className="flex items-center justify-between border-t border-navy-100 bg-navy-50/50 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!hasPreviousPage}
              className="inline-flex items-center gap-1 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 shadow-sm hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            <span className="text-xs text-navy-600">
              Page {page}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              className="inline-flex items-center gap-1 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 shadow-sm hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Notification Detail Modal (Android Screen 09 Parity) */}
      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={selectedNotification !== null}
        onClose={() => setSelectedNotification(null)}
        onMarkRead={handleMarkRead}
      />
    </div>
  )
}
