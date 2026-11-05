/**
 * ImportManagementPage — Admin Data Import & Staging Batch Management (/admin/import)
 *
 * Phase 14 UI Integration
 *
 * Architectural & Security Invariants:
 * - PERSON != USER: Import operations handle census entities only, never auth accounts.
 * - DETECT != MERGE: No automatic deduplication or destructive merges occur.
 * - Server-Authoritative: Mutations route through security-definer PostgreSQL RPCs (is_admin()).
 * - Direct table INSERT/UPDATE/DELETE from client is denied by database RLS.
 */

import { useState } from 'react'
import {
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import type { ImportBatchItem, ImportBatchStatus } from '../types'
import { useImportBatches, useCancelImportBatch } from '../hooks/useImportBatches'
import { ImportBatchPromotionCard } from '../components/ImportBatchPromotionCard'
import { ImportUploadModal } from '../components/ImportUploadModal'

const STATUS_FILTERS: Array<{ label: string; value: ImportBatchStatus | 'ALL' }> = [
  { label: 'All Batches', value: 'ALL' },
  { label: 'Staged', value: 'STAGED' },
  { label: 'Validated', value: 'VALIDATED' },
  { label: 'Promoted', value: 'PROMOTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

export function ImportManagementPage() {
  const [selectedStatus, setSelectedStatus] = useState<ImportBatchStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchItem | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useImportBatches({
    status: selectedStatus,
    page,
    pageSize,
  })

  const cancelBatchMutation = useCancelImportBatch()

  const handleStatusChange = (status: ImportBatchStatus | 'ALL') => {
    setSelectedStatus(status)
    setPage(1)
    setSelectedBatch(null)
  }

  const handleSelectBatch = (batch: ImportBatchItem) => {
    setSelectedBatch((prev) => (prev?.id === batch.id ? null : batch))
  }

  const handleCancelBatch = async (batchId: string) => {
    try {
      await cancelBatchMutation.mutateAsync({
        batchId,
        reason: cancelReason || 'Cancelled by administrator via Admin Console',
      })
      setCancellingBatchId(null)
      setCancelReason('')
      if (selectedBatch?.id === batchId) {
        setSelectedBatch(null)
      }
    } catch {
      // Error handled by mutation state
    }
  }

  const batches = data?.batches ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-navy-950">Data Import & Staging</h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
              <ShieldAlert className="h-3.5 w-3.5" />
              DETECT ≠ MERGE
            </span>
          </div>
          <p className="mt-1 text-sm text-navy-600">
            Review staging batches, evaluate validation health, and promote verified census records into canonical tables.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsUploadModalOpen(true)}
            className="gap-1.5"
            data-testid="open-upload-modal-button"
          >
            <Plus className="h-4 w-4" />
            Import Data
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RotateCcw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Selected Batch Promotion Card */}
      {selectedBatch && (
        <div className="transition-all">
          <ImportBatchPromotionCard
            batch={selectedBatch}
            onPromoted={() => {
              refetch()
            }}
          />
        </div>
      )}

      {/* Filters & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-navy-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-navy-600">
            <Filter className="h-3.5 w-3.5" />
            Filter Status:
          </span>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => handleStatusChange(f.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedStatus === f.value
                  ? 'bg-navy-900 text-white shadow-2xs'
                  : 'bg-navy-50 text-navy-700 hover:bg-navy-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-navy-500 font-medium">
          Showing {batches.length} of {totalCount} batch{totalCount !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to load import batches</p>
              <p className="mt-1 text-xs text-red-700">
                {error?.message || 'A network or permission error occurred while querying the server.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-navy-200 bg-white">
          <div className="flex items-center gap-2 text-sm text-navy-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading import batches...
          </div>
        </div>
      )}

      {/* Batches Table / Card List */}
      {!isLoading && !isError && batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-navy-200 bg-navy-50/50 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-2xs">
            <FileSpreadsheet className="h-6 w-6 text-navy-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-navy-900">No import batches found</h3>
          <p className="mt-1 max-w-sm text-xs text-navy-500">
            {selectedStatus !== 'ALL'
              ? `There are no import batches currently with status "${selectedStatus}".`
              : 'No import batches have been uploaded or staged yet.'}
          </p>
        </div>
      ) : (
        !isLoading &&
        !isError && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-navy-200 bg-navy-50/75 text-navy-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">File / Batch ID</th>
                      <th className="py-3 px-4 font-semibold">Format</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Records</th>
                      <th className="py-3 px-4 font-semibold">Validation Health</th>
                      <th className="py-3 px-4 font-semibold">Created</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {batches.map((batch) => {
                      const isSelected = selectedBatch?.id === batch.id
                      const isPromoted = batch.status === 'PROMOTED'
                      const isCancelled = batch.status === 'CANCELLED'

                      return (
                        <tr
                          key={batch.id}
                          className={`transition-colors hover:bg-navy-50/40 ${
                            isSelected ? 'bg-navy-50/80 font-medium' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-navy-900">{batch.file_name}</div>
                            <div className="font-mono text-[11px] text-navy-400 truncate max-w-xs">
                              {batch.id}
                            </div>
                          </td>
                          <td className="py-3 px-4 uppercase text-navy-600 font-semibold">
                            {batch.file_format}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                                isPromoted
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : batch.status === 'VALIDATED'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : isCancelled
                                  ? 'bg-navy-50 text-navy-600 border-navy-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {batch.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-navy-700">
                            <div>Total: {batch.total_records}</div>
                            <div className="text-[11px] text-navy-400">
                              {batch.row_counts.persons || 0}p • {batch.row_counts.families || 0}f
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {batch.validation_summary.errors > 0 ? (
                                <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  {batch.validation_summary.errors} err
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Valid ({batch.validation_summary.valid || 0})
                                </span>
                              )}
                              {batch.validation_summary.warnings > 0 && (
                                <span className="text-amber-600 font-medium">
                                  • {batch.validation_summary.warnings} warn
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-navy-500 whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-navy-400" />
                              {new Date(batch.created_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant={isSelected ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => handleSelectBatch(batch)}
                              >
                                {isSelected ? 'Selected' : 'Inspect'}
                              </Button>
                              {!isPromoted && !isCancelled && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCancellingBatchId(batch.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-navy-200 bg-white px-4 py-3 rounded-xl shadow-2xs">
                <div className="text-xs text-navy-600">
                  Page <span className="font-semibold">{page}</span> of{' '}
                  <span className="font-semibold">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Cancel Confirmation Dialog */}
      {cancellingBatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-navy-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <XCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-navy-900">Cancel Import Batch</h3>
                <p className="mt-1 text-xs text-navy-500">
                  Are you sure you want to cancel this import batch? All staged records will be permanently rejected and cannot be promoted.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="cancel-reason" className="text-xs font-semibold text-navy-700">
                Reason for cancellation (optional):
              </label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                placeholder="e.g. Incompatible format or duplicate file submission"
                className="w-full rounded-lg border border-navy-200 p-2 text-xs focus:border-navy-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCancellingBatchId(null)
                  setCancelReason('')
                }}
                disabled={cancelBatchMutation.isPending}
              >
                Keep Batch
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleCancelBatch(cancellingBatchId)}
                disabled={cancelBatchMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {cancelBatchMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload & Staging Modal */}
      <ImportUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onImportSuccess={() => {
          refetch()
        }}
      />
    </div>
  )
}
