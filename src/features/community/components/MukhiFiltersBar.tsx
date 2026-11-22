/**
 * MukhiFiltersBar component (Phase 10 / ANDROID-11 Parity)
 *
 * Filter and search bar for the Mukhi Leadership Directory:
 * - Minimum 44px touch targets on all interactive controls.
 * - Real-time keyword search (Name, Mobile, Region / Gram / City).
 * - Dropdown filter for Region / Gram / City.
 * - Alphabetical sorting control (A-Z by default, or PDF Serial order).
 * - Clear / Reset search and filters button.
 * - Fully accessible keyboard controls and WAI-ARIA labels.
 */

import { Search, X, RotateCcw, ArrowDownAZ } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { MukhiDirectoryFilters } from '../types'

interface MukhiFiltersBarProps {
  filters: MukhiDirectoryFilters
  availableStates: string[]
  availableCities: string[]
  availableNukhs: string[]
  onFilterChange: (key: keyof MukhiDirectoryFilters, value: string) => void
  onReset: () => void
  isAdmin?: boolean
  className?: string
}

export function MukhiFiltersBar({
  filters,
  availableStates,
  availableCities,
  onFilterChange,
  onReset,
  isAdmin = false,
  className = '',
}: MukhiFiltersBarProps) {
  const { t } = useLanguage()

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim().length > 0) ||
      (filters.state && filters.state !== 'ALL') ||
      (filters.city && filters.city !== 'ALL') ||
      (filters.nukh && filters.nukh !== 'ALL') ||
      (filters.status && filters.status !== 'ACTIVE') ||
      (filters.sort && filters.sort !== 'NAME_ASC')
  )

  return (
    <div className={`space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {/* Search Input Row */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={filters.search ?? ''}
          onChange={(e) => onFilterChange('search', e.target.value)}
          placeholder={t(
            'mukhi.search_placeholder',
            'Search by Mukhi name, mobile number, or region / gram / city...'
          )}
          aria-label={t(
            'mukhi.search_placeholder',
            'Search by Mukhi name, mobile number, or region / gram / city...'
          )}
          className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {filters.search && filters.search.length > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange('search', '')}
            className="absolute right-2 flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown Filters & Sorting Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Region / Gram / City Filter */}
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="mukhi-city-filter" className="sr-only">
            Filter by Region, Gram, or City
          </label>
          <select
            id="mukhi-city-filter"
            aria-label="Filter by Region, Gram, or City"
            value={filters.city ?? 'ALL'}
            onChange={(e) => onFilterChange('city', e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer dark:[color-scheme:dark] [color-scheme:light]"
          >
            <option value="ALL" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">All Regions / Grams / Cities</option>
            {availableCities.map((ct) => (
              <option key={ct} value={ct} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                {ct}
              </option>
            ))}
          </select>
        </div>

        {/* State Filter */}
        {availableStates.length > 1 && (
          <div className="flex-1 min-w-[150px]">
            <label htmlFor="mukhi-state-filter" className="sr-only">
              {t('mukhi.filter_state', 'State')}
            </label>
            <select
              id="mukhi-state-filter"
              value={filters.state ?? 'ALL'}
              onChange={(e) => onFilterChange('state', e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer dark:[color-scheme:dark] [color-scheme:light]"
            >
              <option value="ALL" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">{t('mukhi.filter_all_states', 'All States')}</option>
              {availableStates.map((st) => (
                <option key={st} value={st} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {st}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sorting Control */}
        <div className="flex-1 min-w-[170px]">
          <label htmlFor="mukhi-sort-control" className="sr-only">
            Sort Order
          </label>
          <div className="relative flex items-center">
            <ArrowDownAZ className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <select
              id="mukhi-sort-control"
              value={filters.sort ?? 'NAME_ASC'}
              onChange={(e) => onFilterChange('sort', e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer dark:[color-scheme:dark] [color-scheme:light]"
            >
              <option value="NAME_ASC" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Name (A to Z)</option>
              <option value="NAME_DESC" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Name (Z to A)</option>
              <option value="SERIAL_ASC" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Register Serial (1 - 118)</option>
            </select>
          </div>
        </div>

        {/* Administrative Status Filter (Admins only) */}
        {isAdmin && (
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="mukhi-admin-status-filter" className="sr-only">
              Authority Status
            </label>
            <select
              id="mukhi-admin-status-filter"
              value={filters.status ?? 'ACTIVE'}
              onChange={(e) => onFilterChange('status', e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-xs transition hover:border-amber-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ACTIVE">Active Mukhis Only</option>
              <option value="INACTIVE">Deactivated / Inactive Only</option>
              <option value="ALL">All Mukhis (Active & Inactive)</option>
            </select>
          </div>
        )}

        {/* Clear Search and Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Clear search & filter"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Clear search & filter</span>
          </button>
        )}
      </div>
    </div>
  )
}
