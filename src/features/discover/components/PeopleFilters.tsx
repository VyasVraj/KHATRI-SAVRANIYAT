/**
 * PeopleFilters component
 *
 * Multi-criteria filter panel for the People Directory.
 *
 * PRIVACY & SCHEMA INVARIANTS:
 * - Only verified persons columns are exposed:
 *   gotra, nukh, kul, birth_place, status, verification_status.
 * - Family/residential location fields (city, state, country) and Mukhi filters
 *   are strictly excluded.
 */

import { Filter, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import type { PersonDiscoveryFilters, DiscoveryFilterOptions } from '../types'
import { useTranslation } from '@/features/i18n'

interface PeopleFiltersProps {
  filters: PersonDiscoveryFilters
  filterOptions?: DiscoveryFilterOptions
  onFilterChange: (filters: PersonDiscoveryFilters) => void
  onReset: () => void
  isOpen: boolean
  onToggle: () => void
  className?: string
}

export function PeopleFilters({
  filters,
  filterOptions,
  onFilterChange,
  onReset,
  isOpen,
  onToggle,
  className = '',
}: PeopleFiltersProps) {
  const { t } = useTranslation()
  const activeCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'search' && Boolean(v && v.trim().length > 0)
  ).length

  function handleChange(key: keyof PersonDiscoveryFilters, value: string) {
    const trimmed = value.trim()
    const next = { ...filters }
    if (trimmed.length === 0) {
      delete next[key]
    } else {
      // TypeScript type safe assignment for enums
      if (key === 'status') {
        next.status = trimmed as PersonDiscoveryFilters['status']
      } else if (key === 'verification_status') {
        next.verification_status = trimmed as PersonDiscoveryFilters['verification_status']
      } else {
        next[key] = trimmed
      }
    }
    onFilterChange(next)
  }

  return (
    <div className={`rounded-lg border border-navy-200 bg-white shadow-sm ${className}`}>
      {/* Header bar / Toggle */}
      <div className="flex items-center justify-between p-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-semibold text-navy-900 hover:text-brand-600 focus:outline-none"
          aria-expanded={isOpen}
          aria-controls="people-filters-panel"
        >
          <Filter className="h-4 w-4 text-brand-600" />
          <span>{t('directory.filters')}</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
              {activeCount}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-navy-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-navy-400" />
          )}
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-xs font-medium text-navy-500 hover:text-navy-800 focus:outline-none"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t('directory.reset_filters')}</span>
          </button>
        )}
      </div>

      {/* Collapsible content */}
      {isOpen && (
        <div
          id="people-filters-panel"
          className="border-t border-navy-100 p-4 pt-3"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Gotra Filter */}
            <div>
              <label
                htmlFor="filter-gotra"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Gotra
              </label>
              {filterOptions?.gotras && filterOptions.gotras.length > 0 ? (
                <select
                  id="filter-gotra"
                  value={filters.gotra ?? ''}
                  onChange={(e) => handleChange('gotra', e.target.value)}
                  className="w-full rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">All Gotras</option>
                  {filterOptions.gotras.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="filter-gotra"
                  type="text"
                  placeholder="e.g. Kashyap"
                  value={filters.gotra ?? ''}
                  onChange={(e) => handleChange('gotra', e.target.value)}
                  className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>

            {/* Nukh Filter */}
            <div>
              <label
                htmlFor="filter-nukh"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Nukh
              </label>
              {filterOptions?.nukhs && filterOptions.nukhs.length > 0 ? (
                <select
                  id="filter-nukh"
                  value={filters.nukh ?? ''}
                  onChange={(e) => handleChange('nukh', e.target.value)}
                  className="w-full rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">All Nukhs</option>
                  {filterOptions.nukhs.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="filter-nukh"
                  type="text"
                  placeholder="Filter by Nukh"
                  value={filters.nukh ?? ''}
                  onChange={(e) => handleChange('nukh', e.target.value)}
                  className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>


            {/* Birth Place Filter */}
            <div>
              <label
                htmlFor="filter-birth-place"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Birth Place
              </label>
              <input
                id="filter-birth-place"
                type="text"
                placeholder="e.g. Mumbai, Gujarat"
                value={filters.birth_place ?? ''}
                onChange={(e) => handleChange('birth_place', e.target.value)}
                className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label
                htmlFor="filter-status"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Living Status
              </label>
              <select
                id="filter-status"
                value={filters.status ?? ''}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DECEASED">Deceased</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            {/* Verification Status Filter */}
            <div>
              <label
                htmlFor="filter-verification-status"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Verification Status
              </label>
              <select
                id="filter-verification-status"
                value={filters.verification_status ?? ''}
                onChange={(e) => handleChange('verification_status', e.target.value)}
                className="w-full rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Verification States</option>
                <option value="VERIFIED">Verified</option>
                <option value="PENDING">Pending</option>
                <option value="UNVERIFIED">Unverified</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
