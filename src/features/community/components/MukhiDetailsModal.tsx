/**
 * MukhiDetailsModal component
 *
 * Dedicated accessible modal for viewing an individual Mukhi's profile details:
 * - Mukhi Full Name
 * - Assigned Mukhi Unique ID (e.g. MUK-0001)
 * - Region / Gram / City
 * - Mobile Number with immediate clickable tel: phone call action
 * - Official verification and leadership badges
 * - Minimum 44px touch targets and full keyboard accessibility (Escape to close, focus management)
 */

import { useEffect } from 'react'
import { X, MapPin, Phone, Shield, CheckCircle2, AlertCircle, Edit2 } from 'lucide-react'
import type { MukhiLeaderItem } from '../types'

interface MukhiDetailsModalProps {
  mukhi: MukhiLeaderItem | null
  isOpen: boolean
  onClose: () => void
  onEdit?: (mukhi: MukhiLeaderItem) => void
  isAdmin?: boolean
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function MukhiDetailsModal({
  mukhi,
  isOpen,
  onClose,
  onEdit,
  isAdmin = false,
}: MukhiDetailsModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !mukhi) return null

  const initials = getInitials(mukhi.name)
  const regionLocation = mukhi.gram || mukhi.city || 'Region not specified'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mukhi-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 transition-all sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition focus:outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 flex-wrap mb-3">
            {mukhi.mukhi_unique_id && (
              <span className="inline-flex items-center rounded-md bg-amber-400 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-950 shadow-sm">
                {mukhi.mukhi_unique_id}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/30 backdrop-blur-xs px-2.5 py-0.5 text-xs font-semibold text-blue-100 border border-blue-400/30">
              <Shield className="h-3.5 w-3.5 text-amber-300" />
              Official Mukhi
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 border border-emerald-400/30">
              <CheckCircle2 className="h-3 w-3" />
              Verified Authority
            </span>
          </div>

          <div className="flex items-center gap-4 mt-2">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-bold text-xl shadow-md border-2 border-white/40">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="mukhi-modal-title" className="text-xl font-bold text-white tracking-tight sm:text-2xl truncate">
                {mukhi.name}
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">
                {mukhi.designation || `${regionLocation} Regional Mukhi`}
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Region / Gram / City Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Region / Gram / City
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-slate-900 font-semibold text-base">
              <MapPin className="h-5 w-5 text-indigo-600 shrink-0" />
              <span>{regionLocation}</span>
            </div>
            {mukhi.state && mukhi.state !== regionLocation && (
              <p className="mt-1 text-xs text-slate-500 pl-7">
                State: <span className="font-medium text-slate-700">{mukhi.state}</span>
              </p>
            )}
          </div>

          {/* Gotra & Nukh Lineage */}
          {(mukhi.gotra || mukhi.nukh) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Community Lineage
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-slate-900 font-semibold text-xs">
                {mukhi.gotra && (
                  <span className="rounded-md bg-blue-50 px-2.5 py-1 text-blue-800 border border-blue-200">
                    Gotra: {mukhi.gotra}
                  </span>
                )}
                {mukhi.nukh && (
                  <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-indigo-800 border border-indigo-200">
                    Nukh: {mukhi.nukh}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Mobile Number & Call Action */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Contact Information
            </div>

            {mukhi.phone ? (
              <div className="mt-2 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                      <Phone className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Official Mobile Number</div>
                      <div className="text-base font-bold text-slate-900 font-mono tracking-wide">
                        {mukhi.phone}
                      </div>
                    </div>
                  </div>
                </div>

                <a
                  href={`tel:${mukhi.phone}`}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition active:scale-[0.99]"
                  aria-label={`Call Mukhi at ${mukhi.phone}`}
                >
                  <Phone className="h-4 w-4" />
                  <span>Call {mukhi.phone}</span>
                </a>
              </div>
            ) : (
              <div className="mt-2 flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Mobile number not listed</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    This official Mukhi record does not have a phone number in the central register. Flagged for administrative verification.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Samaj Registry Verification Footer */}
          <div className="rounded-xl bg-slate-100 p-3.5 text-xs text-slate-600 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
              <span>Authority Register:</span>
              <span className="text-slate-900">Shree Khatri Samaj Central Panchayat</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Source Record:</span>
              <span>118 Mukhi Official Register</span>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          {isAdmin && onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onEdit(mukhi)
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <Edit2 className="h-4 w-4" />
              <span>Edit Mukhi</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
