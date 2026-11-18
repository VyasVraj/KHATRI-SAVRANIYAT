/**
 * OccupationContactRequestDetailModal Component
 *
 * Administrative modal for inspecting and managing occupation contact requests:
 * - Full requester details (Name, Contact, Account info)
 * - Target person details (Name, Occupation, Family, Mukhi)
 * - Inquiry details (Purpose, Message, Submission timestamp)
 * - Administrative actions:
 *   1. Mark Under Review
 *   2. Approve (Coordinates mediated contact without exposing private records)
 *   3. Reject (With mandatory rejection reason)
 *   4. Mark Resolved
 *   5. Save internal administrative note
 */

import React, { useState, useEffect } from 'react'
import {
  X,
  Mail,
  User,
  Briefcase,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Shield,
  Loader2,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import { useOccupationContactMutations } from '@/features/people/hooks/useOccupationContactRequests'
import type {
  AdminOccupationContactRequestItem,
  OccupationContactStatus,
} from '@/features/people/services/public-occupation.service'

interface OccupationContactRequestDetailModalProps {
  request: AdminOccupationContactRequestItem | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const OccupationContactRequestDetailModal: React.FC<
  OccupationContactRequestDetailModalProps
> = ({ request, isOpen, onClose, onSuccess }) => {
  const { updateStatus } = useOccupationContactMutations()

  const [adminNote, setAdminNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    if (request && isOpen) {
      setAdminNote(request.admin_note || '')
      setRejectionReason(request.rejection_reason || '')
      setShowRejectInput(false)
      setFeedbackMessage(null)
    }
  }, [request, isOpen])

  if (!isOpen || !request) return null

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
  }

  const handleAction = async (status: OccupationContactStatus) => {
    setFeedbackMessage(null)

    if (status === 'REJECTED' && !rejectionReason.trim()) {
      setShowRejectInput(true)
      setFeedbackMessage({
        type: 'error',
        text: 'Please provide a rejection reason before rejecting.',
      })
      return
    }

    try {
      const res = await updateStatus.mutateAsync({
        requestId: request.id,
        status,
        adminNote: adminNote.trim() || undefined,
        rejectionReason: status === 'REJECTED' ? rejectionReason.trim() : undefined,
      })

      setFeedbackMessage({
        type: 'success',
        text: res.message || `Request updated to ${status}.`,
      })

      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1400)
      }
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: (err as Error).message || 'Failed to update request status.',
      })
    }
  }

  const handleSaveNoteOnly = async () => {
    setFeedbackMessage(null)
    try {
      const res = await updateStatus.mutateAsync({
        requestId: request.id,
        status: request.status,
        adminNote: adminNote.trim(),
      })
      setFeedbackMessage({
        type: 'success',
        text: res.message || 'Administrative note saved successfully.',
      })
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: (err as Error).message || 'Failed to save administrative note.',
      })
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="contact-detail-title" className="text-base font-bold text-white">
                  Occupation Contact Request
                </h2>
                <span className="inline-flex items-center rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-400/30">
                  {request.channel} Channel
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono">ID: {request.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto text-xs">
          {/* Status Row */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              Current Status:
            </span>
            <div>
              {request.status === 'PENDING' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                  <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                  Pending Review
                </span>
              )}
              {request.status === 'UNDER_REVIEW' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                  Under Review
                </span>
              )}
              {request.status === 'APPROVED' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Approved
                </span>
              )}
              {request.status === 'REJECTED' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800 border border-rose-200">
                  <XCircle className="h-3.5 w-3.5 text-rose-600" />
                  Rejected
                </span>
              )}
              {request.status === 'RESOLVED' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-800 border border-purple-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                  Resolved
                </span>
              )}
            </div>
          </div>

          {/* Feedback Banner */}
          {feedbackMessage && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs font-semibold ${
                feedbackMessage.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              )}
              <div>{feedbackMessage.text}</div>
            </div>
          )}

          {/* Requester & Target Person Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Requester Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Requester Details
              </span>
              <div className="space-y-1">
                <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  {request.visitor_name}
                </p>
                <p className="text-slate-600 font-medium flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {request.visitor_contact}
                </p>
                {request.requester_user_id && (
                  <p className="text-[10px] text-slate-400 font-mono">
                    User UID: {request.requester_user_id}
                  </p>
                )}
              </div>
            </div>

            {/* Target Person Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Target Community Member
              </span>
              <div className="space-y-1">
                <p className="font-bold text-slate-900 text-sm">{request.person_name}</p>
                <p className="text-blue-800 font-semibold flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-blue-600" />
                  {request.occupation}
                </p>
                <div className="flex flex-col gap-0.5 pt-1 text-[11px] text-slate-600">
                  <span>Family: <strong className="text-slate-800">{request.family_name}</strong></span>
                  <span>Mukhi: <strong className="text-slate-800">{request.associated_mukhi_name}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Request Reason & Message Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Inquiry Details
            </span>
            <div className="space-y-2">
              <div>
                <span className="text-slate-400 text-[11px] block">Contact Purpose:</span>
                <span className="font-bold text-slate-900 text-sm block mt-0.5">
                  {request.purpose}
                </span>
              </div>
              {request.message ? (
                <div>
                  <span className="text-slate-400 text-[11px] block">Message from Requester:</span>
                  <div className="mt-1 rounded-lg bg-slate-50 border border-slate-100 p-3 text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                    {request.message}
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">No additional message provided.</p>
              )}
              <div className="flex items-center gap-1 text-[11px] text-slate-400 pt-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>Submitted on {formatDate(request.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Rejection Reason Display if Rejected */}
          {request.rejection_reason && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-rose-900 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Rejection Reason:
              </span>
              <p className="text-xs leading-relaxed text-rose-800">{request.rejection_reason}</p>
            </div>
          )}

          {/* Reviewer Audit Details */}
          {request.reviewed_at && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Reviewed by: <strong className="text-slate-700">{request.reviewer_name || 'Admin'}</strong></span>
              <span>Reviewed on: {formatDate(request.reviewed_at)}</span>
            </div>
          )}

          {/* Rejection Input Form if Active */}
          {showRejectInput && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2.5 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-bold text-rose-900">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Specify Rejection Reason (Required)</span>
              </div>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                placeholder="State clearly why this contact request cannot be approved..."
                className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectInput(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleAction('REJECTED')}
                  disabled={updateStatus.isPending || !rejectionReason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {updateStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </div>
          )}

          {/* Internal Administrative Note */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                Internal Administrative Note
              </span>
              <button
                type="button"
                onClick={handleSaveNoteOnly}
                disabled={updateStatus.isPending}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
              >
                Save Note
              </button>
            </div>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
              placeholder="Add internal administrative notes or coordination logs here (visible to admins only)..."
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Close
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mark Under Review */}
            {request.status === 'PENDING' && (
              <button
                type="button"
                onClick={() => handleAction('UNDER_REVIEW')}
                disabled={updateStatus.isPending}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Mark Under Review</span>
              </button>
            )}

            {/* Reject */}
            {request.status !== 'REJECTED' && !showRejectInput && (
              <button
                type="button"
                onClick={() => setShowRejectInput(true)}
                disabled={updateStatus.isPending}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Reject</span>
              </button>
            )}

            {/* Approve */}
            {request.status !== 'APPROVED' && request.status !== 'RESOLVED' && (
              <button
                type="button"
                onClick={() => handleAction('APPROVED')}
                disabled={updateStatus.isPending}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-xs transition disabled:opacity-60 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Approve Request</span>
              </button>
            )}

            {/* Resolve */}
            {request.status !== 'RESOLVED' && (
              <button
                type="button"
                onClick={() => handleAction('RESOLVED')}
                disabled={updateStatus.isPending}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white shadow-xs transition disabled:opacity-60 cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5 text-amber-300" />
                <span>Mark Resolved</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
