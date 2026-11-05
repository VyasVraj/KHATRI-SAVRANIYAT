/**
 * Panchayat Directory View (Screen 46 — ANDROID-13 Parity)
 */

import React, { useState } from 'react'
import { Crown, AlertCircle, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { usePanchayat } from '../hooks/usePanchayat'
import { PanchayatCard } from './PanchayatCard'
import { PanchayatFiltersBar } from './PanchayatFiltersBar'
import type { PanchayatFilters } from '../types'

export const PanchayatDirectoryView: React.FC = () => {
  const { t } = useLanguage()

  const [filters, setFilters] = useState<PanchayatFilters>({
    search: '',
    section: 'ALL',
    zone: 'ALL',
    status: 'ALL',
  })

  const {
    data: leaders,
    totalCount,
    availableZones,
    isLoading,
    isError,
    error,
    refetch,
  } = usePanchayat(filters)

  const handleResetFilters = () => {
    setFilters({
      search: '',
      section: 'ALL',
      zone: 'ALL',
      status: 'ALL',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-purple-200 dark:border-purple-900/40 bg-gradient-to-r from-purple-50/80 via-white to-blue-50/50 dark:from-purple-950/20 dark:via-slate-900 dark:to-blue-950/10 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600 text-white shadow-xs">
                <Crown className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
                {t('panchayat.directory_title', 'Panchayat Governance & Leadership')}
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              {t(
                'panchayat.directory_subtitle',
                'Central executive council, regional zonal Mukhis, and senior advisory Panch guiding Samaj constitutional governance.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <PanchayatFiltersBar
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        totalCount={totalCount}
        availableZones={availableZones}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="min-h-[220px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs animate-pulse space-y-4"
            >
              <div className="h-5 w-32 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-16 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-6 text-center space-y-3">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
          <h3 className="text-base font-semibold text-red-900 dark:text-red-200">
            {t('panchayat.error_title', 'Failed to load panchayat directory')}
          </h3>
          <p className="text-sm text-red-600 dark:text-red-300 max-w-md mx-auto">
            {error instanceof Error ? error.message : 'Please check your connection.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-700 transition"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{t('panchayat.retry', 'Retry')}</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && leaders.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center space-y-3">
          <Crown className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('panchayat.empty_title', 'No officers found')}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {t(
              'panchayat.empty_desc',
              'No Panchayat officers or Mukhis matched your current search filters.'
            )}
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 transition"
          >
            {t('panchayat.reset_filters', 'Reset Filters')}
          </button>
        </div>
      )}

      {/* Leaders Grid */}
      {!isLoading && !isError && leaders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {leaders.map((leader) => (
            <PanchayatCard key={leader.id} leader={leader} />
          ))}
        </div>
      )}
    </div>
  )
}
