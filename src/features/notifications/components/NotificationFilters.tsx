/**
 * NotificationFilters — Category filters and unread-only toggle
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 */

import { cn } from '@/lib/utils'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
} from '../types'

export interface NotificationFiltersProps {
  selectedCategory: NotificationCategory | 'ALL'
  onSelectCategory: (category: NotificationCategory | 'ALL') => void
  unreadOnly: boolean
  onToggleUnreadOnly: (unreadOnly: boolean) => void
}

export function NotificationFilters({
  selectedCategory,
  onSelectCategory,
  unreadOnly,
  onToggleUnreadOnly,
}: NotificationFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-navy-200 pb-4">
      {/* Category Pills */}
      <div
        role="tablist"
        aria-label="Filter notifications by category"
        className="flex flex-wrap gap-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'ALL'}
          onClick={() => onSelectCategory('ALL')}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
            selectedCategory === 'ALL'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-navy-100 text-navy-700 hover:bg-navy-200'
          )}
        >
          All
        </button>

        {NOTIFICATION_CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category
          const label = NOTIFICATION_CATEGORY_LABELS[category]

          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectCategory(category)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                isSelected
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-navy-100 text-navy-700 hover:bg-navy-200'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Unread Only Toggle */}
      <div className="flex items-center gap-2 pt-1 sm:pt-0">
        <label className="flex items-center gap-2 text-xs font-medium text-navy-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => onToggleUnreadOnly(e.target.checked)}
            className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
          />
          <span>Unread only</span>
        </label>
      </div>
    </div>
  )
}
