/**
 * MukhiDirectoryView component (Phase 10 / ANDROID-11 Parity)
 *
 * Full mobile-first directory view for Mukhi Leadership:
 * - Heading: Mukhi Directory
 * - Subtitle: Explore the official KHATRI SARVANIYAT Mukhi directory and find community leaders across different regions.
 * - Dynamic count badge: {totalCount} Mukhis
 * - Search by Mukhi Name, Mobile Number, Region / Gram / City.
 * - Filter by Region / Gram / City dropdown.
 * - Alphabetical sorting (A-Z) and clear search & filter action.
 * - Individual Mukhi Profile modal on card/name/button click.
 * - Minimum 44px touch targets on all interactive controls.
 * - Accessible pagination controls.
 */

import { useState } from 'react'
import { Shield, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { useMukhiDirectory } from '../hooks/useMukhiDirectory'
import { MukhiCard } from './MukhiCard'
import { MukhiFiltersBar } from './MukhiFiltersBar'
import { MukhiDetailsModal } from './MukhiDetailsModal'
import type { MukhiLeaderItem } from '../types'

export function MukhiDirectoryView() {
  const { t } = useLanguage()
  const [selectedMukhi, setSelectedMukhi] = useState<MukhiLeaderItem | null>(null)

  const {
    leaders,
    isLoading,
    error,
    filters,
    setFilter,
    resetFilters,
    page,
    setPage,
    pageSize,
    totalCount,
    hasNextPage,
    availableStates,
    availableCities,
    availableNukhs,
    refresh,
  } = useMukhiDirectory(12)

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return (
    <div className="space-y-6">
      {/* Directory Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {t('mukhi.title', 'Mukhi Directory')}
            </h2>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
              {totalCount} {t('mukhi.count_mukhis', 'Mukhis')}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              'mukhi.subtitle',
              'Explore the official KHATRI SARVANIYAT Mukhi directory and find community leaders across different regions.'
            )}
          </p>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <MukhiFiltersBar
        filters={filters}
        availableStates={availableStates}
        availableCities={availableCities}
        availableNukhs={availableNukhs}
        onFilterChange={setFilter}
        onReset={resetFilters}
      />

      {/* Main Content Area: Loading, Error, Empty, or Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-5"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
          <h3 className="mt-2 text-sm font-bold text-rose-900">
            {t('mukhi.error_title', 'Unable to load Mukhi directory')}
          </h3>
          <p className="mt-1 text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t('mukhi.retry', 'Retry')}</span>
          </button>
        </div>
      ) : leaders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Shield className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-base font-bold text-slate-900">
            {t('mukhi.empty_title', 'No Mukhi leaders found')}
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            {t(
              'mukhi.empty_desc',
              'Try adjusting your search query or removing active filters.'
            )}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <span>{t('mukhi.reset_filters', 'Reset filters')}</span>
          </button>
        </div>
      ) : (
        <>
          {/* Leaders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {leaders.map((leader) => (
              <MukhiCard
                key={leader.id}
                leader={leader}
                onViewDetails={(selected) => setSelectedMukhi(selected)}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>

              <span className="text-xs font-medium text-slate-600">
                Page <span className="font-bold text-slate-900">{page}</span> of{' '}
                <span className="font-bold text-slate-900">{totalPages}</span>
              </span>

              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={!hasNextPage && page >= totalPages}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Individual Mukhi Details Modal */}
      <MukhiDetailsModal
        mukhi={selectedMukhi}
        isOpen={Boolean(selectedMukhi)}
        onClose={() => setSelectedMukhi(null)}
      />
    </div>
  )
}
