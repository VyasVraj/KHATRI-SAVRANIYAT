/**
 * Committee Directory View (Screen 44 — ANDROID-13 Parity)
 */

import React, { useState } from 'react'
import { Award, AlertCircle, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { useCommittees } from '../hooks/useCommittees'
import { CommitteeCard } from './CommitteeCard'
import { CommitteeFiltersBar } from './CommitteeFiltersBar'
import { CommitteeDetailModal } from './CommitteeDetailModal'
import type { Committee, CommitteeFilters } from '../types'

export const CommitteeDirectoryView: React.FC = () => {
  const { t } = useLanguage()

  const [filters, setFilters] = useState<CommitteeFilters>({
    search: '',
    category: 'ALL',
    status: 'ALL',
  })

  const [selectedCommittee, setSelectedCommittee] = useState<Committee | null>(
    null
  )

  const {
    data: committees,
    totalCount,
    isLoading,
    isError,
    error,
    refetch,
  } = useCommittees(filters)

  const handleResetFilters = () => {
    setFilters({
      search: '',
      category: 'ALL',
      status: 'ALL',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 text-white p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40 shadow-xs">
                <Award className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl tracking-tight">
                {t('committee.directory_title', 'Committees & Governance Bodies')}
              </h2>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              {t(
                'committee.directory_subtitle',
                'Official council committees managing community census, social arbitration, youth activities, women empowerment, and educational trusts.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <CommitteeFiltersBar
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        totalCount={totalCount}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="min-h-[220px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs animate-pulse space-y-4"
            >
              <div className="h-5 w-28 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-16 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
              <div className="h-10 w-full rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-6 text-center space-y-3">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
          <h3 className="text-base font-semibold text-red-900 dark:text-red-200">
            {t('committee.error_title', 'Failed to load committees directory')}
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
            <span>{t('committee.retry', 'Retry')}</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && committees.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center space-y-3">
          <Award className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('committee.empty_title', 'No committees found')}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {t(
              'committee.empty_desc',
              'No committees matched your search criteria or category filter.'
            )}
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 transition"
          >
            {t('committee.reset_filters', 'Reset Filters')}
          </button>
        </div>
      )}

      {/* Committees Grid */}
      {!isLoading && !isError && committees.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {committees.map((committee) => (
            <CommitteeCard
              key={committee.id}
              committee={committee}
              onViewDetails={setSelectedCommittee}
            />
          ))}
        </div>
      )}

      {/* Detail Modal (Screen 45) */}
      <CommitteeDetailModal
        committee={selectedCommittee}
        isOpen={Boolean(selectedCommittee)}
        onClose={() => setSelectedCommittee(null)}
      />
    </div>
  )
}
