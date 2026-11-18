/**
 * OccupationRequestReviewModal component
 *
 * Administrative modal for reviewing an individual occupation update request:
 * - Person Information (Person Name, Person ID, Family Name, Family ID)
 * - Current Occupation (Approved occupation)
 * - Requested Occupation (New occupation, submission date, status)
 * - Actions:
 *   1. Approve (Atomic DB update of persons.occupation, marked APPROVED, notification sent)
 *   2. Reject (Prompts for mandatory rejection reason, preserved current occupation, notification sent)
 *   3. Close
 */

import { useState } from 'react'
import {
  X,
  Briefcase,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Users,
  Calendar,
  Clock,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { useOccupationRequestMutations } from '@/features/people/hooks/useOccupationRequests'
import type { OccupationUpdateRequest } from '@/features/people/services/occupation-request.service'

interface OccupationRequestReviewModalProps {
  request: OccupationUpdateRequest | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function OccupationRequestReviewModal({
  request,
  isOpen,
  onClose,
  onSuccess,
}: OccupationRequestReviewModalProps) {
  const [rejectionMode, setRejectionMode] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const { approve, reject } = useOccupationRequestMutations()

  if (!isOpen || !request) return null

  const isPending = request.status === 'PENDING'
  const isApproved = request.status === 'APPROVED'
  const isRejected = request.status === 'REJECTED'

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleApprove = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const res = await approve.mutateAsync({ requestId: request.id })
      setSuccessMsg(res.message || 'Occupation request approved successfully.')
      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || 'Failed to approve request.'
      setErrorMsg(msg)
    }
  }

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!rejectionReason.trim()) {
      setErrorMsg('Please enter a rejection reason before confirming.')
      return
    }

    try {
      const res = await reject.mutateAsync({
        requestId: request.id,
        reason: rejectionReason.trim(),
      })
      setSuccessMsg(res.message || 'Occupation request rejected.')
      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || 'Failed to reject request.'
      setErrorMsg(msg)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-occupation-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40">
              <Briefcase className="h-5 w-5" />
            </span>
            <div>
              <h2 id="review-occupation-title" className="text-base font-bold text-white">
                Review Occupation Request
              </h2>
              <p className="text-xs text-slate-300 font-mono">
                ID: {request.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Request Status:
            </span>
            {isPending && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                Pending Review
              </span>
            )}
            {isApproved && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Approved
              </span>
            )}
            {isRejected && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800 border border-rose-200">
                <XCircle className="h-3.5 w-3.5 text-rose-600" />
                Rejected
              </span>
            )}
          </div>

          {/* Success Banner */}
          {successMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="font-semibold">{successMsg}</div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="font-semibold">{errorMsg}</div>
            </div>
          )}

          {/* Person & Family Information Grid */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Person & Family Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Person Name:
                </span>
                <p className="font-bold text-slate-900 text-sm">{request.person_name}</p>
                <p className="text-[11px] text-slate-400 font-mono">ID: {request.person_id}</p>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  Family Name:
                </span>
                <p className="font-bold text-slate-900 text-sm">{request.family_name}</p>
                {request.family_id && (
                  <p className="text-[11px] text-slate-400 font-mono">ID: {request.family_id}</p>
                )}
              </div>
            </div>
          </div>

          {/* Occupation Comparison Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Occupation Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Current */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Current Approved Occupation
                </span>
                <span className="text-sm font-bold text-slate-700 mt-1 block">
                  {request.current_occupation}
                </span>
              </div>

              {/* Requested */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">
                  New Requested Occupation
                </span>
                <span className="text-sm font-bold text-blue-900 mt-1 block">
                  {request.requested_occupation}
                </span>
              </div>
            </div>
          </div>

          {/* Submission & Review Metadata */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-600 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Submitted Date:
              </span>
              <span className="font-semibold text-slate-800">{formatDate(request.created_at)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Submitted By:</span>
              <span className="font-semibold text-slate-800">
                {request.submitted_by_name} {request.submitted_by_email ? `(${request.submitted_by_email})` : ''}
              </span>
            </div>

            {request.reviewed_at && (
              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500">Reviewed By:</span>
                <span className="font-semibold text-slate-800">
                  {request.reviewer_name || 'Admin'} on {formatDate(request.reviewed_at)}
                </span>
              </div>
            )}

            {request.rejection_reason && (
              <div className="border-t border-rose-200 pt-2 text-rose-800 bg-rose-50/60 p-2 rounded">
                <span className="font-bold block">Rejection Reason:</span>
                <p className="mt-0.5 text-xs leading-relaxed">{request.rejection_reason}</p>
              </div>
            )}
          </div>

          {/* Rejection Form Input */}
          {rejectionMode && isPending && (
            <form onSubmit={handleReject} className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 animate-in fade-in">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Specify Rejection Reason (Required)</span>
              </div>
              <textarea
                value={rejectionReason}
                onChange={(e) => {
                  setRejectionReason(e.target.value)
                  setErrorMsg(null)
                }}
                rows={3}
                placeholder="State clearly why this occupation update request cannot be approved..."
                className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                required
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectionMode(false)
                    setRejectionReason('')
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel Rejection
                </button>
                <button
                  type="submit"
                  disabled={reject.isPending || !rejectionReason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {reject.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Rejecting...</span>
                    </>
                  ) : (
                    <span>Confirm Rejection</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Close
          </button>

          {isPending && !rejectionMode && !successMsg && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setRejectionMode(true)}
                disabled={approve.isPending || reject.isPending}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
              >
                <XCircle className="h-4 w-4" />
                <span>Reject</span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                disabled={approve.isPending || reject.isPending}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60 cursor-pointer"
              >
                {approve.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Approve Request</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
