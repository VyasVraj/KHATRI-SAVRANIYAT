/**
 * Committee Filters Bar Component (Screen 44 — ANDROID-13 Parity)
 */

import React from 'react'
import { Search, X, RotateCcw, Filter } from 'lucide-react'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import type { CommitteeCategory, CommitteeFilters } from '../types'

interface CommitteeFiltersBarProps {
  filters: CommitteeFilters
  onChange: (filters: CommitteeFilters) => void
  onReset: () => void
  totalCount: number
}

const getCategoryTranslationKey = (category: string): TranslationKey => {
  switch (category) {
    case 'GOVERNANCE':
      return 'committee.cat_governance'
    case 'CENSUS':
      return 'committee.cat_census'
    case 'WELFARE':
      return 'committee.cat_welfare'
    case 'YOUTH_SPORTS':
      return 'committee.cat_youth_sports'
    case 'WOMEN_CULTURAL':
      return 'committee.cat_women_cultural'
    case 'EDUCATION':
      return 'committee.cat_education'
    case 'HEALTH':
      return 'committee.cat_health'
    default:
      return 'committee.cat_all'
  }
}

const CATEGORIES: CommitteeCategory[] = [
  'ALL',
  'GOVERNANCE',
  'CENSUS',
  'WELFARE',
  'YOUTH_SPORTS',
  'WOMEN_CULTURAL',
  'EDUCATION',
  'HEALTH',
]

export const CommitteeFiltersBar: React.FC<CommitteeFiltersBarProps> = ({
  filters,
  onChange,
  onReset,
  totalCount,
}) => {
  const { t } = useLanguage()

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      search: e.target.value,
    })
  }

  const handleCategorySelect = (category: CommitteeCategory) => {
    onChange({
      ...filters,
      category,
    })
  }

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim() !== '') ||
      (filters.category && filters.category !== 'ALL')
  )

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      {/* Search Input Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder={t(
              'committee.search_placeholder',
              'Search committees by name, purpose, or leadership...'
            )}
            className="flex min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label={t('committee.search_placeholder', 'Search committees')}
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

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('committee.reset_filters', 'Reset Filters')}</span>
          </button>
        )}
      </div>

      {/* Category Filter Chips */}
      <div>
        <div className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          <Filter className="h-3.5 w-3.5" />
          <span>{t('committee.filter_category', 'Category')}:</span>
          <span className="ml-auto text-xs font-semibold text-slate-700 dark:text-slate-300">
            {totalCount} {t('committee.count_committees', 'Committees')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((category) => {
            const isSelected =
              (filters.category || 'ALL') === category
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
                  ? t('committee.cat_all', 'All Committees')
                  : t(getCategoryTranslationKey(category), category)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
