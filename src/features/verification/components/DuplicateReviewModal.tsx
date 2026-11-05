/**
 * DuplicateReviewModal — Side-by-side comparison and resolution modal for duplicate flags (Phase 9 — Subtask 4)
 *
 * CRITICAL ARCHITECTURAL PRINCIPLE:
 * DETECT != MERGE
 * - Displays both records side-by-side with match signals.
 * - Allows moderators to confirm duplicate or dismiss.
 * - Does NOT merge, delete, or modify records.
 */

import { useState } from 'react'
import { Button } from '@/components/forms/Button'
import { X, CheckCircle, XCircle, Info, ShieldAlert } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { EnrichedDuplicateFlag, ResolveDuplicateInput } from '../types/duplicate.types'
import type { PersonRow, FamilyRow } from '@/types'
import { useResolveDuplicate } from '../hooks/useDuplicateDetection'

export interface DuplicateReviewModalProps {
  isOpen: boolean
  onClose: () => void
  flag: EnrichedDuplicateFlag
  onResolved?: () => void
}

export function DuplicateReviewModal({
  isOpen,
  onClose,
  flag,
  onResolved,
}: DuplicateReviewModalProps) {
  const { t } = useLanguage()
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const resolveMutation = useResolveDuplicate()

  if (!isOpen) return null

  const isPerson = flag.entity_type === 'PERSON'
  const recordA = flag.recordA as PersonRow | FamilyRow | null
  const recordB = flag.recordB as PersonRow | FamilyRow | null

  const handleResolve = async (resolution: 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE') => {
    setErrorMessage(null)
    const input: ResolveDuplicateInput = {
      flagId: flag.id,
      resolution,
      resolutionNotes: resolutionNotes.trim() || undefined,
    }

    try {
      await resolveMutation.mutateAsync(input)
      onResolved?.()
      onClose()
    } catch (err) {
      setErrorMessage((err as Error)?.message ?? 'Failed to update duplicate flag status.')
    }
  }

  const renderPersonAttributes = (p: PersonRow | null) => {
    if (!p) {
      return <p className="text-xs text-navy-400 italic">Record not available or removed.</p>
    }
    return (
      <div className="space-y-2 text-xs">
        <div>
          <span className="font-semibold text-navy-700">Full Name:</span>{' '}
          <span className="text-navy-900">{[p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')}</span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Gender:</span>{' '}
          <span className="text-navy-900">{p.gender ?? 'Not set'}</span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Birth Date:</span>{' '}
          <span className="text-navy-900">{p.date_of_birth ?? 'Unknown'}</span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Birth Place:</span>{' '}
          <span className="text-navy-900">{p.birth_place ?? 'Unknown'}</span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Cultural Lineage:</span>{' '}
          <span className="text-navy-900">
            Gotra: {p.gotra || '—'} | Nukh: {p.nukh || '—'}
          </span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Status:</span>{' '}
          <span className="text-navy-900">{p.status} {p.date_of_death ? `(Deceased ${p.date_of_death})` : ''}</span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Verification:</span>{' '}
          <span className="text-navy-900">{p.verification_status ?? 'UNVERIFIED'}</span>
        </div>
      </div>
    )
  }

  const renderFamilyAttributes = (f: FamilyRow | null) => {
    if (!f) {
      return <p className="text-xs text-navy-400 italic">Record not available or removed.</p>
    }
    return (
      <div className="space-y-2 text-xs">
        <div>
          <span className="font-semibold text-navy-700">Family Name:</span>{' '}
          <span className="text-navy-900">{f.family_name}</span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Cultural Lineage:</span>{' '}
          <span className="text-navy-900">
            Gotra: {f.gotra || '—'} | Nukh: {f.nukh || '—'}
          </span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Location:</span>{' '}
          <span className="text-navy-900">
            {[f.city, f.state, f.country].filter(Boolean).join(', ') || 'Not set'}
          </span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Description:</span>{' '}
          <span className="text-navy-900">{f.description || 'None'}</span>
        </div>
        <div>
          <span className="font-semibold text-navy-700">Verification:</span>{' '}
          <span className="text-navy-900">{f.verification_status ?? 'UNVERIFIED'}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-review-modal-title"
      data-testid="duplicate-review-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <h2
            id="duplicate-review-modal-title"
            className="text-base font-bold text-navy-900"
          >
            Review Potential {flag.entity_type} Duplicate Flag
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] text-navy-400 hover:text-navy-600 transition-colors p-2 rounded-lg"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Safety Warning */}
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>DETECT != MERGE Guarantee:</strong> Confirming this duplicate flag only marks
            the records as verified duplicates for moderator awareness. The system will never automatically
            merge, delete, overwrite, or transfer ownership of either record.
          </div>
        </div>

        {/* Flag Metadata */}
        <div className="flex items-center justify-between gap-2 text-xs bg-navy-50/50 p-2.5 rounded-md border border-navy-100">
          <div>
            <span className="font-semibold text-navy-800">Confidence: </span>
            <span
              className={`font-bold ${
                flag.confidence === 'STRONG'
                  ? 'text-rose-600'
                  : flag.confidence === 'POSSIBLE'
                    ? 'text-amber-600'
                    : 'text-navy-600'
              }`}
            >
              {flag.confidence}
            </span>
          </div>
          <div>
            <span className="font-semibold text-navy-800">Status: </span>
            <span className="font-medium text-navy-900">{flag.status}</span>
          </div>
        </div>

        {/* Match Reasons */}
        {flag.match_reasons.length > 0 && (
          <div className="rounded-md bg-navy-50/30 p-2.5 text-xs border border-navy-100">
            <div className="font-semibold text-navy-800 mb-1 flex items-center gap-1">
              <Info className="h-3.5 w-3.5 text-brand-600" />
              <span>Flagged Match Signals:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-navy-700 pl-1">
              {flag.match_reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Side-by-Side Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            data-testid="duplicate-record-a-card"
            className="rounded-md border border-navy-200 bg-white p-3.5 shadow-sm"
          >
            <div className="text-xs font-bold text-navy-900 border-b border-navy-100 pb-1.5 mb-2.5">
              Record A ({flag.record_a_id.slice(0, 8)})
            </div>
            {isPerson
              ? renderPersonAttributes(recordA as PersonRow | null)
              : renderFamilyAttributes(recordA as FamilyRow | null)}
          </div>

          <div
            data-testid="duplicate-record-b-card"
            className="rounded-md border border-navy-200 bg-white p-3.5 shadow-sm"
          >
            <div className="text-xs font-bold text-navy-900 border-b border-navy-100 pb-1.5 mb-2.5">
              Record B ({flag.record_b_id.slice(0, 8)})
            </div>
            {isPerson
              ? renderPersonAttributes(recordB as PersonRow | null)
              : renderFamilyAttributes(recordB as FamilyRow | null)}
          </div>
        </div>

        {/* Resolution Notes */}
        <div>
          <label
            htmlFor="resolution-notes"
            className="block text-xs font-semibold text-navy-800 mb-1"
          >
            Moderator Resolution Notes (Optional)
          </label>
          <textarea
            id="resolution-notes"
            data-testid="duplicate-resolution-notes"
            rows={2}
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="Add explanation or rationale for audit trail..."
            className="w-full rounded-md border border-navy-300 p-2 text-xs text-navy-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {errorMessage && (
          <div
            data-testid="duplicate-modal-error"
            className="rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-navy-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={resolveMutation.isPending}
            className="min-h-[44px] min-w-[44px]"
          >
            {t('claims.cancel_btn', 'Cancel')}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleResolve('NOT_DUPLICATE')}
            disabled={resolveMutation.isPending}
            data-testid="dismiss-duplicate-button"
            className="inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px]"
          >
            <XCircle className="h-4 w-4" />
            <span>Mark Not Duplicate</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleResolve('CONFIRMED_DUPLICATE')}
            disabled={resolveMutation.isPending}
            data-testid="confirm-duplicate-button"
            className="inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px]"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Confirm Duplicate</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
