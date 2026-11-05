/**
 * VerificationReviewRejectModal — Modal dialog for moderator to reject a verification request with mandatory reason.
 * (Phase 9 — Subtask 3)
 */

import { useState, useEffect } from 'react'
import { X, AlertCircle, ShieldX } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useVerificationReviewMutations } from '../hooks/useVerificationReview'

export interface VerificationReviewRejectModalProps {
  requestId: string
  targetName: string
  entityType: 'PERSON' | 'FAMILY'
  requesterName: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function VerificationReviewRejectModal({
  requestId,
  targetName,
  entityType,
  requesterName,
  isOpen,
  onClose,
  onSuccess,
}: VerificationReviewRejectModalProps) {
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { reject } = useVerificationReviewMutations()

  useEffect(() => {
    if (isOpen) {
      setReason('')
      setErrorMsg(null)
    }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    const cleanReason = reason.trim()
    if (!cleanReason) {
      setErrorMsg('A rejection reason is required to inform the requester.')
      return
    }

    if (cleanReason.length > 1000) {
      setErrorMsg('Rejection reason cannot exceed 1000 characters.')
      return
    }

    try {
      await reject.mutateAsync({
        requestId,
        reason: cleanReason,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setErrorMsg(
        (err as { message?: string }).message ??
          'Failed to reject verification request. It may have already been reviewed.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-verification-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-red-600" aria-hidden="true" />
            <h2 id="reject-verification-modal-title" className="text-lg font-semibold text-navy-900">
              Reject {entityType === 'PERSON' ? 'Person' : 'Family'} Verification
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reject dialog"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg p-2 text-navy-400 hover:bg-navy-100 hover:text-navy-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg bg-navy-50 p-3 text-sm text-navy-700">
            <p>
              Target {entityType === 'PERSON' ? 'Person' : 'Family'}:{' '}
              <strong className="text-navy-900">{targetName}</strong>
            </p>
            <p className="mt-1 text-xs text-navy-500">
              Requested by: {requesterName}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Rejecting will revert the record status to UNVERIFIED and preserve this reason in the review log.
            </p>
          </div>

          <div>
            <label
              htmlFor="verification-rejection-reason"
              className="block text-sm font-medium text-navy-700 mb-1"
            >
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="verification-rejection-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain clearly why this verification request is being rejected (e.g. insufficient documentation, incorrect lineage details)..."
              maxLength={1000}
              className="w-full rounded-lg border border-navy-300 p-2.5 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
            <div className="mt-1 flex justify-between text-xs text-navy-500">
              <span>Reason will be saved in the review record.</span>
              <span className={reason.length > 950 ? 'text-amber-600 font-semibold' : ''}>
                {reason.length}/1000
              </span>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={reject.isPending}
              className="min-h-[44px] min-w-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={reject.isPending || !reason.trim()}
              className="min-h-[44px] min-w-[44px]"
            >
              {reject.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
