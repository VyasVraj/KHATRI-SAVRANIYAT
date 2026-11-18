/**
 * FamilyClaimsReviewSection Component
 * Review queue for complete family management access claims (Feature 2 Section D).
 *
 * Implements:
 * - Reviewable by Mukhi (scoped to their region), Admin, and Super Admin.
 * - Displays: Family details, existing Family Head, requester profile & email, relationship, reason, submission date.
 * - Actions: "Approve Request", "Reject Request", "View Family Record".
 * - Modal confirmations for approval and rejection with reviewer notes.
 */

import React, { useState, useEffect } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Home,
  User,
  Clock,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getFamilyClaimsForReview,
  approveFamilyClaim,
  rejectFamilyClaim,
  type FamilyClaim,
} from '../services/family-claims.service'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

export const FamilyClaimsReviewSection: React.FC = () => {
  const [claims, setClaims] = useState<FamilyClaim[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Selected claim for review action
  const [selectedClaim, setSelectedClaim] = useState<FamilyClaim | null>(null)
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null)
  const [reviewerComments, setReviewerComments] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const loadClaims = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    const res = await getFamilyClaimsForReview('PENDING')
    if (res.error) {
      setErrorMessage(res.error.message)
    } else {
      setClaims(res.data || [])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadClaims()
  }, [])

  const handleActionConfirm = async () => {
    if (!selectedClaim || !actionType) return

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      if (actionType === 'APPROVE') {
        const res = await approveFamilyClaim(selectedClaim.id, reviewerComments)
        if (res.error) {
          setErrorMessage(res.error.message)
          setIsProcessing(false)
          return
        }
        setActionSuccess('Family claim approved. Management access granted.')
      } else {
        if (!reviewerComments.trim()) {
          setErrorMessage('Please provide a reason for rejecting the claim.')
          setIsProcessing(false)
          return
        }
        const res = await rejectFamilyClaim(selectedClaim.id, reviewerComments)
        if (res.error) {
          setErrorMessage(res.error.message)
          setIsProcessing(false)
          return
        }
        setActionSuccess('Family claim request rejected.')
      }

      setSelectedClaim(null)
      setActionType(null)
      setReviewerComments('')
      setIsProcessing(false)
      loadClaims()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed.')
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
          <p className="text-xs">Loading pending family claims...</p>
        </div>
      ) : claims.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-900">No Pending Family Claims</h3>
          <p className="text-xs text-slate-500 mt-1">
            All submitted family management claims in your jurisdiction have been reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="rounded-xl border border-navy-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all space-y-3"
            >
              {/* Header: Family Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Home className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-navy-900">
                      {claim.family?.family_name || 'Family Unit'}
                    </h4>
                    <p className="text-xs text-slate-500">
                      Location: {[claim.family?.city, claim.family?.state].filter(Boolean).join(', ') || 'Unspecified'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200">
                    <Clock className="h-3 w-3" />
                    Pending Review
                  </span>
                  <Link
                    to={ROUTES.FAMILY_DETAIL(claim.family_id)}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800"
                  >
                    <span>View Family</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* Requester & Claim Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-slate-500 font-medium">Claimant:</span>
                  <div className="font-semibold text-slate-900 mt-0.5 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span>{claim.requester?.display_name || claim.requester?.email || 'Registered User'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {claim.requester?.email}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Claimed Relationship:</span>
                  <div className="font-bold text-brand-900 mt-0.5">
                    {claim.requested_relationship}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Submitted: {new Date(claim.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/60">
                <span className="font-bold text-slate-900 block mb-1">Reason for Claim:</span>
                <p className="leading-relaxed whitespace-pre-wrap">{claim.reason}</p>
                {claim.supporting_document_reference && (
                  <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
                    <strong>Supporting references:</strong> {claim.supporting_document_reference}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSelectedClaim(claim)
                    setActionType('REJECT')
                    setReviewerComments('')
                  }}
                  className="text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject Request
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedClaim(claim)
                    setActionType('APPROVE')
                    setReviewerComments('')
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Approve Request
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Action Confirmation Modal */}
      {selectedClaim && actionType && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              {actionType === 'APPROVE' ? 'Approve Family Management Claim' : 'Reject Family Claim'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {actionType === 'APPROVE'
                ? `Grant management access for family "${selectedClaim.family?.family_name || ''}" to ${selectedClaim.requester?.display_name || 'the claimant'}. The existing family head and members will remain unchanged.`
                : `Reject the management claim for family "${selectedClaim.family?.family_name || ''}". Please provide a clear rejection note.`}
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                {actionType === 'APPROVE' ? 'Reviewer Comments (Optional)' : 'Rejection Reason (Required)'}
              </label>
              <textarea
                rows={3}
                required={actionType === 'REJECT'}
                placeholder={
                  actionType === 'APPROVE'
                    ? 'Add any administrative notes regarding this approval...'
                    : 'Explain why this claim request cannot be approved...'
                }
                value={reviewerComments}
                onChange={(e) => setReviewerComments(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedClaim(null)
                  setActionType(null)
                }}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleActionConfirm}
                disabled={isProcessing || (actionType === 'REJECT' && !reviewerComments.trim())}
                className={
                  actionType === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
                    : 'bg-rose-600 hover:bg-rose-700 text-white font-bold'
                }
              >
                {isProcessing ? 'Processing...' : actionType === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
