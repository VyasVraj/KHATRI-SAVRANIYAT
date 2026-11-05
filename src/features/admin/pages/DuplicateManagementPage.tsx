/**
 * Duplicate Management Page
 *
 * Phase 13 — Subtask 4: Duplicate Review Queue & Resolution
 *
 * Route: /admin/duplicates
 * Guarded by: AdminRoute (SUPER_ADMIN and ADMIN only)
 *
 * Features:
 * - Bounded server-side pagination (10, 25, 50 per page, defaults to OPEN)
 * - Filtering by status, entity type, and confidence
 * - High-density responsive desktop table and accessible mobile stacked cards
 * - Deep candidate comparison via AdminDuplicateReviewModal
 * - Invariant: DETECT != MERGE. System identifies potential duplicates for human review;
 *   no destructive or automatic merge actions are permitted.
 */

import { useState } from 'react'
import {
  Copy,
  Users,
  Home,
  AlertCircle,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useAdminDuplicates } from '../hooks/useAdminDuplicates'
import { AdminDuplicateReviewModal } from '../components/AdminDuplicateReviewModal'
import { DUPLICATE_STATUS_CONFIG, DUPLICATE_CONFIDENCE_CONFIG } from '../constants'
import type {
  AdminDuplicateItem,
  DuplicateEntityType,
  DuplicateFlagStatus,
  DuplicateConfidence,
} from '../types'

export function DuplicateManagementPage() {
  const [statusFilter, setStatusFilter] = useState<DuplicateFlagStatus | 'ALL'>('OPEN')
  const [entityTypeFilter, setEntityTypeFilter] = useState<DuplicateEntityType | 'ALL'>('ALL')
  const [confidenceFilter, setConfidenceFilter] = useState<DuplicateConfidence | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Modal inspection state
  const [selectedFlag, setSelectedFlag] = useState<AdminDuplicateItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAdminDuplicates({
    page,
    pageSize,
    status: statusFilter,
    entityType: entityTypeFilter,
    confidence: confidenceFilter,
  })

  const flags = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1

  const handleStatusFilterChange = (newStatus: DuplicateFlagStatus | 'ALL') => {
    setStatusFilter(newStatus)
    setPage(1)
  }

  const handleEntityTypeFilterChange = (newType: DuplicateEntityType | 'ALL') => {
    setEntityTypeFilter(newType)
    setPage(1)
  }

  const handleConfidenceFilterChange = (newConfidence: DuplicateConfidence | 'ALL') => {
    setConfidenceFilter(newConfidence)
    setPage(1)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  const openReviewModal = (flag: AdminDuplicateItem) => {
    setSelectedFlag(flag)
    setIsModalOpen(true)
  }

  const closeReviewModal = () => {
    setIsModalOpen(false)
    setSelectedFlag(null)
  }

  return (
    <div className="space-y-6" data-testid="duplicate-management-page">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-navy-900">
              Duplicate Review Queue
            </h1>
            <span className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-semibold text-navy-700">
              {totalCount} Total
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-navy-500">
            Review and resolve potential duplicate census records flagged by automated matching rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs"
            aria-label="Refresh duplicate flags queue"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* DETECT != MERGE Architectural Banner */}
      <div
        role="region"
        aria-label="Architectural Principle"
        className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="text-xs text-navy-700 leading-relaxed">
            <strong className="font-semibold text-navy-900">Architectural Invariant: DETECT ≠ MERGE.</strong>{' '}
            Automated detection identifies similarity between records for human moderation. Confirming a flag
            establishes a confirmed duplicate relation for census integrity. It does not perform destructive merges,
            reassign ownership, or delete either candidate.
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-navy-700">
            <Filter className="h-4 w-4 text-navy-400" />
            <span>Filter Queue:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto">
            {/* Status Filter */}
            <div>
              <label htmlFor="status-filter" className="sr-only">
                Filter by Status
              </label>
              <select
                id="status-filter"
                data-testid="duplicate-status-filter"
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value as DuplicateFlagStatus | 'ALL')}
                className="w-full rounded-lg border border-navy-300 py-1.5 px-3 text-xs text-navy-900 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="OPEN">Open for Review (Default)</option>
                <option value="CONFIRMED_DUPLICATE">Confirmed Duplicates</option>
                <option value="NOT_DUPLICATE">Not a Duplicate</option>
                <option value="ALL">All Statuses</option>
              </select>
            </div>

            {/* Entity Type Filter */}
            <div>
              <label htmlFor="entity-type-filter" className="sr-only">
                Filter by Entity Type
              </label>
              <select
                id="entity-type-filter"
                data-testid="duplicate-entity-filter"
                value={entityTypeFilter}
                onChange={(e) => handleEntityTypeFilterChange(e.target.value as DuplicateEntityType | 'ALL')}
                className="w-full rounded-lg border border-navy-300 py-1.5 px-3 text-xs text-navy-900 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="ALL">All Entity Types</option>
                <option value="PERSON">Persons Only</option>
                <option value="FAMILY">Families Only</option>
              </select>
            </div>

            {/* Confidence Filter */}
            <div>
              <label htmlFor="confidence-filter" className="sr-only">
                Filter by Confidence
              </label>
              <select
                id="confidence-filter"
                data-testid="duplicate-confidence-filter"
                value={confidenceFilter}
                onChange={(e) => handleConfidenceFilterChange(e.target.value as DuplicateConfidence | 'ALL')}
                className="w-full rounded-lg border border-navy-300 py-1.5 px-3 text-xs text-navy-900 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="ALL">All Confidence Levels</option>
                <option value="STRONG">Strong Confidence</option>
                <option value="POSSIBLE">Possible Match</option>
                <option value="WEAK">Weak Confidence</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-navy-200 bg-white p-12 text-center shadow-xs"
          data-testid="duplicate-queue-loading"
        >
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-navy-200 border-t-brand-600 mb-3" />
          <p className="text-xs font-medium text-navy-600">Loading duplicate review queue…</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"
          data-testid="duplicate-queue-error"
        >
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" aria-hidden="true" />
          <h2 className="mt-2 text-sm font-bold text-navy-900">Failed to Load Duplicate Queue</h2>
          <p className="mt-1 text-xs text-red-700">
            {error?.message || 'An error occurred while fetching duplicate review records.'}
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Try Again</span>
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && flags.length === 0 && (
        <div
          className="rounded-xl border border-navy-200 bg-white p-12 text-center shadow-xs"
          data-testid="duplicate-queue-empty"
        >
          <Copy className="mx-auto h-10 w-10 text-navy-300" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-bold text-navy-900">No Duplicate Flags Found</h2>
          <p className="mt-1 text-xs text-navy-500 max-w-sm mx-auto">
            {statusFilter === 'OPEN'
              ? 'The duplicate review queue is currently clear! There are no pending duplicate records requiring review.'
              : 'No duplicate flags match your current filter criteria.'}
          </p>
          {(statusFilter !== 'OPEN' || entityTypeFilter !== 'ALL' || confidenceFilter !== 'ALL') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('OPEN')
                setEntityTypeFilter('ALL')
                setConfidenceFilter('ALL')
                setPage(1)
              }}
              className="mt-4 text-xs"
            >
              Reset Filters
            </Button>
          )}
        </div>
      )}

      {/* Content Table & Mobile Cards */}
      {!isLoading && !isError && flags.length > 0 && (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-navy-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-navy-100 text-left text-xs">
              <thead className="bg-navy-50/70 text-navy-700 font-semibold">
                <tr>
                  <th scope="col" className="py-3 px-4">Entity</th>
                  <th scope="col" className="py-3 px-4">Candidate A</th>
                  <th scope="col" className="py-3 px-4">Candidate B</th>
                  <th scope="col" className="py-3 px-4">Confidence</th>
                  <th scope="col" className="py-3 px-4">Signals</th>
                  <th scope="col" className="py-3 px-4">Status</th>
                  <th scope="col" className="py-3 px-4">Flagged</th>
                  <th scope="col" className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 text-navy-800">
                {flags.map((flag) => {
                  const statusConf = DUPLICATE_STATUS_CONFIG[flag.status] || DUPLICATE_STATUS_CONFIG.OPEN
                  const confConf = DUPLICATE_CONFIDENCE_CONFIG[flag.confidence] || DUPLICATE_CONFIDENCE_CONFIG.POSSIBLE
                  const labelA = flag.record_a_preview?.label || `Record #${flag.record_a_id.slice(0, 8)}`
                  const labelB = flag.record_b_preview?.label || `Record #${flag.record_b_id.slice(0, 8)}`

                  return (
                    <tr
                      key={flag.id}
                      data-testid={`duplicate-row-${flag.id}`}
                      className="hover:bg-navy-50/50 transition-colors"
                    >
                      {/* Entity */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-medium text-navy-700">
                          {flag.entity_type === 'PERSON' ? (
                            <Users className="h-3.5 w-3.5 text-navy-500" />
                          ) : (
                            <Home className="h-3.5 w-3.5 text-navy-500" />
                          )}
                          <span>{flag.entity_type === 'PERSON' ? 'Person' : 'Family'}</span>
                        </span>
                      </td>

                      {/* Candidate A */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-navy-900">{labelA}</div>
                        <div className="font-mono text-[10px] text-navy-400">
                          {flag.record_a_id.slice(0, 8)}…
                        </div>
                      </td>

                      {/* Candidate B */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-navy-900">{labelB}</div>
                        <div className="font-mono text-[10px] text-navy-400">
                          {flag.record_b_id.slice(0, 8)}…
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${confConf.badgeClasses}`}>
                          {confConf.label}
                        </span>
                      </td>

                      {/* Match Signals */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {flag.match_signals && flag.match_signals.length > 0 ? (
                            flag.match_signals.slice(0, 2).map((sig, i) => (
                              <span
                                key={i}
                                className="inline-block rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-medium text-navy-700 truncate max-w-[130px]"
                              >
                                {sig}
                              </span>
                            ))
                          ) : (
                            <span className="text-navy-400 italic">None</span>
                          )}
                          {flag.match_signals && flag.match_signals.length > 2 && (
                            <span className="text-[10px] text-navy-500 font-medium self-center">
                              +{flag.match_signals.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusConf.badgeClasses}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusConf.badgeDotClass}`} />
                          {statusConf.label}
                        </span>
                      </td>

                      {/* Flagged Date */}
                      <td className="py-3 px-4 whitespace-nowrap text-navy-500 text-[11px]">
                        {new Date(flag.created_at).toLocaleDateString()}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openReviewModal(flag)}
                          data-testid={`review-duplicate-btn-${flag.id}`}
                          className="inline-flex items-center gap-1.5 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Review</span>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="md:hidden space-y-3">
            {flags.map((flag) => {
              const statusConf = DUPLICATE_STATUS_CONFIG[flag.status] || DUPLICATE_STATUS_CONFIG.OPEN
              const confConf = DUPLICATE_CONFIDENCE_CONFIG[flag.confidence] || DUPLICATE_CONFIDENCE_CONFIG.POSSIBLE
              const labelA = flag.record_a_preview?.label || `Record #${flag.record_a_id.slice(0, 8)}`
              const labelB = flag.record_b_preview?.label || `Record #${flag.record_b_id.slice(0, 8)}`

              return (
                <div
                  key={flag.id}
                  data-testid={`duplicate-card-${flag.id}`}
                  className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700">
                      {flag.entity_type === 'PERSON' ? (
                        <Users className="h-3.5 w-3.5 text-navy-500" />
                      ) : (
                        <Home className="h-3.5 w-3.5 text-navy-500" />
                      )}
                      <span>{flag.entity_type === 'PERSON' ? 'Person' : 'Family'}</span>
                    </span>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusConf.badgeClasses}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusConf.badgeDotClass}`} />
                      {statusConf.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-y border-navy-100 py-2.5">
                    <div>
                      <span className="block text-[10px] font-medium text-navy-400">Candidate A</span>
                      <strong className="text-navy-900 block truncate">{labelA}</strong>
                      <span className="font-mono text-[9px] text-navy-400">{flag.record_a_id.slice(0, 8)}…</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-medium text-navy-400">Candidate B</span>
                      <strong className="text-navy-900 block truncate">{labelB}</strong>
                      <span className="font-mono text-[9px] text-navy-400">{flag.record_b_id.slice(0, 8)}…</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-navy-500 text-[11px]">Confidence:</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${confConf.badgeClasses}`}>
                        {confConf.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-navy-400">
                      {new Date(flag.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openReviewModal(flag)}
                    className="w-full flex items-center justify-center gap-1.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Review Duplicate</span>
                  </Button>
                </div>
              )
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-navy-200 bg-white p-3.5 shadow-xs text-xs">
            <div className="flex items-center gap-2">
              <span className="text-navy-500">Items per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded-md border border-navy-300 py-1 px-2 text-xs text-navy-800 bg-white"
                aria-label="Select items per page"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="text-navy-500 ml-2">
                Showing {flags.length === 0 ? 0 : (page - 1) * pageSize + 1} to{' '}
                {Math.min(page * pageSize, totalCount)} of {totalCount}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Prev</span>
              </Button>
              <span className="px-2 text-navy-700 font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / Comparison Modal */}
      {selectedFlag && (
        <AdminDuplicateReviewModal
          isOpen={isModalOpen}
          onClose={closeReviewModal}
          flag={selectedFlag}
          onResolved={() => {
            refetch()
          }}
        />
      )}
    </div>
  )
}
