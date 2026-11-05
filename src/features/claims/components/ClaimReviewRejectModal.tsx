/**
 * ClaimReviewRejectModal — Modal dialog for moderator to reject a pending claim with mandatory reason.
 * (Phase 8 Subtask 3)
 */

import { useState, useEffect } from 'react'
import { X, AlertCircle, ShieldX } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useReviewClaimMutations } from '../hooks/usePersonClaim'

export interface ClaimReviewRejectModalProps {
  claimId: string
  personName: string
  claimantName: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function ClaimReviewRejectModal({
  claimId,
  personName,
  claimantName,
  isOpen,
  onClose,
  onSuccess,
}: ClaimReviewRejectModalProps) {
  const [reason, setReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { reject } = useReviewClaimMutations()

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
      setErrorMsg('A rejection reason is required to inform the claimant.')
      return
    }

    if (cleanReason.length > 1000) {
      setErrorMsg('Rejection reason cannot exceed 1000 characters.')
      return
    }

    try {
      await reject.mutateAsync({
        claimId,
        reason: cleanReason,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setErrorMsg(
        (err as { message?: string }).message ??
          'Failed to reject claim. The claim may have already been reviewed.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-claim-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-red-600" aria-hidden="true" />
            <h2 id="reject-claim-modal-title" className="text-lg font-semibold text-navy-900">
              Reject Person Claim
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg p-2 text-navy-400 hover:bg-navy-100 hover:text-navy-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 text-sm text-navy-600 space-y-1">
          <p>
            You are rejecting the claim submitted by{' '}
            <strong className="text-navy-900">{claimantName || 'the claimant'}</strong> for{' '}
            <strong className="text-navy-900">{personName || 'this census record'}</strong>.
          </p>
          <p className="text-xs text-navy-500">
            A meaningful rejection reason is required so the claimant understands why their claim was denied.
          </p>
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
          <div>
            <div className="flex justify-between items-center mb-1">
              <label
                htmlFor="rejection-reason"
                className="block text-sm font-medium text-navy-700"
              >
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <span
                className={`text-xs ${
                  reason.length > 1000 ? 'text-red-600 font-semibold' : 'text-navy-400'
                }`}
              >
                {reason.length}/1000
              </span>
            </div>
            <textarea
              id="rejection-reason"
              name="rejectionReason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={reject.isPending}
              maxLength={1000}
              placeholder="State the reason for rejection (e.g., Insufficient documentation provided, identity could not be verified with family elders, duplicate record exists)..."
              className="w-full rounded-md border border-navy-300 p-2.5 text-sm text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-navy-100 pt-4">
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
              isLoading={reject.isPending}
              disabled={reject.isPending || !reason.trim() || reason.length > 1000}
              className="border-red-400 bg-red-600 text-white hover:bg-red-700 min-h-[44px] min-w-[44px]"
            >
              Confirm Rejection
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
