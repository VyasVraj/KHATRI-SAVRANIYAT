/**
 * Circular Filters Bar Component (Screen 47 — ANDROID-13 Parity)
 */

import React, { useState, useRef, useEffect } from 'react'
import { Search, X, RotateCcw, Building, Filter, ChevronDown, Check } from 'lucide-react'
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

  const [isIssuerOpen, setIsIssuerOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsIssuerOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsIssuerOpen(false)
      }
    }
    if (isIssuerOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isIssuerOpen])

  const handleSelectIssuer = (issuer: string) => {
    onChange({
      ...filters,
      issuer,
    })
    setIsIssuerOpen(false)
  }

  const selectedIssuer = filters.issuer || 'ALL'
  const selectedLabel =
    selectedIssuer === 'ALL'
      ? t('circular.all_issuers', 'All Issuing Authorities')
      : selectedIssuer

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
        <div ref={dropdownRef} className="relative sm:w-72">
          {/* Synchronized accessible select for assistive tools and testing */}
          <select
            value={filters.issuer || 'ALL'}
            onChange={handleIssuerChange}
            className="sr-only"
            aria-label={t('circular.filter_issuer', 'Issuing Authority')}
            tabIndex={-1}
          >
            <option
              value="ALL"
              className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 py-1.5"
            >
              {t('circular.all_issuers', 'All Issuing Authorities')}
            </option>
            {availableIssuers.map((issuer) => (
              <option
                key={issuer}
                value={issuer}
                className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 py-1.5"
              >
                {issuer}
              </option>
            ))}
          </select>

          {/* Custom Interactive Dropdown Trigger */}
          <button
            type="button"
            onClick={() => setIsIssuerOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={isIssuerOpen}
            aria-label={t('circular.filter_issuer', 'Issuing Authority')}
            className={`flex min-h-[44px] w-full items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
              isIssuerOpen
                ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:border-slate-400 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 mr-2">
              <Building className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {selectedLabel}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                isIssuerOpen ? 'rotate-180 text-blue-500' : ''
              }`}
            />
          </button>

          {/* Custom Dropdown Menu with High Contrast */}
          {isIssuerOpen && (
            <div
              role="listbox"
              aria-label={t('circular.filter_issuer', 'Issuing Authority')}
              className="absolute left-0 right-0 sm:right-0 sm:left-auto sm:w-80 top-full mt-1.5 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden py-1 max-h-72 overflow-y-auto"
            >
              {/* Option: All Issuing Authorities */}
              <button
                type="button"
                role="option"
                aria-selected={selectedIssuer === 'ALL'}
                onClick={() => handleSelectIssuer('ALL')}
                className={`flex w-full items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm text-left transition-colors cursor-pointer ${
                  selectedIssuer === 'ALL'
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="truncate mr-2">
                  {t('circular.all_issuers', 'All Issuing Authorities')}
                </span>
                {selectedIssuer === 'ALL' && (
                  <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                )}
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />

              {/* Dynamic Issuing Authorities */}
              {availableIssuers.map((issuer) => {
                const isSelected = selectedIssuer === issuer
                return (
                  <button
                    key={issuer}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectIssuer(issuer)}
                    className={`flex w-full items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/80 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="truncate mr-2" title={issuer}>
                      {issuer}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
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
