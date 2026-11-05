/**
 * Admin Duplicate Review Modal
 *
 * Phase 13 — Subtask 4: Duplicate Review Queue & Resolution
 *
 * CRITICAL ARCHITECTURAL PRINCIPLES:
 * 1. DETECT != MERGE:
 *    - Resolving a flag as CONFIRMED_DUPLICATE or NOT_DUPLICATE updates administrative review status.
 *    - It NEVER merges, overwrites, soft-deletes, or transfers records or relationships.
 * 2. PERSON != USER:
 *    - Candidates represent census persons/families, never authentication users.
 *    - No authentication credentials or private contact information are exposed.
 * 3. STALE-REVIEW CONCURRENCY PROTECTION:
 *    - Server-authoritative resolution rejects already-resolved flags with clear stale-state messaging.
 */

import { useState, useEffect } from 'react'
import {
  X,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Info,
  Calendar,
  Users,
  Home,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useResolveAdminDuplicate } from '../hooks/useAdminDuplicates'
import { DUPLICATE_STATUS_CONFIG, DUPLICATE_CONFIDENCE_CONFIG } from '../constants'
import type { AdminDuplicateItem, SafeDuplicateRecordPreview } from '../types'

export interface AdminDuplicateReviewModalProps {
  isOpen: boolean
  onClose: () => void
  flag: AdminDuplicateItem | null
  onResolved?: () => void
}

export function AdminDuplicateReviewModal({
  isOpen,
  onClose,
  flag,
  onResolved,
}: AdminDuplicateReviewModalProps) {
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isStaleRecord, setIsStaleRecord] = useState(false)

  const resolveMutation = useResolveAdminDuplicate()

  // Reset local state whenever modal opens with a new flag
  useEffect(() => {
    if (isOpen) {
      setResolutionNotes('')
      setErrorMessage(null)
      setIsStaleRecord(false)
    }
  }, [isOpen, flag?.id])

  // Handle keyboard Escape to close modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !resolveMutation.isPending) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, resolveMutation.isPending])

  if (!isOpen || !flag) {
    return null
  }

  const isPerson = flag.entity_type === 'PERSON'
  const isAlreadyResolved = flag.status !== 'OPEN' || isStaleRecord
  const previewA = flag.record_a_preview
  const previewB = flag.record_b_preview

  const handleResolve = async (resolution: 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE') => {
    setErrorMessage(null)
    setIsStaleRecord(false)

    try {
      await resolveMutation.mutateAsync({
        flagId: flag.id,
        resolution,
        resolutionNotes: resolutionNotes.trim() || undefined,
      })
      onResolved?.()
      onClose()
    } catch (err) {
      const error = err as Error & { isStale?: boolean }
      if (
        error.isStale ||
        (error.message && error.message.toLowerCase().includes('already been resolved'))
      ) {
        setIsStaleRecord(true)
        setErrorMessage(
          'Stale Record: This duplicate flag has already been resolved by another administrator and cannot be modified.'
        )
      } else {
        setErrorMessage(error.message || 'Failed to submit duplicate resolution.')
      }
    }
  }

  const renderPersonAttributes = (p: SafeDuplicateRecordPreview | null | undefined, candidateLabel: string) => {
    if (!p) {
      return (
        <div className="rounded-lg bg-navy-50/50 p-4 text-center">
          <p className="text-xs text-navy-500 italic">
            {candidateLabel} census record details could not be loaded or have been removed.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-3 text-xs">
        <div>
          <span className="block text-[11px] font-medium text-navy-500">Full Name</span>
          <span className="text-sm font-semibold text-navy-900">{p.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-[11px] font-medium text-navy-500">Gender</span>
            <span className="font-medium text-navy-800">{p.gender || 'Not specified'}</span>
          </div>
          <div>
            <span className="block text-[11px] font-medium text-navy-500">Census Status</span>
            <span className="font-medium text-navy-800">
              {p.status || 'ACTIVE'} {p.date_of_death ? `(Deceased)` : ''}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-[11px] font-medium text-navy-500">Birth Date</span>
            <span className="font-medium text-navy-800">{p.date_of_birth || 'Unknown'}</span>
          </div>
          <div>
            <span className="block text-[11px] font-medium text-navy-500">Birth Place</span>
            <span className="font-medium text-navy-800">{p.birth_place || 'Not recorded'}</span>
          </div>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-navy-500">Cultural Lineage</span>
          <span className="font-medium text-navy-800">
            Gotra: <strong className="text-navy-900">{p.gotra || '—'}</strong> | Nukh:{' '}
            <strong className="text-navy-900">{p.nukh || '—'}</strong>
          </span>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-navy-500">Verification Status</span>
          <span className="inline-block mt-0.5 rounded px-2 py-0.5 text-[10px] font-semibold bg-navy-100 text-navy-700">
            {p.verification_status || 'UNVERIFIED'}
          </span>
        </div>
      </div>
    )
  }

  const renderFamilyAttributes = (f: SafeDuplicateRecordPreview | null | undefined, candidateLabel: string) => {
    if (!f) {
      return (
        <div className="rounded-lg bg-navy-50/50 p-4 text-center">
          <p className="text-xs text-navy-500 italic">
            {candidateLabel} family record details could not be loaded or have been removed.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-3 text-xs">
        <div>
          <span className="block text-[11px] font-medium text-navy-500">Family Name</span>
          <span className="text-sm font-semibold text-navy-900">{f.family_name || f.label}</span>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-navy-500">Cultural Lineage</span>
          <span className="font-medium text-navy-800">
            Gotra: <strong className="text-navy-900">{f.gotra || '—'}</strong> | Nukh:{' '}
            <strong className="text-navy-900">{f.nukh || '—'}</strong>
          </span>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-navy-500">Location</span>
          <span className="font-medium text-navy-800">
            {[f.city, f.state, f.country].filter(Boolean).join(', ') || 'Not specified'}
          </span>
        </div>

        {f.description && (
          <div>
            <span className="block text-[11px] font-medium text-navy-500">Description</span>
            <span className="font-medium text-navy-700">{f.description}</span>
          </div>
        )}

        <div>
          <span className="block text-[11px] font-medium text-navy-500">Verification Status</span>
          <span className="inline-block mt-0.5 rounded px-2 py-0.5 text-[10px] font-semibold bg-navy-100 text-navy-700">
            {f.verification_status || 'UNVERIFIED'}
          </span>
        </div>
      </div>
    )
  }

  const statusConfig = DUPLICATE_STATUS_CONFIG[flag.status] || DUPLICATE_STATUS_CONFIG.OPEN
  const confidenceConfig = DUPLICATE_CONFIDENCE_CONFIG[flag.confidence] || DUPLICATE_CONFIDENCE_CONFIG.POSSIBLE

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-review-modal-title"
      aria-describedby="duplicate-review-modal-desc"
      data-testid="admin-duplicate-review-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-navy-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-4.5 bg-navy-50/40 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-700">
              {isPerson ? <Users className="h-5 w-5" /> : <Home className="h-5 w-5" />}
            </div>
            <div>
              <h2
                id="duplicate-review-modal-title"
                className="text-base font-bold text-navy-900"
              >
                Review Potential {flag.entity_type === 'PERSON' ? 'Person' : 'Family'} Duplicate
              </h2>
              <p id="duplicate-review-modal-desc" className="text-xs text-navy-500">
                Flag ID: <span className="font-mono">{flag.id}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={resolveMutation.isPending}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg p-2 text-navy-400 hover:bg-navy-100 hover:text-navy-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Close duplicate review modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Invariant Architectural Notice: DETECT != MERGE */}
          <div
            role="region"
            aria-label="Safety Notice"
            className="rounded-xl bg-amber-50/80 border border-amber-200 p-4 text-xs text-amber-900 flex items-start gap-3 shadow-xs"
          >
            <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <strong className="block font-semibold">Architectural Notice: DETECT ≠ MERGE</strong>
              <p className="text-amber-800 leading-relaxed">
                Confirming a duplicate marks this pair as verified duplicates in the registry for administrative awareness.
                Under no circumstances does this action automatically merge, overwrite, delete, or modify either record or their
                genealogical relationships.
              </p>
            </div>
          </div>

          {/* Stale Record Alert */}
          {isStaleRecord && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-300 p-4 text-xs text-rose-900 flex items-start justify-between gap-3 shadow-xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="block font-semibold text-rose-950">Record Already Resolved</strong>
                  <p className="text-rose-800 mt-0.5">
                    Another administrator has already submitted a decision on this duplicate flag. The resolution cannot be overwritten.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onResolved?.()
                  onClose()
                }}
                className="flex items-center gap-1.5 flex-shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Refresh Queue</span>
              </Button>
            </div>
          )}

          {/* Flag Metadata Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-50/60 p-3.5 border border-navy-100 text-xs">
            <div className="flex items-center gap-3">
              <div>
                <span className="text-navy-500 font-medium">Status: </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusConfig.badgeClasses}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.badgeDotClass}`} />
                  {statusConfig.label}
                </span>
              </div>
              <div>
                <span className="text-navy-500 font-medium">Confidence: </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${confidenceConfig.badgeClasses}`}>
                  {confidenceConfig.label}
                </span>
              </div>
            </div>

            <div className="text-navy-500 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Flagged on {new Date(flag.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Match Signals */}
          {flag.match_signals && flag.match_signals.length > 0 && (
            <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-navy-900 mb-2">
                <Info className="h-4 w-4 text-brand-600" />
                <span>Automated Detection Match Signals:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {flag.match_signals.map((signal, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md bg-navy-100 px-2.5 py-1 text-xs font-medium text-navy-800"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Side-by-Side Candidate Comparison */}
          <div>
            <div className="mb-2 text-xs font-semibold text-navy-700">
              Side-by-Side Candidate Comparison (Safe Preview Attributes)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Candidate A */}
              <div
                data-testid="duplicate-candidate-a"
                className="rounded-xl border-2 border-navy-200 bg-white p-4.5 shadow-xs"
              >
                <div className="flex items-center justify-between border-b border-navy-100 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-[11px] font-bold text-white">
                      A
                    </span>
                    <span className="text-xs font-bold text-navy-900">Candidate A</span>
                  </div>
                  <span className="font-mono text-[11px] text-navy-400">
                    ID: {flag.record_a_id.slice(0, 8)}…
                  </span>
                </div>
                {isPerson
                  ? renderPersonAttributes(previewA, 'Candidate A')
                  : renderFamilyAttributes(previewA, 'Candidate A')}
              </div>

              {/* Candidate B */}
              <div
                data-testid="duplicate-candidate-b"
                className="rounded-xl border-2 border-navy-200 bg-white p-4.5 shadow-xs"
              >
                <div className="flex items-center justify-between border-b border-navy-100 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-[11px] font-bold text-white">
                      B
                    </span>
                    <span className="text-xs font-bold text-navy-900">Candidate B</span>
                  </div>
                  <span className="font-mono text-[11px] text-navy-400">
                    ID: {flag.record_b_id.slice(0, 8)}…
                  </span>
                </div>
                {isPerson
                  ? renderPersonAttributes(previewB, 'Candidate B')
                  : renderFamilyAttributes(previewB, 'Candidate B')}
              </div>
            </div>
          </div>

          {/* Resolution Notes Input / Existing Notes Display */}
          {isAlreadyResolved ? (
            <div className="rounded-xl border border-navy-200 bg-navy-50/40 p-4 text-xs space-y-1">
              <span className="font-bold text-navy-900 block">Reviewer Notes:</span>
              <p className="text-navy-700 italic">
                {flag.resolution_notes || 'No notes were provided upon resolution.'}
              </p>
              {flag.reviewed_at && (
                <span className="text-[11px] text-navy-500 block pt-1">
                  Resolved on {new Date(flag.reviewed_at).toLocaleString()}
                </span>
              )}
            </div>
          ) : (
            <div>
              <label
                htmlFor="duplicate-resolution-notes"
                className="block text-xs font-semibold text-navy-800 mb-1.5"
              >
                Resolution Notes (Optional for audit trail, max 1,000 characters)
              </label>
              <textarea
                id="duplicate-resolution-notes"
                data-testid="duplicate-resolution-notes"
                rows={2}
                maxLength={1000}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="State the rationale for confirmation or dismissal for administrative audit records..."
                className="w-full rounded-lg border border-navy-300 p-3 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-navy-50"
                disabled={resolveMutation.isPending}
              />
              <div className="flex justify-end mt-1 text-[11px] text-navy-400">
                {resolutionNotes.length} / 1000 characters
              </div>
            </div>
          )}

          {/* Mutation Error */}
          {errorMessage && !isStaleRecord && (
            <div
              role="alert"
              data-testid="duplicate-resolution-error"
              className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 flex items-start gap-2.5"
            >
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-navy-100 px-6 py-4 bg-navy-50/20 rounded-b-2xl">
          <div className="text-xs text-navy-500">
            {isAlreadyResolved ? (
              <span className="italic">This flag is resolved. No further actions can be taken.</span>
            ) : (
              <span>Select an authoritative outcome for this candidate pair.</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={resolveMutation.isPending}
              className="min-h-[44px] min-w-[44px]"
            >
              {isAlreadyResolved ? 'Close' : 'Cancel'}
            </Button>

            {!isAlreadyResolved && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleResolve('NOT_DUPLICATE')}
                  disabled={resolveMutation.isPending}
                  data-testid="mark-not-duplicate-button"
                  className="inline-flex items-center gap-1.5 text-navy-700 hover:text-navy-900 min-h-[44px] min-w-[44px]"
                >
                  <XCircle className="h-4 w-4 text-navy-500" />
                  <span>Mark Not Duplicate</span>
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleResolve('CONFIRMED_DUPLICATE')}
                  disabled={resolveMutation.isPending}
                  data-testid="confirm-duplicate-button"
                  className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white min-h-[44px] min-w-[44px]"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Confirm Duplicate</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
