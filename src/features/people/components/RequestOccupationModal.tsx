/**
 * RequestOccupationModal component
 *
 * Dedicated accessible modal for a user to submit an occupation update request.
 * - Displays current approved occupation
 * - Provides official 30 Occupation Categories dropdown (OccupationSelect)
 * - Submits request with status PENDING
 * - Shows exact success message: "Your occupation update request has been submitted successfully. It is waiting for Admin approval."
 * - Concurrency & duplicate request prevention
 */

import { useState, useEffect } from 'react'
import { X, Briefcase, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { OccupationSelect } from '@/components/forms/OccupationSelect'
import { useOccupationRequestMutations } from '../hooks/useOccupationRequests'

interface RequestOccupationModalProps {
  person: {
    id: string
    first_name?: string | null
    middle_name?: string | null
    last_name?: string | null
    occupation?: string | null
  }
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function RequestOccupationModal({
  person,
  isOpen,
  onClose,
  onSuccess,
}: RequestOccupationModalProps) {
  const [selectedOccupation, setSelectedOccupation] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const { submit } = useOccupationRequestMutations()

  useEffect(() => {
    if (isOpen) {
      setSelectedOccupation('')
      setErrorMsg(null)
      setSuccessMsg(null)
    }
  }, [isOpen])

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

  if (!isOpen) return null

  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ') || 'Community Member'

  const currentOccupation = person.occupation || 'Occupation Pending'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!selectedOccupation) {
      setErrorMsg('Please select an occupation category from the official list.')
      return
    }

    if (selectedOccupation === currentOccupation) {
      setErrorMsg('Selected occupation is already the currently approved occupation.')
      return
    }

    try {
      const res = await submit.mutateAsync({
        personId: person.id,
        requestedOccupation: selectedOccupation,
      })
      setSuccessMsg(
        res.message ||
          'Your occupation update request has been submitted successfully. It is waiting for Admin approval.'
      )
      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1800)
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || 'Failed to submit occupation request.'
      setErrorMsg(msg)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-occupation-title"
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
              <Briefcase className="h-5 w-5" />
            </span>
            <div>
              <h2 id="request-occupation-title" className="text-base font-bold text-white">
                Request Occupation Update
              </h2>
              <p className="text-xs text-slate-300">{fullName}</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Current Occupation Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
              Current Approved Occupation
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">
              {currentOccupation}
            </span>
          </div>

          {/* New Occupation Select */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              New Requested Occupation <span className="text-red-500">*</span>
            </label>
            <OccupationSelect
              value={selectedOccupation}
              onChange={(val) => {
                setSelectedOccupation(val)
                setErrorMsg(null)
              }}
              required
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Select one of the 30 official Samaj occupation categories.
            </p>
          </div>

          {/* Success Banner */}
          {successMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="font-medium leading-relaxed">{successMsg}</div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="font-medium leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <div className="rounded-lg bg-blue-50/70 border border-blue-200/80 p-3 text-xs text-blue-900">
            <p className="font-semibold">Verification Notice:</p>
            <p className="text-blue-800 mt-0.5 text-[11px] leading-relaxed">
              Your request will be submitted to the Admin Panel for review. The profile's publicly visible occupation will remain unchanged until approved by an administrator.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submit.isPending}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submit.isPending || Boolean(successMsg)}
              className="min-h-[40px] inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60 cursor-pointer"
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Request</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
