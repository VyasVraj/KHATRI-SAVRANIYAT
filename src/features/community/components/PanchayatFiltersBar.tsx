/**
 * Panchayat Filters Bar Component (Screen 46 — ANDROID-13 Parity)
 */

import React from 'react'
import { Search, X, RotateCcw, MapPin, Crown } from 'lucide-react'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import type { PanchayatFilters, PanchayatSection } from '../types'

interface PanchayatFiltersBarProps {
  filters: PanchayatFilters
  onChange: (filters: PanchayatFilters) => void
  onReset: () => void
  totalCount: number
  availableZones: string[]
}

const SECTIONS: { key: PanchayatSection; labelKey: TranslationKey; defaultLabel: string }[] = [
  { key: 'ALL', labelKey: 'panchayat.sec_all', defaultLabel: 'All Leadership' },
  { key: 'EXECUTIVE', labelKey: 'panchayat.sec_executive', defaultLabel: 'Executive Council' },
  { key: 'ZONAL', labelKey: 'panchayat.sec_zonal', defaultLabel: 'Regional Mukhis' },
  { key: 'ADVISORY', labelKey: 'panchayat.sec_advisory', defaultLabel: 'Senior Advisory Council' },
]

export const PanchayatFiltersBar: React.FC<PanchayatFiltersBarProps> = ({
  filters,
  onChange,
  onReset,
  totalCount,
  availableZones,
}) => {
  const { t } = useLanguage()

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      search: e.target.value,
    })
  }

  const handleSectionSelect = (section: PanchayatSection) => {
    onChange({
      ...filters,
      section,
    })
  }

  const handleZoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      zone: e.target.value,
    })
  }

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim() !== '') ||
      (filters.section && filters.section !== 'ALL') ||
      (filters.zone && filters.zone !== 'ALL')
  )

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      {/* Search & Zone Dropdown */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder={t(
              'panchayat.search_placeholder',
              'Search leaders by name, designation, zone, or city...'
            )}
            className="flex min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label={t('panchayat.search_placeholder', 'Search Panchayat leaders')}
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

        {/* Zone Select */}
        <div className="relative sm:w-60">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <select
            value={filters.zone || 'ALL'}
            onChange={handleZoneChange}
            className="flex min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-8 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label={t('panchayat.filter_zone', 'Filter by Zone')}
          >
            <option value="ALL">
              {t('panchayat.all_zones', 'All Zones / Regions')}
            </option>
            {availableZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
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
            <span>{t('panchayat.reset_filters', 'Reset Filters')}</span>
          </button>
        )}
      </div>

      {/* Section Filter Chips */}
      <div>
        <div className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          <Crown className="h-3.5 w-3.5" />
          <span>{t('panchayat.filter_section', 'Council Section')}:</span>
          <span className="ml-auto text-xs font-semibold text-slate-700 dark:text-slate-300">
            {totalCount} {t('panchayat.count_officers', 'Officers')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((sec) => {
            const isSelected = (filters.section || 'ALL') === sec.key
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => handleSectionSelect(sec.key)}
                className={`flex min-h-[44px] items-center rounded-full px-4 py-2 text-xs font-medium transition ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                aria-pressed={isSelected}
              >
                {t(sec.labelKey, sec.defaultLabel)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
