/**
 * VerificationReviewDetailModal — Moderator modal to inspect target entity details, supporting notes, and review history.
 * (Phase 9 — Subtask 3)
 */

import { useState, useEffect } from 'react'
import {
  X,
  CheckCircle2,
  ShieldAlert,
  AlertCircle,
  User,
  Users,
  FileText,
  Calendar,
  MapPin,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useVerificationReviewMutations } from '../hooks/useVerificationReview'
import { VerificationReviewRejectModal } from './VerificationReviewRejectModal'
import { VerificationBadge } from './VerificationBadge'
import type { VerificationRequestForReview } from '../types'

export interface VerificationReviewDetailModalProps {
  request: VerificationRequestForReview | null
  isOpen: boolean
  onClose: () => void
  onActionComplete?: () => void
}

export function VerificationReviewDetailModal({
  request,
  isOpen,
  onClose,
  onActionComplete,
}: VerificationReviewDetailModalProps) {
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { approve } = useVerificationReviewMutations()

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

  if (!isOpen || !request) return null

  const isPerson = request.entity_type === 'PERSON'
  const isFamily = request.entity_type === 'FAMILY'

  const targetName = isPerson
    ? request.person
      ? [request.person.first_name, request.person.middle_name, request.person.last_name]
          .filter(Boolean)
          .join(' ')
      : 'Unknown Person'
    : request.family?.family_name || 'Unknown Family'

  const requesterName = request.requester?.display_name || 'Community Member'

  async function handleApprove() {
    if (!request) return
    setActionError(null)
    try {
      await approve.mutateAsync({ requestId: request.id })
      onActionComplete?.()
      onClose()
    } catch (err) {
      setActionError(
        (err as { message?: string }).message ??
          'Failed to approve verification request. The record may have already been reviewed or is no longer eligible.'
      )
    }
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-detail-modal-title"
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
              <h2 id="verification-detail-modal-title" className="text-lg font-semibold text-navy-900">
                Review {isPerson ? 'Person' : 'Family'} Verification Request
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
            {/* Request Summary Card */}
            <div className="rounded-lg border border-navy-200 bg-navy-50/50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-navy-100 pb-3">
                <div className="flex items-center gap-2">
                  {isPerson ? (
                    <User className="h-5 w-5 text-brand-600 shrink-0" />
                  ) : (
                    <Users className="h-5 w-5 text-brand-600 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-navy-900">{targetName}</span>
                      <span className="rounded bg-navy-200/60 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">
                        {request.entity_type}
                      </span>
                    </div>
                    <p className="text-xs text-navy-500">ID: {request.entity_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-navy-500">Record Status:</span>
                  {request.person ? (
                    <VerificationBadge status={request.person.verification_status} />
                  ) : request.family ? (
                    <VerificationBadge status={request.family.verification_status} />
                  ) : (
                    <span className="text-xs text-navy-500">N/A</span>
                  )}
                </div>
              </div>

              {/* Target Entity Details Grid */}
              <div className="mt-3 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-2">
                  Target Record Details
                </h4>

                {isPerson && request.person && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-navy-700">
                    <div>
                      <span className="text-navy-500">Gender:</span>{' '}
                      <span className="font-medium text-navy-900">{request.person.gender || 'Not specified'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-navy-400" />
                      <span className="text-navy-500">DOB:</span>{' '}
                      <span className="font-medium text-navy-900">{request.person.date_of_birth || 'Unknown'}</span>
                    </div>
                    {request.person.date_of_death && (
                      <div>
                        <span className="text-navy-500">Date of Death:</span>{' '}
                        <span className="font-medium text-navy-900">{request.person.date_of_death}</span>
                      </div>
                    )}
                    {request.person.birth_place && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-navy-400" />
                        <span className="text-navy-500">Birth Place:</span>{' '}
                        <span className="font-medium text-navy-900">{request.person.birth_place}</span>
                      </div>
                    )}
                    <div className="sm:col-span-2 flex items-center gap-1 pt-1 border-t border-navy-100">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-navy-500">Cultural Lineage:</span>{' '}
                      <span className="font-medium text-navy-900">
                        {[
                          request.person.gotra && `Gotra: ${request.person.gotra}`,
                          request.person.nukh && `Nukh: ${request.person.nukh}`,
                        ]
                          .filter(Boolean)
                          .join(' • ') || 'None provided'}
                      </span>
                    </div>
                  </div>
                )}

                {isFamily && request.family && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-navy-700">
                    <div className="sm:col-span-2">
                      <span className="text-navy-500">Description:</span>{' '}
                      <span className="font-medium text-navy-900">{request.family.description || 'No description provided'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-navy-400" />
                      <span className="text-navy-500">Location:</span>{' '}
                      <span className="font-medium text-navy-900">
                        {[request.family.city, request.family.state, request.family.country]
                          .filter(Boolean)
                          .join(', ') || 'Not specified'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-navy-500">Gotra / Nukh:</span>{' '}
                      <span className="font-medium text-navy-900">
                        {[
                          request.family.gotra && `Gotra: ${request.family.gotra}`,
                          request.family.nukh && `Nukh: ${request.family.nukh}`,
                        ]
                          .filter(Boolean)
                          .join(' • ') || 'None provided'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Requester Information */}
            <div className="rounded-lg border border-navy-200 bg-white p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-2">
                Requested By
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-bold text-sm">
                  {requesterName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-navy-900">{requesterName}</p>
                  {request.requester?.email && (
                    <p className="text-xs text-navy-500">{request.requester.email}</p>
                  )}
                  <p className="text-[11px] text-navy-400">User ID: {request.requester_id}</p>
                </div>
              </div>
            </div>

            {/* Supporting Notes */}
            <div className="rounded-lg border border-navy-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-navy-500" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                  Supporting Notes / Evidence
                </h4>
              </div>
              {request.supporting_notes ? (
                <p className="text-sm text-navy-800 whitespace-pre-wrap rounded bg-navy-50 p-3 border border-navy-100">
                  {request.supporting_notes}
                </p>
              ) : (
                <p className="text-xs italic text-navy-400">No supporting notes were provided with this request.</p>
              )}
            </div>

            {/* Review History / Terminal Status details */}
            {request.status !== 'PENDING' && (
              <div className="rounded-lg border border-navy-200 bg-navy-50 p-4 text-xs">
                <h4 className="font-semibold uppercase tracking-wider text-navy-600 mb-2">
                  Review Outcome ({request.status})
                </h4>
                <div className="space-y-1 text-navy-700">
                  <p>
                    <span className="text-navy-500">Reviewed By:</span>{' '}
                    <span className="font-medium text-navy-900">
                      {request.reviewer?.display_name || request.reviewed_by || 'Moderator'}
                    </span>
                  </p>
                  {request.reviewed_at && (
                    <p>
                      <span className="text-navy-500">Reviewed At:</span>{' '}
                      <span className="font-medium text-navy-900">
                        {new Date(request.reviewed_at).toLocaleString()}
                      </span>
                    </p>
                  )}
                  {request.status === 'REJECTED' && request.rejection_reason && (
                    <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-800">
                      <span className="font-semibold">Rejection Reason: </span>
                      {request.rejection_reason}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-navy-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px]"
            >
              Close
            </Button>

            {request.status === 'PENDING' && (
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setIsRejectOpen(true)}
                  disabled={approve.isPending}
                  className="w-full sm:w-auto min-h-[44px] min-w-[44px]"
                >
                  Reject Request
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleApprove}
                  disabled={approve.isPending}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] min-w-[44px]"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {approve.isPending ? 'Approving...' : 'Approve & Verify'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      <VerificationReviewRejectModal
        requestId={request.id}
        targetName={targetName}
        entityType={request.entity_type}
        requesterName={requesterName}
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        onSuccess={() => {
          onActionComplete?.()
          onClose()
        }}
      />
    </>
  )
}
