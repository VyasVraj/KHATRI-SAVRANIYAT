import React, { useState } from 'react'
import {
  X,
  HeartHandshake,
  AlertCircle,
  CheckCircle2,
  Shield,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import { PhoneInputWithCountryCode } from '@/components/forms/PhoneInputWithCountryCode'
import {
  submitEmergencyBloodContact,
  type BloodDirectoryMember,
} from '../services/blood-directory.service'

export interface ContactFamilyHeadBloodModalProps {
  isOpen: boolean
  onClose: () => void
  member: BloodDirectoryMember | null
}

export const ContactFamilyHeadBloodModal: React.FC<ContactFamilyHeadBloodModalProps> = ({
  isOpen,
  onClose,
  member,
}) => {
  const [requesterName, setRequesterName] = useState('')
  const [requesterPhone, setRequesterPhone] = useState('')
  const [requesterEmail, setRequesterEmail] = useState('')
  const [patientName, setPatientName] = useState('')
  const [hospitalDetails, setHospitalDetails] = useState('')
  const [urgencyLevel, setUrgencyLevel] = useState<'CRITICAL' | 'URGENT' | 'STANDARD'>('URGENT')
  const [notes, setNotes] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  if (!isOpen || !member) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!requesterName.trim()) {
      setErrorMessage('Your Full Name is required.')
      return
    }
    if (!requesterPhone.trim()) {
      setErrorMessage('Your Contact Phone Number is required.')
      return
    }
    if (!patientName.trim()) {
      setErrorMessage('Patient Name is required.')
      return
    }
    if (!hospitalDetails.trim()) {
      setErrorMessage('Hospital and City details are required.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await submitEmergencyBloodContact({
        targetPersonId: member.person_id,
        familyHeadPersonId: member.family_head_person_id,
        requesterName: requesterName.trim(),
        requesterPhone: requesterPhone.trim(),
        requesterEmail: requesterEmail.trim() || null,
        patientName: patientName.trim(),
        hospitalDetails: hospitalDetails.trim(),
        urgencyLevel,
        message: notes.trim() || null,
      })

      if (res.error) {
        throw new Error(res.error.message || 'Failed to submit request.')
      }

      setIsSuccess(true)
      setTimeout(() => {
        setIsSuccess(false)
        onClose()
      }, 2500)
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to submit emergency contact request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs animate-in fade-in-50"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs">
              <HeartHandshake className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-navy-900">
                Contact Family Head for Blood Need
              </h2>
              <p className="text-xs text-rose-800 font-medium">
                {member.full_name} ({member.blood_group})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-navy-900">
              Emergency Request Sent
            </h3>
            <p className="text-xs text-navy-600 leading-relaxed max-w-sm mx-auto">
              Your request has been routed to the Family Head ({member.family_head_name || 'Family Head'}).
              They will review the details and reach out to you directly at {requesterPhone}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Privacy notice banner */}
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-navy-700">
              <Shield className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                In adherence with community privacy standards, personal phone numbers remain confidential.
                This emergency request is securely routed to the person&apos;s Family Head ({member.family_head_name || 'Head of Family'}).
              </p>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-navy-800 mb-1">
                  Urgency Level <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CRITICAL', 'URGENT', 'STANDARD'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setUrgencyLevel(lvl)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${
                        urgencyLevel === lvl
                          ? lvl === 'CRITICAL'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : lvl === 'URGENT'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-navy-800 text-white border-navy-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {lvl === 'CRITICAL' ? '🚨 Immediate' : lvl === 'URGENT' ? '⚡ Urgent' : 'ℹ️ Standard'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Patient Name"
                  required
                  placeholder="Patient requiring blood"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />
                <Input
                  label="Hospital & City"
                  required
                  placeholder="e.g. Civil Hospital, Anand"
                  value={hospitalDetails}
                  onChange={(e) => setHospitalDetails(e.target.value)}
                />
              </div>

              <Input
                label="Your Full Name (Requester)"
                required
                placeholder="Enter your name"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
              />

              <PhoneInputWithCountryCode
                id="emergency-phone"
                label="Your Contact Phone Number"
                required
                placeholder="Enter contact mobile number"
                value={requesterPhone}
                onChange={setRequesterPhone}
              />

              <Input
                label="Your Email Address (Optional)"
                type="email"
                placeholder="Enter your email"
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
              />

              <div>
                <label className="block text-xs font-semibold text-navy-800 mb-1">
                  Additional Notes / Requirement (Units, Date, etc.)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Need 2 units of B+ within 24 hours."
                  className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Routing Request...
                  </>
                ) : (
                  'Send Request to Family Head'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
