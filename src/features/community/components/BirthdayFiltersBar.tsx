/**
 * Birthday Filters Bar (Phase 10 / ANDROID-9 Parity)
 *
 * Provides responsive search and quick filter chips for birthdays:
 * - Search by member name
 * - Quick filters: All Upcoming, Today, This Month
 * - Minimum 44px touch targets on mobile
 */

import React from 'react'
import { Search, X, Cake, Calendar, Sparkles } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { BirthdayFilterType, BirthdayFilters } from '../types'

interface BirthdayFiltersBarProps {
  filters: BirthdayFilters
  onChange: (filters: BirthdayFilters) => void
  todayCount?: number
  thisMonthCount?: number
  totalCount?: number
}

export function BirthdayFiltersBar({
  filters,
  onChange,
  todayCount = 0,
  thisMonthCount = 0,
  totalCount = 0,
}: BirthdayFiltersBarProps) {
  const { t } = useLanguage()

  const activeFilter: BirthdayFilterType = filters.filter || 'ALL'

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      search: e.target.value,
    })
  }

  const handleClearSearch = () => {
    onChange({
      ...filters,
      search: '',
    })
  }

  const handleFilterClick = (filter: BirthdayFilterType) => {
    onChange({
      ...filters,
      filter,
    })
  }

  return (
    <div className="space-y-3">
      {/* Search Input Bar */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="text"
          value={filters.search || ''}
          onChange={handleSearchChange}
          placeholder={t(
            'birthdays.search_placeholder',
            'Search by member name...'
          )}
          aria-label={t(
            'birthdays.search_placeholder',
            'Search by member name...'
          )}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
        />
        {filters.search && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none min-h-[44px] min-w-[44px]"
            aria-label={t('action.clear', 'Clear search')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Birthday Filters"
      >
        {/* All Filter */}
        <button
          type="button"
          onClick={() => handleFilterClick('ALL')}
          aria-pressed={activeFilter === 'ALL'}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            activeFilter === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('birthdays.filter_all', 'All Upcoming')}</span>
          <span
            className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
              activeFilter === 'ALL'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {totalCount}
          </span>
        </button>

        {/* Today Filter */}
        <button
          type="button"
          onClick={() => handleFilterClick('TODAY')}
          aria-pressed={activeFilter === 'TODAY'}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
            activeFilter === 'TODAY'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Cake className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('birthdays.filter_today', 'Today')}</span>
          {todayCount > 0 && (
            <span
              className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                activeFilter === 'TODAY'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {todayCount}
            </span>
          )}
        </button>

        {/* This Month Filter */}
        <button
          type="button"
          onClick={() => handleFilterClick('THIS_MONTH')}
          aria-pressed={activeFilter === 'THIS_MONTH'}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            activeFilter === 'THIS_MONTH'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('birthdays.filter_this_month', 'This Month')}</span>
          <span
            className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
              activeFilter === 'THIS_MONTH'
                ? 'bg-indigo-500 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {thisMonthCount}
          </span>
        </button>
      </div>
    </div>
  )
}
