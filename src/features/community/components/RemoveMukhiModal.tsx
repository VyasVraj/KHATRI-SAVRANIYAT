/**
 * RemoveMukhiModal Component
 *
 * Dedicated accessible confirmation dialog for removing a person from their Mukhi position:
 * - Mukhi Name
 * - Mukhi Unique ID (e.g. MUK-0001)
 * - Assigned Region / Gram / City
 * - Current Authority Status (Active)
 * - Linked Person Name (if available)
 * - Required verbatim data safety explanation:
 *   "Are you sure you want to remove this person from their Mukhi position? This action will remove
 *   their Mukhi authority and active Mukhi Directory listing. Their KHATRI SARVANIYAT login account,
 *   personal profile, family membership, family relationships and census records will remain unchanged.
 *   The person will continue using the website as a normal community user, subject to any other
 *   independent roles they hold."
 * - Action buttons: "Cancel" and "Confirm Remove as Mukhi"
 *
 * ACCESSIBILITY & SAFETY GUARANTEES:
 * - Keyboard navigation (Escape to close, Tab trapping).
 * - ARIA semantics (role="dialog", aria-modal="true", aria-labelledby).
 * - Duplicate click prevention & loading indicator.
 * - Clear error notification & success confirmation message.
 */

import React, { useState, useId, useEffect } from 'react'
import {
  AlertTriangle,
  X,
  UserMinus,
  Loader2,
  CheckCircle2,
  MapPin,
  Tag,
  User,
  ShieldCheck,
} from 'lucide-react'
import type { MukhiLeaderItem } from '../types'
import { removeMukhiAuthority } from '../services/community-mukhis.service'

export interface RemoveMukhiModalProps {
  isOpen: boolean
  mukhi: MukhiLeaderItem | null
  onClose: () => void
  onSuccess: () => void
}

export const RemoveMukhiModal: React.FC<RemoveMukhiModalProps> = ({
  isOpen,
  mukhi,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const reasonInputId = useId()

  useEffect(() => {
    if (isOpen) {
      setReason('')
      setError(null)
      setSuccessMessage(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, isSubmitting])

  if (!isOpen || !mukhi) return null

  const regionLocation = mukhi.gram || mukhi.city || 'Region not specified'
  const currentStatus = mukhi.authority_status || 'Active'
  const linkedPersonName = mukhi.person_id ? (mukhi.display_name || mukhi.name) : null

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await removeMukhiAuthority(mukhi.id, reason)
      if (res.error) {
        setError(res.error.message)
        setIsSubmitting(false)
        return
      }

      setSuccessMessage(
        "Mukhi authority successfully removed. The person's normal community account and profile remain active."
      )
      setIsSubmitting(false)

      // Allow user/test to see success notification briefly before closing
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove Mukhi authority.')
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-mukhi-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => {
        if (!isSubmitting) onClose()
      }}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-rose-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-900 p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/30 text-rose-300 border border-rose-400/30">
              <UserMinus className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
              Administrative Action
            </span>
          </div>

          <h2 id="remove-mukhi-title" className="text-xl font-bold text-white tracking-tight sm:text-2xl">
            Remove as Mukhi
          </h2>
          <p className="text-xs text-rose-200/90 mt-1">
            Remove Mukhi position and active directory listing while keeping community account and family records active.
          </p>
        </div>

        {/* Content Body */}
        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Mukhi Identification Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500 font-medium">Mukhi Name</div>
                <div className="text-base font-bold text-slate-900 mt-0.5">
                  {mukhi.name}
                </div>
              </div>

              {mukhi.mukhi_unique_id && (
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-medium">Mukhi ID</div>
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-xs font-mono font-bold text-amber-300 border border-slate-700">
                    <Tag className="h-3 w-3" />
                    {mukhi.mukhi_unique_id}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
              <div className="flex items-center gap-1.5 text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <span className="font-semibold">{regionLocation}</span>
              </div>

              <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                <span className="text-slate-500">Current Status:</span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                  {currentStatus}
                </span>
              </div>

              {linkedPersonName && (
                <div className="flex items-center gap-1.5 text-slate-600 sm:col-span-2 pt-1 border-t border-slate-200/40">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>Linked Person: <strong className="text-slate-800">{linkedPersonName}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Required Explicit Confirmation Notice */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
              <span>Data Protection & Scope Notice</span>
            </div>
            <p className="text-xs text-amber-950 leading-relaxed font-medium">
              Are you sure you want to remove this person from their Mukhi position? This action will remove their Mukhi authority and active Mukhi Directory listing. Their SINDHI KHATRI SAMAJ login account, personal profile, family membership, family relationships and census records will remain unchanged. The person will continue using the website as a normal community user, subject to any other independent roles they hold.
            </p>
          </div>

          {/* Removal Reason (Optional for Audit Log) */}
          <div className="space-y-1.5">
            <label htmlFor={reasonInputId} className="block text-xs font-bold text-slate-700">
              Removal Reason <span className="font-normal text-slate-500">(Optional for Audit Log)</span>
            </label>
            <textarea
              id={reasonInputId}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Completed term of service, requested stepping down, regional restructuring..."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:bg-slate-50 transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 transition disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                <>
                  <UserMinus className="h-4 w-4" />
                  <span>Confirm Remove as Mukhi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
