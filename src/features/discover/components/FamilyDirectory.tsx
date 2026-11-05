/**
 * FamilyDirectory component
 *
 * Orchestrating container for the Family Directory in Phase 6.
 * Manages search debouncing, location/lineage filtering, Fetch N+1 pagination,
 * loading skeletons, and empty states.
 */

import { useState, useMemo, useEffect } from 'react'
import { Users, AlertCircle, RefreshCw } from 'lucide-react'
import { useFamilyDirectory } from '../hooks/useFamilyDirectory'
import { useDiscoveryFilterOptions } from '../hooks/usePeopleDirectory'
import { useDebounce } from '../hooks/useDebounce'
import { PeopleSearchBar } from './PeopleSearchBar'
import { FamilyFilters } from './FamilyFilters'
import { FamilyFilterChips } from './FamilyFilterChips'
import { FamilyDirectoryCard } from './FamilyDirectoryCard'
import { DirectoryPagination } from './DirectoryPagination'
import type { FamilyDiscoveryFilters } from '../types'
import { useTranslation } from '@/features/i18n'

export function FamilyDirectory() {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 300)

  const [activeFilters, setActiveFilters] = useState<FamilyDiscoveryFilters>({})
  const [page, setPage] = useState(1)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const pageSize = 20

  // Combine debounced search term with active criteria
  const queryFilters: FamilyDiscoveryFilters = useMemo(() => {
    const combined: FamilyDiscoveryFilters = { ...activeFilters }
    const cleanSearch = debouncedSearch.trim()
    if (cleanSearch.length > 0) {
      combined.search = cleanSearch
    } else {
      delete combined.search
    }
    return combined
  }, [activeFilters, debouncedSearch])

  // Reset page to 1 whenever debounced search or filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, activeFilters])

  // Fetch directory records and distinct options
  const {
    data: directoryData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useFamilyDirectory(queryFilters, page, pageSize)

  const { data: filterOptions } = useDiscoveryFilterOptions()

  function handleFilterChange(newFilters: FamilyDiscoveryFilters) {
    setActiveFilters(newFilters)
  }

  function handleRemoveChip(key: keyof FamilyDiscoveryFilters) {
    if (key === 'search') {
      setSearchTerm('')
    } else {
      const next = { ...activeFilters }
      delete next[key]
      setActiveFilters(next)
    }
  }

  function handleClearAll() {
    setSearchTerm('')
    setActiveFilters({})
  }

  const items = directoryData?.items ?? []
  const hasActiveFilters = Boolean(
    searchTerm.trim().length > 0 ||
      Object.entries(activeFilters).some(([, v]) => Boolean(v && v.trim().length > 0))
  )

  return (
    <div className="space-y-6">
      {/* Search Bar & Multi-Criteria Filtering */}
      <div className="space-y-3">
        <PeopleSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={t('directory.search_family_placeholder')}
        />

        <FamilyFilters
          filters={activeFilters}
          filterOptions={filterOptions}
          onFilterChange={handleFilterChange}
          onReset={handleClearAll}
          isOpen={isFilterPanelOpen}
          onToggle={() => setIsFilterPanelOpen((prev) => !prev)}
        />

        <FamilyFilterChips
          filters={queryFilters}
          onRemoveFilter={handleRemoveChip}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Directory Content Area */}
      <div>
        {isLoading ? (
          /* Loading Skeleton */
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label={t('directory.loading_family')}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-lg border border-navy-200 bg-white p-4 shadow-sm animate-pulse"
              >
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-full bg-navy-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-navy-200" />
                    <div className="h-3 w-1/2 rounded bg-navy-100" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-navy-100" />
                  <div className="h-3 w-1/3 rounded bg-navy-100" />
                </div>
                <div className="mt-4 border-t border-navy-100 pt-3">
                  <div className="h-3 w-1/4 rounded bg-navy-100" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          /* Error State */
          <div
            role="alert"
            className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 text-center"
          >
            <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
            <h3 className="mt-2 text-base font-semibold text-red-800">
              {t('directory.error_title_family')}
            </h3>
            <p className="mt-1 text-sm text-red-600">
              {error?.message ?? 'An error occurred while fetching families. Please try again.'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t('directory.retry')}</span>
            </button>
          </div>
        ) : items.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-navy-300 bg-white p-12 text-center">
            <Users className="h-10 w-10 text-navy-400" aria-hidden="true" />
            <h3 className="mt-3 text-base font-semibold text-navy-900">
              {t('directory.no_families_found')}
            </h3>
            <p className="mt-1 max-w-md text-sm text-navy-500">
              {hasActiveFilters
                ? t('directory.no_families_desc')
                : 'No family records are currently visible in the directory.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAll}
                className="mt-4 rounded-md border border-navy-300 bg-white px-3.5 py-2 text-xs font-medium text-navy-700 shadow-sm hover:bg-navy-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {t('directory.clear_all')}
              </button>
            )}
          </div>
        ) : (
          /* Results Grid */
          <div className="space-y-6">
            <div className="flex items-center justify-between text-xs text-navy-600 font-medium">
              <span>
                {t('directory.showing_families').replace('{count}', String(items.length))}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((family) => (
                <FamilyDirectoryCard key={family.id} family={family} />
              ))}
            </div>

            {/* Pagination Controls */}
            {directoryData && (
              <DirectoryPagination
                page={directoryData.page}
                hasPreviousPage={directoryData.hasPreviousPage}
                hasNextPage={directoryData.hasNextPage}
                onPageChange={setPage}
                isLoading={isFetching}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
