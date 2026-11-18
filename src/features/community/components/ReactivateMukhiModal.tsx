/**
 * ReactivateMukhiModal Component
 *
 * Dedicated accessible modal for restoring an inactive Mukhi's authority:
 * - Mukhi Name
 * - Mukhi Unique ID
 * - Region / Gram
 * - "Cancel" and "Confirm Reactivation" action buttons
 *
 * SAFETY & INTEGRITY:
 * - Restores ACTIVE status without duplicating records or generating a new Mukhi ID.
 * - Restores MUKHI role on the linked user's profile.
 */

import React, { useState, useEffect } from 'react'
import {
  X,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  MapPin,
  Tag,
  CheckCircle2,
} from 'lucide-react'
import type { MukhiLeaderItem } from '../types'
import { reactivateMukhiAuthority } from '../services/community-mukhis.service'

export interface ReactivateMukhiModalProps {
  isOpen: boolean
  mukhi: MukhiLeaderItem | null
  onClose: () => void
  onSuccess: () => void
}

export const ReactivateMukhiModal: React.FC<ReactivateMukhiModalProps> = ({
  isOpen,
  mukhi,
  onClose,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
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

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await reactivateMukhiAuthority(mukhi.id)
      if (res.error) {
        setError(res.error.message)
        setIsSubmitting(false)
        return
      }

      setIsSubmitting(false)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate Mukhi authority.')
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-mukhi-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => {
        if (!isSubmitting) onClose()
      }}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-emerald-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-950 p-6 text-white relative">
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
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/30 text-emerald-300 border border-emerald-400/30">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Administrative Action
            </span>
          </div>

          <h2 id="reactivate-mukhi-title" className="text-xl font-bold text-white tracking-tight sm:text-2xl">
            Reactivate Mukhi Authority
          </h2>
          <p className="text-xs text-emerald-200/90 mt-1">
            Restore active leadership status and privileges to this community Mukhi.
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
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200">
                  {mukhi.authority_status || 'INACTIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* Confirmation Details */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Authority Restoration Guarantee</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Reactivating this Mukhi will set their authority status to <strong className="font-semibold text-emerald-700">ACTIVE</strong>, increment the official active Mukhi directory count, and restore the <strong className="font-semibold text-slate-900">MUKHI</strong> role for their linked account without duplicate records.
            </p>
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
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Reactivating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Confirm Reactivation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
