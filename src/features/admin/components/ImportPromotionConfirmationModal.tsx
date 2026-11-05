/**
 * ImportPromotionConfirmationModal
 *
 * Explicit confirmation dialog requiring deliberate administrator authorization
 * before promoting staging census records into canonical tables.
 *
 * Architectural Invariants:
 * - Explicit Consent: Promotion NEVER executes automatically.
 * - PERSON != USER: Displays clear warning that records represent census entities.
 * - DETECT != MERGE: Clearly notes that warnings will create open duplicate flags rather than overwriting.
 */

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Home,
  Loader2,
  Share2,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import type { ImportBatchItem, PromoteImportBatchResult } from '../types'

export interface ImportPromotionConfirmationModalProps {
  isOpen: boolean
  batch: ImportBatchItem
  isPromoting: boolean
  promotionResult: PromoteImportBatchResult | null
  onConfirm: () => Promise<void>
  onClose: () => void
}

export function ImportPromotionConfirmationModal({
  isOpen,
  batch,
  isPromoting,
  promotionResult,
  onConfirm,
  onClose,
}: ImportPromotionConfirmationModalProps) {
  const [hasConfirmedCheckbox, setHasConfirmedCheckbox] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const validCount = batch.validation_summary.valid || 0
  const warningCount = batch.validation_summary.warnings || 0
  const duplicateCount = batch.validation_summary.duplicates || 0
  const excludedCount = Math.max(
    0,
    batch.total_records - (validCount + warningCount + (batch.validation_summary.errors || 0))
  )

  const handlePromote = async () => {
    if (!hasConfirmedCheckbox && !promotionResult) return
    setErrorMessage(null)
    try {
      await onConfirm()
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to complete import promotion. Transaction rolled back.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-navy-950/60 p-4 sm:p-6 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-xl rounded-2xl border border-navy-200 bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                promotionResult
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-amber-50 text-amber-600 border border-amber-200'
              }`}
            >
              {promotionResult ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Database className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2
                id="promotion-modal-title"
                className="text-lg font-bold text-navy-900"
              >
                {promotionResult ? 'Batch Promoted Successfully' : 'Confirm Import Promotion'}
              </h2>
              <p className="text-xs text-navy-500">
                {batch.file_name} ({batch.file_format})
              </p>
            </div>
          </div>

          {!isPromoting && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close promotion dialog"
              className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 space-y-5">
          {promotionResult ? (
            /* Post-Promotion View */
            <div className="space-y-4" data-testid="promotion-success-view">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-xs sm:text-sm text-emerald-900">
                    <span className="font-bold">Canonical Census Records Committed.</span>{' '}
                    All eligible records from this batch have been promoted to canonical tables within a single atomic transaction.
                  </div>
                </div>
              </div>

              {/* Summary Counts Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-center">
                  <UserCheck className="mx-auto h-4 w-4 text-brand-600 mb-1" />
                  <div className="text-xl font-extrabold text-navy-900">
                    {promotionResult.promotedCounts.persons}
                  </div>
                  <div className="text-xs text-navy-500">Persons Created</div>
                </div>

                <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-center">
                  <Home className="mx-auto h-4 w-4 text-teal-600 mb-1" />
                  <div className="text-xl font-extrabold text-navy-900">
                    {promotionResult.promotedCounts.families}
                  </div>
                  <div className="text-xs text-navy-500">Families Created</div>
                </div>

                <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-center">
                  <Share2 className="mx-auto h-4 w-4 text-indigo-600 mb-1" />
                  <div className="text-xl font-extrabold text-navy-900">
                    {promotionResult.promotedCounts.relationships}
                  </div>
                  <div className="text-xs text-navy-500">Relationships</div>
                </div>

                <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-center">
                  <ShieldAlert className="mx-auto h-4 w-4 text-purple-600 mb-1" />
                  <div className="text-xl font-extrabold text-navy-900">
                    {promotionResult.familyMemberships}
                  </div>
                  <div className="text-xs text-navy-500">Head Memberships</div>
                </div>

                <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-center">
                  <AlertTriangle className="mx-auto h-4 w-4 text-amber-600 mb-1" />
                  <div className="text-xl font-extrabold text-navy-900">
                    {promotionResult.duplicateFlags}
                  </div>
                  <div className="text-xs text-navy-500">Duplicate Flags</div>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-center">
                  <FileText className="mx-auto h-4 w-4 text-emerald-700 mb-1" />
                  <div className="text-xl font-extrabold text-emerald-900">
                    {promotionResult.total}
                  </div>
                  <div className="text-xs text-emerald-700">Total Entities</div>
                </div>
              </div>

              {/* Invariant Reminders */}
              <div className="text-xs text-navy-500 space-y-1 pt-2">
                <p>• <strong>PERSON ≠ USER:</strong> Promoted persons have <code>user_id = null</code> and remain unclaimed.</p>
                <p>• <strong>DETECT ≠ MERGE:</strong> Any duplicate warnings generated open moderation flags without modifying existing records.</p>
                <p>• <strong>Immutable Lineage:</strong> Source row provenance is permanently recorded on staging records.</p>
              </div>
            </div>
          ) : (
            /* Pre-Promotion Confirmation View */
            <div className="space-y-4">
              {/* Critical Alert Warning */}
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-xs sm:text-sm text-amber-900"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold">Permanent Census Mutation:</span>{' '}
                    This action will promote validated records from staging into canonical tables (<code>public.persons</code>, <code>public.families</code>, <code>public.relationships</code>).
                  </div>
                </div>
              </div>

              {/* Breakdown Cards */}
              <div className="rounded-xl border border-navy-200 bg-navy-50/30 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-navy-700">
                  Entities to be Promoted
                </h3>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-navy-100">
                    <span className="block text-navy-500 text-[11px]">Persons</span>
                    <span className="text-base font-bold text-navy-900">{batch.row_counts.persons}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-navy-100">
                    <span className="block text-navy-500 text-[11px]">Families</span>
                    <span className="text-base font-bold text-navy-900">{batch.row_counts.families}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-navy-100">
                    <span className="block text-navy-500 text-[11px]">Relationships</span>
                    <span className="text-base font-bold text-navy-900">{batch.row_counts.relationships}</span>
                  </div>
                </div>

                <div className="border-t border-navy-100 pt-3 text-xs text-navy-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Eligible Valid Records:</span>
                    <span className="font-semibold text-emerald-700">{validCount}</span>
                  </div>
                  {warningCount > 0 && (
                    <div className="flex justify-between">
                      <span>Records with Warnings (promoted as distinct):</span>
                      <span className="font-semibold text-amber-700">{warningCount}</span>
                    </div>
                  )}
                  {duplicateCount > 0 && (
                    <div className="flex justify-between text-purple-700">
                      <span>Duplicate Warnings (will create OPEN flags):</span>
                      <span className="font-semibold">{duplicateCount}</span>
                    </div>
                  )}
                  {excludedCount > 0 && (
                    <div className="flex justify-between text-navy-400">
                      <span>Excluded Records (will NOT be promoted):</span>
                      <span className="font-semibold">{excludedCount}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                >
                  <p className="font-semibold">Promotion Failed:</p>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              )}

              {/* Deliberate Confirmation Checkbox */}
              <div className="rounded-xl border border-navy-200 bg-white p-3.5">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="confirm-promotion-checkbox"
                    checked={hasConfirmedCheckbox}
                    onChange={(e) => setHasConfirmedCheckbox(e.target.checked)}
                    disabled={isPromoting}
                    className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs text-navy-700 leading-relaxed">
                    I understand that this operation will create real canonical census records in the community registry.
                    Persons created will remain unclaimed (<code>user_id = null</code>) and any duplicate warnings will create open moderation flags.
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-navy-100 px-6 py-4 bg-navy-50/30 rounded-b-2xl">
          {promotionResult ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onClose}
              className="gap-1.5"
            >
              <span>Done</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isPromoting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handlePromote}
                disabled={!hasConfirmedCheckbox || isPromoting}
                className="gap-1.5"
                data-testid="confirm-promotion-button"
              >
                {isPromoting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Promoting Records…</span>
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" aria-hidden="true" />
                    <span>Promote Import</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
