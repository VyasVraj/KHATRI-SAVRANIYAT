/**
 * ContactThroughMukhiModal Component
 *
 * Implements privacy-compliant, controlled contact routing:
 * - Public visitors and community members can request contact with a professional.
 * - Routes requests to the associated active Mukhi or platform Admin leadership.
 * - NEVER reveals the person's phone number, email address, or private details.
 */

import React, { useState } from 'react'
import {
  X,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UserCheck,
  Briefcase,
  Building,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import {
  submitOccupationContactRequest,
  type PublicOccupationItem,
} from '../services/public-occupation.service'

export interface ContactThroughMukhiModalProps {
  isOpen: boolean
  onClose: () => void
  person: PublicOccupationItem | null
  onSwitchToAdmin?: (person: PublicOccupationItem) => void
}

const INQUIRY_PURPOSES = [
  'Professional Consultation',
  'Business Collaboration',
  'Career & Mentorship Guidance',
  'Employment Opportunity',
  'Community Service / Initiative',
  'General Inquiry',
] as const

export const ContactThroughMukhiModal: React.FC<ContactThroughMukhiModalProps> = ({
  isOpen,
  onClose,
  person,
  onSwitchToAdmin,
}) => {
  const [visitorName, setVisitorName] = useState('')
  const [visitorContact, setVisitorContact] = useState('')
  const [purpose, setPurpose] = useState<string>(INQUIRY_PURPOSES[0])
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successResponse, setSuccessResponse] = useState<string | null>(null)

  if (!isOpen || !person) return null

  const mukhiAssigned = Boolean(person.associated_mukhi_name)
  const routedAuthorityName = person.associated_mukhi_name || 'Central Community Administration'
  const routedAuthorityRegion = person.associated_mukhi_region || 'Community Central Panchayat'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!visitorName.trim()) {
      setErrorMessage('Please enter your full name.')
      return
    }

    if (!visitorContact.trim()) {
      setErrorMessage('Please provide your phone number or email address to receive a response.')
      return
    }

    if (!message.trim()) {
      setErrorMessage('Please write your message or inquiry.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await submitOccupationContactRequest({
        personId: person.person_id,
        personName: person.full_name,
        associatedMukhiId: person.associated_mukhi_id,
        visitorName: visitorName.trim(),
        visitorContact: visitorContact.trim(),
        purpose,
        message: message.trim(),
      })

      setSuccessResponse(
        response.message || 'Your contact request has been sent to the leadership for review.'
      )
    } catch (err) {
      setErrorMessage((err as Error).message || 'Unable to submit contact request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetAndClose = () => {
    setVisitorName('')
    setVisitorContact('')
    setMessage('')
    setErrorMessage(null)
    setSuccessResponse(null)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy-950/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-navy-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Fixed Header */}
        <div className="flex items-center justify-between border-b border-navy-100 bg-white px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-brand-300">
              <Send className="h-4 w-4" />
            </span>
            <div>
              <h2 id="contact-modal-title" className="text-base font-bold text-navy-900">
                Contact Through {mukhiAssigned ? 'Mukhi' : 'Admin'}
              </h2>
              <p className="text-[11px] text-navy-500">
                Facilitated community connection without disclosing private numbers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Target Person & Routing Card */}
          <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-navy-500 block">
                  Intended Recipient
                </span>
                <span className="text-sm font-bold text-navy-900">{person.full_name}</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
                    <Briefcase className="h-3 w-3 text-blue-700" />
                    {person.occupation}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-navy-500 block">
                  Facilitating Authority
                </span>
                <span className="text-xs font-semibold text-brand-900 flex items-center justify-end gap-1">
                  {mukhiAssigned ? (
                    <UserCheck className="h-3.5 w-3.5 text-brand-600" />
                  ) : (
                    <Building className="h-3.5 w-3.5 text-navy-600" />
                  )}
                  {routedAuthorityName}
                </span>
                <span className="text-[10px] text-navy-500 block">{routedAuthorityRegion}</span>
              </div>
            </div>

            {!mukhiAssigned && onSwitchToAdmin && (
              <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-200 flex items-center justify-between gap-2 text-amber-900 text-xs">
                <span>No regional Mukhi is assigned to this family.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onSwitchToAdmin(person)}
                  className="bg-white hover:bg-amber-100 text-amber-900 border-amber-300 text-xs shrink-0"
                >
                  Switch to Admin
                </Button>
              </div>
            )}

            <div className="rounded-lg bg-white p-2.5 border border-navy-200/80 flex items-start gap-2 text-navy-600">
              <ShieldCheck className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                <strong>Privacy Guaranteed:</strong> Direct personal contact details (phone, email, residence) are never displayed or shared directly. Your message is delivered to the authorized Mukhi/Admin to coordinate communication.
              </p>
            </div>
          </div>

          {successResponse ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
              <h3 className="text-sm font-bold text-emerald-900">Request Submitted Successfully</h3>
              <p className="text-xs text-emerald-800 leading-normal">{successResponse}</p>
              <div className="pt-2">
                <Button variant="primary" size="sm" onClick={handleResetAndClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form id="occupation-contact-form" onSubmit={handleSubmit} className="space-y-3.5">
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 flex items-center gap-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-navy-900 uppercase tracking-wide mb-1">
                  Your Full Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="e.g. Ramesh Khatri"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-navy-900 uppercase tracking-wide mb-1">
                  Your Phone Number or Email <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={visitorContact}
                  onChange={(e) => setVisitorContact(e.target.value)}
                  placeholder="e.g. +91 98765 43210 or yourname@example.com"
                  required
                  disabled={isSubmitting}
                />
                <span className="text-[10px] text-navy-500 mt-0.5 block">
                  The Mukhi or recipient will use this to contact you back.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-navy-900 uppercase tracking-wide mb-1">
                  Purpose of Inquiry
                </label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
                >
                  {INQUIRY_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-navy-900 uppercase tracking-wide mb-1">
                  Message / Details of Your Inquiry <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Briefly describe what you would like to discuss or connect regarding..."
                  required
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-navy-200 bg-white p-3 text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500 leading-normal"
                />
              </div>
            </form>
          )}
        </div>

        {/* Fixed Footer */}
        {!successResponse && (
          <div className="flex items-center justify-end gap-2.5 border-t border-navy-100 bg-white px-5 py-3.5 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleResetAndClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="occupation-contact-form"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              className="flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Send Request</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
