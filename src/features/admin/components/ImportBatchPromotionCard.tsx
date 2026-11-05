/**
 * ImportBatchPromotionCard
 *
 * Dedicated administrative UI card displaying batch status, validation summary,
 * eligibility criteria, and deliberate promotion trigger.
 *
 * Invariants:
 * - Eligibility:
 *   * Enabled ONLY when batch is VALIDATED, has zero PENDING/ERROR records, and >= 1 eligible records.
 *   * Disabled when STAGED, CANCELLED, REVERTED, or when unresolved errors exist.
 * - Promotion Confirmation:
 *   * Opening this card never triggers promotion.
 *   * Triggers ImportPromotionConfirmationModal requiring deliberate confirmation checkbox.
 */

import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Info,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import type { ImportBatchItem, PromoteImportBatchResult } from '../types'
import { promoteImportBatch } from '../services/import.service'
import { ImportPromotionConfirmationModal } from './ImportPromotionConfirmationModal'

export interface ImportBatchPromotionCardProps {
  batch: ImportBatchItem
  onPromoted?: (result: PromoteImportBatchResult) => void
}

export function ImportBatchPromotionCard({
  batch,
  onPromoted,
}: ImportBatchPromotionCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const [promotionResult, setPromotionResult] = useState<PromoteImportBatchResult | null>(null)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  const isValidated = batch.status === 'VALIDATED'
  const isAlreadyPromoted = batch.status === 'PROMOTED'
  const isCancelled = batch.status === 'CANCELLED'
  const isStaged = batch.status === 'STAGED'

  const errorCount = batch.validation_summary.errors || 0
  const warningCount = batch.validation_summary.warnings || 0
  const validCount = batch.validation_summary.valid || 0
  const duplicateCount = batch.validation_summary.duplicates || 0
  const eligibleCount = validCount + warningCount
  const hasZeroErrors = errorCount === 0

  // Promotion is eligible ONLY when VALIDATED, zero errors, and >= 1 eligible record
  const isEligible = isValidated && hasZeroErrors && eligibleCount > 0

  const handleExecutePromotion = async () => {
    setIsPromoting(true)
    setErrorBanner(null)
    try {
      const result = await promoteImportBatch(batch.id)
      setPromotionResult(result)
      if (onPromoted) {
        onPromoted(result)
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to promote import batch. All database operations rolled back.'
      setErrorBanner(msg)
      throw err
    } finally {
      setIsPromoting(false)
    }
  }

  return (
    <div
      className="rounded-2xl border border-navy-200 bg-white p-6 shadow-xs"
      data-testid="import-batch-promotion-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-navy-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-navy-900">
              Import Promotion & Canonical Transition
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                isAlreadyPromoted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isValidated
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : isCancelled
                  ? 'bg-navy-50 text-navy-600 border-navy-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {batch.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-navy-500">
            Batch: {batch.file_name} • {batch.total_records} total staged records
          </p>
        </div>

        {/* Promotion Action Button */}
        <div>
          {isAlreadyPromoted ? (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Promoted to Census</span>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              disabled={!isEligible || isPromoting}
              className="gap-1.5"
              data-testid="open-promotion-modal-button"
            >
              <Database className="h-4 w-4" aria-hidden="true" />
              <span>Promote Import</span>
            </Button>
          )}
        </div>
      </div>

      {/* Eligibility / Status Guidance Banners */}
      <div className="mt-5 space-y-3">
        {isAlreadyPromoted && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Batch Completed:</span> This import batch was promoted into canonical census tables
                {batch.promoted_at ? ` on ${new Date(batch.promoted_at).toLocaleString()}` : ''}.
                All census persons, families, and relationships are live in the community directory.
              </div>
            </div>
          </div>
        )}

        {isStaged && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Validation Required:</span> Batch must be validated and finalized before promotion.
                Run validation to evaluate records against canonical constraints and detect duplicate candidates.
              </div>
            </div>
          </div>
        )}

        {isValidated && !hasZeroErrors && (
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-xs text-red-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Blocking Errors Present:</span> {errorCount} record(s) contain blocking errors.
                All errors must be resolved by an administrator or marked EXCLUDED before promotion is permitted.
              </div>
            </div>
          </div>
        )}

        {isValidated && hasZeroErrors && eligibleCount === 0 && (
          <div className="rounded-xl border border-navy-200 bg-navy-50/70 p-4 text-xs text-navy-700">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-navy-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Zero Eligible Records:</span> All records in this batch have been excluded.
                There are no valid records available to promote.
              </div>
            </div>
          </div>
        )}

        {isValidated && isEligible && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Eligible for Promotion:</span> Zero blocking errors detected.
                {eligibleCount} record(s) are ready for promotion into canonical tables.
                {warningCount > 0 && ` (${warningCount} records carry non-blocking warnings or duplicate flags).`}
              </div>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
          <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-center">
            <div className="text-xs text-navy-500 font-medium">Eligible Records</div>
            <div className="mt-1 text-lg font-bold text-navy-900" data-testid="eligible-count">
              {eligibleCount}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-center">
            <div className="text-xs text-emerald-700 font-medium">Valid Records</div>
            <div className="mt-1 text-lg font-bold text-emerald-900">
              {validCount}
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 text-center">
            <div className="text-xs text-amber-700 font-medium">Warnings / Dups</div>
            <div className="mt-1 text-lg font-bold text-amber-900">
              {warningCount} {duplicateCount > 0 ? `(${duplicateCount} dup)` : ''}
            </div>
          </div>

          <div className="rounded-xl border border-red-100 bg-red-50/40 p-3 text-center">
            <div className="text-xs text-red-700 font-medium">Blocking Errors</div>
            <div className="mt-1 text-lg font-bold text-red-900">
              {errorCount}
            </div>
          </div>
        </div>

        {errorBanner && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {errorBanner}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <ImportPromotionConfirmationModal
        isOpen={isModalOpen}
        batch={batch}
        isPromoting={isPromoting}
        promotionResult={promotionResult}
        onConfirm={handleExecutePromotion}
        onClose={() => {
          setIsModalOpen(false)
          setPromotionResult(null)
          setErrorBanner(null)
        }}
      />
    </div>
  )
}
