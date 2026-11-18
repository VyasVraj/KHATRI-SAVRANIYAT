/**
 * ContactThroughAdminModal Component
 *
 * Implements privacy-compliant, mediated administrative contact routing:
 * - Allows visitors and authenticated community members to request contact through Admin.
 * - Displays target person details (Name, Occupation, Family/Region).
 * - Pre-populates authenticated requester profile information where available.
 * - Captures mandatory contact purpose and optional message.
 * - Submits request with initial status PENDING for Admin / Super Admin moderation.
 * - Shows exact success message: "Your contact request has been submitted successfully. The administration team will review your request and assist you."
 * - STRICT PRIVACY: NEVER reveals the person's phone number, email address, or private details.
 */

import React, { useState, useEffect, useContext } from 'react'
import {
  X,
  Send,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Briefcase,
  Building,
  User,
  Mail,
} from 'lucide-react'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { useOccupationContactMutations } from '../hooks/useOccupationContactRequests'
import type { PublicOccupationItem } from '../services/public-occupation.service'

export interface ContactThroughAdminModalProps {
  isOpen: boolean
  onClose: () => void
  person: PublicOccupationItem | null
}

const ADMIN_CONTACT_PURPOSES = [
  'Professional Consultation',
  'Business Collaboration',
  'Career & Mentorship Guidance',
  'Employment Opportunity',
  'Community Project / Welfare Initiative',
  'Official Central Panchayat Coordination',
  'General Inquiry',
] as const

export const ContactThroughAdminModal: React.FC<ContactThroughAdminModalProps> = ({
  isOpen,
  onClose,
  person,
}) => {
  const auth = useContext(AuthContext)
  const user = auth?.user
  const profile = auth?.profile
  const { submitAdminContact } = useOccupationContactMutations()

  const [requesterName, setRequesterName] = useState('')
  const [requesterEmail, setRequesterEmail] = useState('')
  const [purpose, setPurpose] = useState<string>(ADMIN_CONTACT_PURPOSES[0])
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successResponse, setSuccessResponse] = useState<string | null>(null)

  // Pre-populate requester info from auth context
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null)
      setSuccessResponse(null)
      setRequesterName(profile?.display_name || user?.user_metadata?.full_name || '')
      setRequesterEmail(user?.email || '')
      setPurpose(ADMIN_CONTACT_PURPOSES[0])
      setMessage('')
    }
  }, [isOpen, user, profile])

  // Lock background scroll and handle Escape
  useEffect(() => {
    if (!isOpen) return
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = orig
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !person) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessResponse(null)

    if (!requesterName.trim()) {
      setErrorMessage('Please enter your full name.')
      return
    }

    if (!requesterEmail.trim()) {
      setErrorMessage('Please provide your registered email address.')
      return
    }

    if (!purpose.trim()) {
      setErrorMessage('Please select a contact purpose or reason.')
      return
    }

    try {
      const response = await submitAdminContact.mutateAsync({
        personId: person.person_id,
        visitorName: requesterName.trim(),
        visitorEmail: requesterEmail.trim(),
        purpose: purpose.trim(),
        message: message.trim(),
      })

      setSuccessResponse(
        response.message ||
          'Your contact request has been submitted successfully. The administration team will review your request and assist you.'
      )

      setTimeout(() => {
        onClose()
      }, 2400)
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Unable to submit contact request. Please try again.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-admin-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <h2 id="contact-admin-title" className="text-base font-bold text-white">
                Contact Through Admin
              </h2>
              <p className="text-xs text-slate-300">
                Mediated communication via Central Administration
              </p>
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

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* Target Person Read-Only Details */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Target Community Member (Fixed)
            </span>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{person.full_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-blue-800 font-medium">
                  <Briefcase className="h-3.5 w-3.5 text-blue-600" />
                  <span>{person.occupation}</span>
                </div>
              </div>
              {person.associated_mukhi_region && (
                <div className="text-right text-[11px] text-slate-500">
                  <Building className="h-3 w-3 inline mr-1 text-slate-400" />
                  <span>{person.associated_mukhi_region}</span>
                </div>
              )}
            </div>
          </div>

          {/* Privacy Notice Banner */}
          <div className="rounded-lg bg-indigo-50/70 border border-indigo-200/80 p-3 text-xs text-indigo-900 leading-relaxed">
            <p className="font-semibold text-indigo-950">Privacy-First Communication:</p>
            <p className="text-[11px] text-indigo-800 mt-0.5">
              Personal contact details remain protected. The Central Administration will review your inquiry, verify the context, and facilitate contact without exposing private records.
            </p>
          </div>

          {/* Success Banner */}
          {successResponse && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="font-medium leading-relaxed">{successResponse}</div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Requester Form Fields */}
          <div className="space-y-3 pt-1">
            {/* Requester Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="Enter your name"
                  required
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Requester Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  placeholder="e.g. yourname@example.com"
                  required
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Contact Purpose / Reason */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Purpose / Reason <span className="text-rose-500">*</span>
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
                className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {ADMIN_CONTACT_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Additional Message */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional Message / Details (Optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Briefly state your query or reason for connecting..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitAdminContact.isPending}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitAdminContact.isPending || Boolean(successResponse)}
              className="min-h-[40px] inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60 cursor-pointer"
            >
              {submitAdminContact.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
