/**
 * ClaimReviewDetailModal — Moderator dialog to inspect a claim's evidence, target person, and claimant.
 * (Phase 8 Subtask 3)
 */

import { useState, useEffect } from 'react'
import { X, CheckCircle2, ShieldAlert, AlertCircle, User, FileText } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useReviewClaimMutations } from '../hooks/usePersonClaim'
import { ClaimReviewRejectModal } from './ClaimReviewRejectModal'
import type { ClaimForReview } from '../types'

export interface ClaimReviewDetailModalProps {
  claim: ClaimForReview | null
  isOpen: boolean
  onClose: () => void
  onActionComplete?: () => void
}

export function ClaimReviewDetailModal({
  claim,
  isOpen,
  onClose,
  onActionComplete,
}: ClaimReviewDetailModalProps) {
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { approve } = useReviewClaimMutations()

  useEffect(() => {
    if (isOpen) {
      setActionError(null)
      setIsRejectOpen(false)
    }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isRejectOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isRejectOpen, onClose])

  if (!isOpen || !claim) return null

  const personName = claim.person
    ? [claim.person.first_name, claim.person.middle_name, claim.person.last_name]
        .filter(Boolean)
        .join(' ')
    : 'Unknown Census Record'

  const claimantName = claim.claimant?.display_name || 'Community Member'

  async function handleApprove() {
    if (!claim) return
    setActionError(null)
    try {
      await approve.mutateAsync({ claimId: claim.id })
      onActionComplete?.()
      onClose()
    } catch (err) {
      setActionError(
        (err as { message?: string }).message ??
          'Failed to approve claim. It may have already been reviewed or target record is no longer eligible.'
      )
    }
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-detail-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <div
          className="w-full max-w-2xl rounded-xl border border-navy-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-navy-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 id="claim-detail-modal-title" className="text-lg font-semibold text-navy-900">
                Review Census Record Claim
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close review dialog"
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg p-2 text-navy-400 hover:bg-navy-100 hover:text-navy-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {actionError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="mt-4 space-y-6">
            {/* Target Person Section */}
            <div className="rounded-lg border border-navy-200 bg-navy-50/50 p-4">
              <div className="flex items-center gap-2 mb-2 text-navy-900 font-semibold text-sm">
                <User className="h-4 w-4 text-brand-600" />
                <span>Target Census Individual</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-navy-700">
                <div>
                  <span className="font-medium text-navy-900">Full Name:</span> {personName}
                </div>
                <div>
                  <span className="font-medium text-navy-900">Record Status:</span>{' '}
                  <span className="uppercase font-semibold text-emerald-700">
                    {claim.person?.status ?? 'UNKNOWN'}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-navy-900">Birth Date:</span>{' '}
                  {claim.person?.date_of_birth ?? 'Not recorded'}
                </div>
                <div>
                  <span className="font-medium text-navy-900">Birth Place:</span>{' '}
                  {claim.person?.birth_place ?? 'Not recorded'}
                </div>
                <div>
                  <span className="font-medium text-navy-900">Gotra:</span>{' '}
                  {claim.person?.gotra ?? 'Not recorded'}
                </div>
                <div>
                  <span className="font-medium text-navy-900">Nukh:</span>{' '}
                  {claim.person?.nukh ?? 'None recorded'}
                </div>
              </div>
            </div>

            {/* Claimant Section */}
            <div className="rounded-lg border border-navy-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2 text-navy-900 font-semibold text-sm">
                <User className="h-4 w-4 text-emerald-600" />
                <span>Claimant Account</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-navy-700">
                <div>
                  <span className="font-medium text-navy-900">Account Name:</span> {claimantName}
                </div>
                {claim.claimant?.email && (
                  <div>
                    <span className="font-medium text-navy-900">Verified Email:</span> {claim.claimant.email}
                  </div>
                )}
                <div>
                  <span className="font-medium text-navy-900">Submitted:</span>{' '}
                  {new Date(claim.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium text-navy-900">Status:</span>{' '}
                  <span className="font-semibold text-amber-600">{claim.status}</span>
                </div>
              </div>
            </div>

            {/* Evidence & Notes Section */}
            <div className="rounded-lg border border-navy-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2 text-navy-900 font-semibold text-sm">
                <FileText className="h-4 w-4 text-brand-600" />
                <span>Submitted Evidence & Verification Notes</span>
              </div>
              {claim.evidence_notes ? (
                <p className="text-sm text-navy-800 bg-navy-50/70 p-3 rounded border border-navy-100 whitespace-pre-wrap">
                  {claim.evidence_notes}
                </p>
              ) : (
                <p className="text-xs text-navy-400 italic">No additional evidence notes were provided.</p>
              )}
            </div>

            {/* Invariant Reminder */}
            <div className="text-xs text-navy-500 bg-amber-50/70 border border-amber-200/80 rounded-lg p-3">
              <p className="font-semibold text-amber-900">Moderator Responsibility:</p>
              <p className="mt-0.5 text-amber-800">
                Approving this claim links the census individual permanently to this user account. The claimant
                will assume full management of the profile. Only approve if identity is verified.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-navy-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={approve.isPending}
              className="min-h-[44px] min-w-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsRejectOpen(true)}
              disabled={approve.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50 min-h-[44px] min-w-[44px]"
            >
              Reject Claim…
            </Button>
            <Button
              type="button"
              isLoading={approve.isPending}
              disabled={approve.isPending}
              onClick={handleApprove}
              className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] min-w-[44px]"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Approve Claim
            </Button>
          </div>
        </div>
      </div>

      <ClaimReviewRejectModal
        claimId={claim.id}
        personName={personName}
        claimantName={claimantName}
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        onSuccess={() => {
          setIsRejectOpen(false)
          onActionComplete?.()
          onClose()
        }}
      />
    </>
  )
}
