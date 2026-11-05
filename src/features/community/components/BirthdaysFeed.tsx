/**
 * Birthdays Feed Component (Phase 10 / ANDROID-9 Parity)
 *
 * Primary community birthday view:
 * - Search & Filter bar
 * - Grouped sections (Today, This Week, Later This Month, Upcoming)
 * - Privacy Shield Banner (confidential year & age notice)
 * - Loading Skeletons, Error state with retry, and Empty state
 * - Full responsive layout with >= 44px touch targets
 */

import { useState } from 'react'
import { Cake, Shield, AlertCircle, RefreshCw } from 'lucide-react'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useBirthdays } from '../hooks/useBirthdays'
import { BirthdayFiltersBar } from './BirthdayFiltersBar'
import { BirthdayCard } from './BirthdayCard'
import type { BirthdayFilters } from '../types'

export function BirthdaysFeed() {
  const { t } = useLanguage()
  const { isAuthenticated } = useAuthContext()
  const [filters, setFilters] = useState<BirthdayFilters>({ filter: 'ALL' })

  const {
    data: birthdays,
    groups,
    isLoading,
    isError,
    error,
    refetch,
    todayCount,
    thisMonthCount,
    totalCount,
    sendWish,
    hasWished,
  } = useBirthdays(filters)

  return (
    <div className="space-y-6">
      {/* Privacy Notice Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <Shield
          className="h-4 w-4 text-slate-500 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p>
          {t(
            'birthdays.privacy_notice',
            'Birthdays are shown in accordance with community privacy preferences. Year and age are kept confidential.'
          )}
        </p>
      </div>

      {/* Filters & Search */}
      <BirthdayFiltersBar
        filters={filters}
        onChange={setFilters}
        todayCount={todayCount}
        thisMonthCount={thisMonthCount}
        totalCount={totalCount}
      />

      {/* Loading Skeletons */}
      {isLoading && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          role="status"
          aria-label={t('birthdays.loading', 'Loading birthdays...')}
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-48 rounded-xl border border-slate-200 bg-white p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div className="h-6 w-24 rounded bg-slate-200" />
                  <div className="h-5 w-16 rounded bg-slate-200" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-200" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-20 rounded bg-slate-200" />
                  </div>
                </div>
              </div>
              <div className="h-10 w-full rounded bg-slate-200 mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-rose-500" aria-hidden="true" />
          <h3 className="mt-2 text-sm font-semibold text-rose-900">
            {t('birthdays.error_title', 'Unable to load birthdays')}
          </h3>
          <p className="mt-1 text-xs text-rose-600 max-w-sm">
            {error instanceof Error
              ? error.message
              : 'Please check your connection and try again.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('birthdays.retry', 'Try Again')}</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && birthdays.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Cake className="h-7 w-7" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">
            {t('birthdays.empty_title', 'No upcoming birthdays')}
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md">
            {filters.search || filters.filter !== 'ALL'
              ? t(
                  'birthdays.empty_filter',
                  'Try selecting a different filter to see upcoming birthdays.'
                )
              : t(
                  'birthdays.empty_desc',
                  'There are no upcoming birthdays matching the selected filter.'
                )}
          </p>
          {(filters.search || filters.filter !== 'ALL') && (
            <button
              type="button"
              onClick={() => setFilters({ filter: 'ALL', search: '' })}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              {t('directory.clear_all', 'Clear all filters')}
            </button>
          )}
        </div>
      )}

      {/* Grouped Celebrations Feed */}
      {!isLoading && !isError && birthdays.length > 0 && (
        <div className="space-y-8">
          {groups.map((group) => (
            <section
              key={group.group_key}
              aria-labelledby={`heading-${group.group_key}`}
              className="space-y-4"
            >
              {/* Group Heading */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  {group.group_key === 'today' && (
                    <Cake className="h-5 w-5 text-amber-500" aria-hidden="true" />
                  )}
                  <h2
                    id={`heading-${group.group_key}`}
                    className="text-base font-bold text-slate-900"
                  >
                    {t(group.title_key as TranslationKey, group.title_key)}
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {group.items.length}
                </span>
              </div>

              {/* Grid of Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map((item) => (
                  <BirthdayCard
                    key={item.id}
                    item={item}
                    hasWished={hasWished(item.person_id)}
                    onSendWish={sendWish}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
