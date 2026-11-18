/**
 * MukhiDetailsModal component
 *
 * Dedicated accessible modal for viewing an individual Mukhi's profile details.
 * Implements approved KHATRI SARVANIYAT design:
 * - Solid dark navy fixed header (no gradients)
 * - Dynamic badges: Mukhi Unique ID, Official Mukhi, Verified Active Authority
 * - Full name with ellipsis truncation and accessible full-name title
 * - Independently scrollable white content body
 *   * Region / Gram / City card with purple MapPin
 *   * Community Lineage card (Gotra / Nukh) if present
 *   * Contact Information card with phone call action
 *   * Central Panchayat Authority Register metadata box
 * - Fixed footer with all action buttons visible (Edit Mukhi, Remove as Mukhi, Close)
 * - Viewport-constrained responsive height (100dvh / 100vh) preventing button clipping
 * - Full accessibility: Keyboard navigation (Escape, Tab), background scroll lock,
 *   touch targets >= 40px/44px, and rem-based typography scaling with text size controls.
 */

import { useEffect } from 'react'
import {
  X,
  MapPin,
  Phone,
  Shield,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Edit2,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
} from 'lucide-react'
import type { MukhiLeaderItem } from '../types'

interface MukhiDetailsModalProps {
  mukhi: MukhiLeaderItem | null
  isOpen: boolean
  onClose: () => void
  onEdit?: (mukhi: MukhiLeaderItem) => void
  onRemove?: (mukhi: MukhiLeaderItem) => void
  onDeactivate?: (mukhi: MukhiLeaderItem) => void
  onReactivate?: (mukhi: MukhiLeaderItem) => void
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
  onRemove,
  onDeactivate,
  onReactivate,
  isAdmin = false,
}: MukhiDetailsModalProps) {
  // Lock background body scroll while modal is active and handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !mukhi) return null

  const initials = getInitials(mukhi.name)
  const regionLocation = mukhi.gram || mukhi.city || 'Region not specified'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mukhi-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[580px] max-h-[calc(100dvh-24px)] max-h-[calc(100vh-24px)] sm:max-h-[calc(100dvh-32px)] sm:max-h-[calc(100vh-32px)] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200/90 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =========================================================================
            FIXED HEADER (Navy Background, No Gradients)
        ========================================================================= */}
        <div className="flex-shrink-0 bg-slate-950 p-5 sm:p-6 text-white relative border-b border-slate-900">
          {/* Top Badges & Close Button Row */}
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              {mukhi.mukhi_unique_id && (
                <span className="inline-flex items-center rounded-md bg-amber-400 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-950 shadow-xs shrink-0">
                  {mukhi.mukhi_unique_id}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-900/60 border border-blue-400/30 px-2.5 py-0.5 text-xs font-semibold text-blue-200 shrink-0">
                <Shield className="h-3.5 w-3.5 text-amber-300" />
                Official Mukhi
              </span>
              {mukhi.authority_status === 'REMOVED' ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/80 border border-slate-500/40 px-2.5 py-0.5 text-xs font-semibold text-slate-300 shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
                  Removed Authority
                </span>
              ) : mukhi.authority_status === 'INACTIVE' ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-950/70 border border-rose-500/40 px-2.5 py-0.5 text-xs font-semibold text-rose-300 shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  Inactive Authority
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Verified Active Authority
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>

          {/* Identity Row: Initials Avatar + Full Name + Regional Designation */}
          <div className="flex items-center gap-3.5 sm:gap-4 mt-2">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-bold text-lg sm:text-xl shadow-md border-2 border-white/20">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="mukhi-modal-title"
                title={mukhi.name}
                className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug break-words"
              >
                {mukhi.name}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5 font-medium truncate">
                {mukhi.designation || `${regionLocation} Regional Mukhi`}
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================================
            INDEPENDENTLY SCROLLABLE MAIN CONTENT (White Background, Clean Cards)
        ========================================================================= */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-white overscroll-contain">
          {/* Card 1: Region / Gram / City */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Region / Gram / City
            </div>
            <div className="mt-2 flex items-center gap-2 text-slate-900 font-bold text-base sm:text-lg">
              <MapPin className="h-5 w-5 text-indigo-600 shrink-0" />
              <span>{regionLocation}</span>
            </div>
            {mukhi.state && (
              <p className="mt-1 text-xs text-slate-500 pl-7">
                State: <span className="font-semibold text-slate-700">{mukhi.state}</span>
              </p>
            )}
          </div>

          {/* Optional Gotra & Nukh Lineage */}
          {(mukhi.gotra || mukhi.nukh) && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Community Lineage
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
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

          {/* Card 2: Contact Information */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Contact Information
            </div>

            {mukhi.phone ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-100">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Official Mobile Number</div>
                    <div className="text-base font-bold text-slate-900 font-mono tracking-wide">
                      {mukhi.phone}
                    </div>
                  </div>
                </div>

                <a
                  href={`tel:${mukhi.phone}`}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs transition active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  aria-label={`Call Mukhi at ${mukhi.phone}`}
                >
                  <Phone className="h-4 w-4" />
                  <span>Call {mukhi.phone}</span>
                </a>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Mobile number not listed</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    This official Mukhi record does not have a phone number in the central register.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Samaj Registry Verification Metadata */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Authority Register:</span>
              <span className="font-semibold text-slate-800 text-right">
                Shree Khatri Samaj Central Panchayat
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Source Record:</span>
              <span className="text-slate-700 font-medium text-right">
                118 Mukhi Official Register
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            FIXED FOOTER (White Background, Fixed at Bottom, Never Clipped)
        ========================================================================= */}
        <div className="flex-shrink-0 bg-white px-5 py-3.5 sm:px-6 sm:py-4 border-t border-slate-200/90 flex flex-wrap items-center justify-center gap-3">
          {isAdmin && onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onEdit(mukhi)
              }}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer"
            >
              <Edit2 className="h-4 w-4" />
              <span>Edit Mukhi</span>
            </button>
          )}

          {isAdmin && onRemove && mukhi.authority_status !== 'INACTIVE' && mukhi.authority_status !== 'REMOVED' && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onRemove(mukhi)
              }}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 px-4 py-2 text-xs sm:text-sm font-semibold text-red-600 shadow-xs focus:outline-none focus:ring-2 focus:ring-red-500 transition cursor-pointer"
            >
              <UserMinus className="h-4 w-4" />
              <span>Remove as Mukhi</span>
            </button>
          )}

          {isAdmin && !onRemove && onDeactivate && mukhi.authority_status !== 'INACTIVE' && mukhi.authority_status !== 'REMOVED' && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onDeactivate(mukhi)
              }}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 px-4 py-2 text-xs sm:text-sm font-semibold text-red-600 shadow-xs focus:outline-none focus:ring-2 focus:ring-red-500 transition cursor-pointer"
            >
              <ShieldAlert className="h-4 w-4" />
              <span>Deactivate Mukhi</span>
            </button>
          )}

          {isAdmin && onReactivate && (mukhi.authority_status === 'INACTIVE' || mukhi.authority_status === 'REMOVED') && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onReactivate(mukhi)
              }}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Reactivate Mukhi</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-5 py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-slate-400 transition cursor-pointer"
          >
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  )
}
