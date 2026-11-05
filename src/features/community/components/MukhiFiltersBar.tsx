/**
 * MukhiFiltersBar component (Phase 10 / ANDROID-11 Parity)
 *
 * Filter and search bar for the Mukhi Leadership Directory:
 * - Minimum 44px touch targets on all interactive controls.
 * - Real-time keyword search with instant clear action.
 * - Dropdown filters for State, City, and Lineage Nukh.
 * - Active filter badges with one-tap reset.
 * - Fully accessible keyboard controls and WAI-ARIA labels.
 */

import { Search, X, RotateCcw } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { MukhiDirectoryFilters } from '../types'

interface MukhiFiltersBarProps {
  filters: MukhiDirectoryFilters
  availableStates: string[]
  availableCities: string[]
  availableNukhs: string[]
  onFilterChange: (key: keyof MukhiDirectoryFilters, value: string) => void
  onReset: () => void
  className?: string
}

export function MukhiFiltersBar({
  filters,
  availableStates,
  availableCities,
  availableNukhs,
  onFilterChange,
  onReset,
  className = '',
}: MukhiFiltersBarProps) {
  const { t } = useLanguage()

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim().length > 0) ||
      (filters.state && filters.state !== 'ALL') ||
      (filters.city && filters.city !== 'ALL') ||
      (filters.nukh && filters.nukh !== 'ALL')
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
            'Search Mukhi by name, city, gotra, nukh...'
          )}
          aria-label={t(
            'mukhi.search_placeholder',
            'Search Mukhi by name, city, gotra, nukh...'
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

      {/* Dropdown Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* State Filter */}
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="mukhi-state-filter" className="sr-only">
            {t('mukhi.filter_state', 'State')}
          </label>
          <select
            id="mukhi-state-filter"
            value={filters.state ?? 'ALL'}
            onChange={(e) => onFilterChange('state', e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">{t('mukhi.filter_all_states', 'All States')}</option>
            {availableStates.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* City Filter */}
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="mukhi-city-filter" className="sr-only">
            {t('mukhi.filter_city', 'City')}
          </label>
          <select
            id="mukhi-city-filter"
            value={filters.city ?? 'ALL'}
            onChange={(e) => onFilterChange('city', e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">{t('mukhi.filter_all_cities', 'All Cities')}</option>
            {availableCities.map((ct) => (
              <option key={ct} value={ct}>
                {ct}
              </option>
            ))}
          </select>
        </div>

        {/* Nukh Filter */}
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="mukhi-nukh-filter" className="sr-only">
            {t('mukhi.filter_nukh', 'Nukh')}
          </label>
          <select
            id="mukhi-nukh-filter"
            value={filters.nukh ?? 'ALL'}
            onChange={(e) => onFilterChange('nukh', e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">{t('mukhi.filter_all_nukhs', 'All Nukhs')}</option>
            {availableNukhs.map((nk) => (
              <option key={nk} value={nk}>
                {nk}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filters Action */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label={t('mukhi.reset_filters', 'Reset filters')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('mukhi.reset_filters', 'Reset')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
