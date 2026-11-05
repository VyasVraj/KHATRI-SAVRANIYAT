/**
 * NotificationFilterTabs — Matches Android Screens 07 & 08
 *
 * Primary Tabs:
 * - All
 * - Unread
 * - Family
 * - System (Security, Claims, Verifications)
 * - Updates (Community, Events, Invitations)
 */

import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_TABS,
  type NotificationCategory,
  type NotificationTabKey,
} from '../types'
import { cn } from '@/lib/utils'

export type { NotificationTabKey }

export interface NotificationFilterTabsProps {
  activeTab: NotificationTabKey
  onSelectTab: (tab: NotificationTabKey) => void
  selectedSubCategory?: NotificationCategory | 'ALL'
  onSelectSubCategory?: (category: NotificationCategory | 'ALL') => void
  unreadCount?: number
  className?: string
}

export function NotificationFilterTabs({
  activeTab,
  onSelectTab,
  selectedSubCategory = 'ALL',
  onSelectSubCategory,
  unreadCount,
  className,
}: NotificationFilterTabsProps) {
  const currentTabDef = NOTIFICATION_TABS.find((t) => t.key === activeTab) ?? NOTIFICATION_TABS[0]
  const subCategories = currentTabDef.categories ?? []

  return (
    <div className={cn('space-y-3', className)}>
      {/* Primary Category Pill Tabs (Android Screen 07/08 Parity) */}
      <div
        role="tablist"
        aria-label="Filter notifications"
        data-tour-target="notification-filter-tabs"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar scrollbar-none sm:gap-2 touch-pan-x scroll-p-2"
      >
        {NOTIFICATION_TABS.map((tab) => {
          const isSelected = activeTab === tab.key

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 min-h-[44px]',
                isSelected
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-navy-100 text-navy-700 hover:bg-navy-200'
              )}
            >
              <span>{tab.label}</span>
              {tab.key === 'UNREAD' && typeof unreadCount === 'number' && unreadCount > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                    isSelected ? 'bg-white text-brand-700' : 'bg-brand-600 text-white'
                  )}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Subcategory Pills when a group tab with multiple categories is active */}
      {subCategories.length > 1 && onSelectSubCategory && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 sm:gap-2">
          <span className="text-[11px] font-medium text-navy-400 uppercase tracking-wider pl-1">
            Category:
          </span>
          <button
            type="button"
            onClick={() => onSelectSubCategory('ALL')}
            className={cn(
              'inline-flex min-h-[44px] items-center rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors',
              selectedSubCategory === 'ALL'
                ? 'bg-navy-800 text-white'
                : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
            )}
          >
            All {currentTabDef.label}
          </button>
          {subCategories.map((cat) => {
            const isSubSelected = selectedSubCategory === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectSubCategory(cat)}
                className={cn(
                  'inline-flex min-h-[44px] items-center rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors',
                  isSubSelected
                    ? 'bg-navy-800 text-white'
                    : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                )}
              >
                {NOTIFICATION_CATEGORY_LABELS[cat] ?? cat}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
