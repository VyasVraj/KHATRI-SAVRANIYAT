/**
 * DeactivateMukhiModal Component
 *
 * Dedicated accessible confirmation dialog for deactivating a Mukhi's authority:
 * - Mukhi Name
 * - Mukhi Unique ID (e.g. MUK-0001)
 * - Assigned Region / Gram
 * - Current Authority Status (e.g. ACTIVE)
 * - Optional deactivation reason input field
 * - Action buttons: "Cancel" and "Confirm Deactivation"
 *
 * SAFETY & INTEGRITY GUARANTEES:
 * - Clearly explains that deactivation preserves original records:
 *   Auth user account, census person profile, family relationships, tree links, Gotra, and Nukh.
 * - Explains that leadership privileges are immediately revoked and the linked user is downgraded to MEMBER.
 */

import React, { useState, useId, useEffect } from 'react'
import {
  AlertTriangle,
  X,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  MapPin,
  Tag,
} from 'lucide-react'
import type { MukhiLeaderItem } from '../types'
import { deactivateMukhiAuthority } from '../services/community-mukhis.service'

export interface DeactivateMukhiModalProps {
  isOpen: boolean
  mukhi: MukhiLeaderItem | null
  onClose: () => void
  onSuccess: () => void
}

export const DeactivateMukhiModal: React.FC<DeactivateMukhiModalProps> = ({
  isOpen,
  mukhi,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reasonInputId = useId()

  useEffect(() => {
    if (isOpen) {
      setReason('')
      setError(null)
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
  const currentStatus = mukhi.authority_status || 'ACTIVE'

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await deactivateMukhiAuthority(mukhi.id, reason)
      if (res.error) {
        setError(res.error.message)
        setIsSubmitting(false)
        return
      }

      setIsSubmitting(false)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate Mukhi authority.')
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-mukhi-title"
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
        <div className="bg-gradient-to-r from-rose-900 via-rose-950 to-slate-950 p-6 text-white relative">
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
              <ShieldAlert className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
              Administrative Action
            </span>
          </div>

          <h2 id="deactivate-mukhi-title" className="text-xl font-bold text-white tracking-tight sm:text-2xl">
            Deactivate Mukhi Authority
          </h2>
          <p className="text-xs text-rose-200/90 mt-1">
            Revoke administrative Mukhi leadership privileges while preserving all census and personal records.
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
            </div>
          </div>

          {/* Preservation & Security Notice */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Data Preservation Guarantee</span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              Deactivating this Mukhi will remove their Mukhi authority and Mukhi Directory listing. Their normal website account, personal profile, family records and census information will remain unchanged.
            </p>
          </div>

          {/* Deactivation Reason (Optional) */}
          <div className="space-y-1.5">
            <label htmlFor={reasonInputId} className="block text-xs font-bold text-slate-700">
              Deactivation Reason <span className="font-normal text-slate-500">(Optional for Audit Log)</span>
            </label>
            <textarea
              id={reasonInputId}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Completed tenure, relocated from region, requested authority retirement..."
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
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 transition active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Deactivating...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4" />
                  <span>Confirm Deactivation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
