/**
 * Circular Filters Bar Component (Screen 47 — ANDROID-13 Parity)
 */

import React from 'react'
import { Search, X, RotateCcw, Building, Filter } from 'lucide-react'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import type { CircularCategory, CircularFilters } from '../types'

interface CircularFiltersBarProps {
  filters: CircularFilters
  onChange: (filters: CircularFilters) => void
  onReset: () => void
  totalCount: number
  availableIssuers: string[]
}

const getCategoryTranslationKey = (category: string): TranslationKey => {
  switch (category) {
    case 'CENSUS':
      return 'circular.cat_census'
    case 'GOVERNANCE':
      return 'circular.cat_governance'
    case 'WELFARE':
      return 'circular.cat_welfare'
    case 'URGENT':
      return 'circular.cat_urgent'
    case 'GENERAL':
      return 'circular.cat_general'
    default:
      return 'circular.cat_all'
  }
}

const CATEGORIES: CircularCategory[] = [
  'ALL',
  'CENSUS',
  'GOVERNANCE',
  'WELFARE',
  'URGENT',
  'GENERAL',
]

export const CircularFiltersBar: React.FC<CircularFiltersBarProps> = ({
  filters,
  onChange,
  onReset,
  totalCount,
  availableIssuers,
}) => {
  const { t } = useLanguage()

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      search: e.target.value,
    })
  }

  const handleCategorySelect = (category: CircularCategory) => {
    onChange({
      ...filters,
      category,
    })
  }

  const handleIssuerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      issuer: e.target.value,
    })
  }

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim() !== '') ||
      (filters.category && filters.category !== 'ALL') ||
      (filters.issuer && filters.issuer !== 'ALL')
  )

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      {/* Search Input & Issuer Select */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder={t(
              'circular.search_placeholder',
              'Search circulars by ref no., title, or keyword...'
            )}
            className="flex min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent pl-10 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label={t('circular.search_placeholder', 'Search circulars')}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-400 hover:text-slate-600"
              aria-label={t('action.clear', 'Clear search')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Issuing Authority Dropdown */}
        <div className="relative sm:w-64">
          <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <select
            value={filters.issuer || 'ALL'}
            onChange={handleIssuerChange}
            className="flex min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent pl-9 pr-8 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
            aria-label={t('circular.filter_issuer', 'Filter by Issuing Authority')}
          >
            <option value="ALL">
              {t('circular.all_issuers', 'All Issuing Authorities')}
            </option>
            {availableIssuers.map((issuer) => (
              <option key={issuer} value={issuer}>
                {issuer}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('circular.reset_filters', 'Reset Filters')}</span>
          </button>
        )}
      </div>

      {/* Category Filter Chips */}
      <div>
        <div className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          <Filter className="h-3.5 w-3.5" />
          <span>{t('circular.filter_category', 'Category')}:</span>
          <span className="ml-auto text-xs font-semibold text-slate-700 dark:text-slate-300">
            {totalCount} {t('circular.count_circulars', 'Circulars')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const isSelected = (filters.category || 'ALL') === category
            return (
              <button
                key={category}
                type="button"
                onClick={() => handleCategorySelect(category)}
                className={`flex min-h-[44px] items-center rounded-full px-4 py-2 text-xs font-medium transition ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                aria-pressed={isSelected}
              >
                {category === 'ALL'
                  ? t('circular.cat_all', 'All Circulars')
                  : t(getCategoryTranslationKey(category), category)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
