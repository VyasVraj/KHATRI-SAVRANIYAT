/**
 * FamilyFilters component
 *
 * Multi-criteria filter panel for the Family Directory.
 *
 * PRIVACY & SCHEMA INVARIANTS:
 * - Only verified families columns are exposed:
 *   family_name, gotra, nukh, kul, city, state, country, status, verification_status.
 * - Mukhi filters, native_place, and internal keys are strictly excluded.
 */

import { Filter, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import type { FamilyDiscoveryFilters, DiscoveryFilterOptions } from '../types'
import { useTranslation } from '@/features/i18n'

interface FamilyFiltersProps {
  filters: FamilyDiscoveryFilters
  filterOptions?: DiscoveryFilterOptions
  onFilterChange: (filters: FamilyDiscoveryFilters) => void
  onReset: () => void
  isOpen: boolean
  onToggle: () => void
  className?: string
}

export function FamilyFilters({
  filters,
  filterOptions,
  onFilterChange,
  onReset,
  isOpen,
  onToggle,
  className = '',
}: FamilyFiltersProps) {
  const { t } = useTranslation()
  const activeCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'search' && Boolean(v && v.trim().length > 0)
  ).length

  function handleChange(key: keyof FamilyDiscoveryFilters, value: string) {
    const trimmed = value.trim()
    const next = { ...filters }
    if (trimmed.length === 0) {
      delete next[key]
    } else {
      if (key === 'status') {
        next.status = trimmed as FamilyDiscoveryFilters['status']
      } else if (key === 'verification_status') {
        next.verification_status = trimmed as FamilyDiscoveryFilters['verification_status']
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
          aria-controls="family-filters-panel"
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
          id="family-filters-panel"
          className="border-t border-navy-100 p-4 pt-3"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Family Name */}
            <div>
              <label
                htmlFor="filter-family-name"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Family Name
              </label>
              <input
                id="filter-family-name"
                type="text"
                placeholder="e.g. Mehta"
                value={filters.family_name ?? ''}
                onChange={(e) => handleChange('family_name', e.target.value)}
                className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Gotra Filter */}
            <div>
              <label
                htmlFor="filter-family-gotra"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Gotra
              </label>
              {filterOptions?.gotras && filterOptions.gotras.length > 0 ? (
                <select
                  id="filter-family-gotra"
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
                  id="filter-family-gotra"
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
                htmlFor="filter-family-nukh"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Nukh
              </label>
              {filterOptions?.nukhs && filterOptions.nukhs.length > 0 ? (
                <select
                  id="filter-family-nukh"
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
                  id="filter-family-nukh"
                  type="text"
                  placeholder="Filter by Nukh"
                  value={filters.nukh ?? ''}
                  onChange={(e) => handleChange('nukh', e.target.value)}
                  className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>


            {/* City Filter */}
            <div>
              <label
                htmlFor="filter-family-city"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                City
              </label>
              {filterOptions?.cities && filterOptions.cities.length > 0 ? (
                <select
                  id="filter-family-city"
                  value={filters.city ?? ''}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className="w-full rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">All Cities</option>
                  {filterOptions.cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="filter-family-city"
                  type="text"
                  placeholder="e.g. Mumbai"
                  value={filters.city ?? ''}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>

            {/* State Filter */}
            <div>
              <label
                htmlFor="filter-family-state"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                State
              </label>
              {filterOptions?.states && filterOptions.states.length > 0 ? (
                <select
                  id="filter-family-state"
                  value={filters.state ?? ''}
                  onChange={(e) => handleChange('state', e.target.value)}
                  className="w-full rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">All States</option>
                  {filterOptions.states.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="filter-family-state"
                  type="text"
                  placeholder="e.g. Gujarat"
                  value={filters.state ?? ''}
                  onChange={(e) => handleChange('state', e.target.value)}
                  className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>

            {/* Country Filter */}
            <div>
              <label
                htmlFor="filter-family-country"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Country
              </label>
              <input
                id="filter-family-country"
                type="text"
                placeholder="e.g. India"
                value={filters.country ?? ''}
                onChange={(e) => handleChange('country', e.target.value)}
                className="w-full rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label
                htmlFor="filter-family-status"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Status
              </label>
              <select
                id="filter-family-status"
                value={filters.status ?? ''}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            {/* Verification Status Filter */}
            <div>
              <label
                htmlFor="filter-family-verification"
                className="mb-1 block text-xs font-medium text-navy-700"
              >
                Verification Status
              </label>
              <select
                id="filter-family-verification"
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
