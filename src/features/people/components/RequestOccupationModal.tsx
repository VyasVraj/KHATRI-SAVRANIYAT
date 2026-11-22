/**
 * RequestOccupationModal component
 *
 * Dedicated modal for users to update their occupation / profession.
 * Directly persists the selected occupation to the person's census record
 * and immediately updates their profile and the community occupation directory
 * without requiring intermediate admin approval.
 */

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Briefcase, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { OccupationSelect } from '@/components/forms/OccupationSelect'
import { updatePerson } from '../services/people.service'
import { OCCUPATION_CATEGORIES, getCategoryForOccupation } from '@/constants/occupations'

interface RequestOccupationModalProps {
  person: {
    id: string
    first_name?: string | null
    middle_name?: string | null
    last_name?: string | null
    occupation?: string | null
    occupation_category?: string | null
    custom_occupation?: string | null
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
  let queryClient: ReturnType<typeof useQueryClient> | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    queryClient = useQueryClient()
  } catch {
    // Graceful fallback for non-query contexts
  }

  const [selectedOccupation, setSelectedOccupation] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const rawOcc = (person.occupation || '').trim()
      const isPlaceholder =
        !rawOcc ||
        rawOcc === 'Occupation Pending' ||
        rawOcc === 'Occupation Not Provided' ||
        rawOcc === 'Occupation Not Available' ||
        rawOcc === 'Occupation Rejected'

      setSelectedOccupation(isPlaceholder ? '' : rawOcc)
      setErrorMsg(null)
      setSuccessMsg(null)
      setIsSubmitting(false)
    }
  }, [isOpen, person])

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

  const currentOccupation = person.occupation || 'Occupation Not Provided'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!selectedOccupation) {
      setErrorMsg('Please select an occupation category from the official list.')
      return
    }

    setIsSubmitting(true)

    try {
      // Determine official category vs custom
      let dbOfficial = selectedOccupation.trim()
      const matched = OCCUPATION_CATEGORIES.find(
        (c) => c.toLowerCase() === selectedOccupation.toLowerCase()
      )
      if (matched) {
        dbOfficial = matched
      } else {
        const detected = getCategoryForOccupation(selectedOccupation)
        dbOfficial = detected || 'Business and Entrepreneurship'
      }

      const res = await updatePerson(person.id, {
        occupation: dbOfficial,
        occupation_category: dbOfficial,
        custom_occupation: selectedOccupation !== dbOfficial ? selectedOccupation : null,
      })

      if (res.error) {
        setErrorMsg(res.error.message || 'Failed to update occupation.')
        setIsSubmitting(false)
        return
      }

      setSuccessMsg(
        'Your occupation has been updated successfully and is directly reflected on your profile and the directory!'
      )

      if (queryClient) {
        void queryClient.invalidateQueries({ queryKey: ['person', person.id] })
        void queryClient.invalidateQueries({ queryKey: ['persons', person.id] })
        void queryClient.invalidateQueries({ queryKey: ['persons'] })
        void queryClient.invalidateQueries({ queryKey: ['community-persons'] })
        void queryClient.invalidateQueries({ queryKey: ['public-occupation-directory'] })
        void queryClient.invalidateQueries({ queryKey: ['public-occupations'] })
        void queryClient.invalidateQueries({ queryKey: ['family-members'] })
      }

      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 900)
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || 'Failed to update occupation.'
      setErrorMsg(msg)
      setIsSubmitting(false)
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
                Update Occupation / Profession
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
          {/* Current Occupation Display */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
              Current Occupation
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">
              {currentOccupation}
            </span>
          </div>

          {/* New Occupation Select */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Select Occupation / Profession <span className="text-red-500">*</span>
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
              Select one of the official Samaj occupation categories. It will be updated directly.
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
            <p className="font-semibold">Direct Update Notice:</p>
            <p className="text-blue-800 mt-0.5 text-[11px] leading-relaxed">
              Your selected occupation will update immediately and directly reflect on your profile and the community occupation directory without requiring admin approval.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Update Occupation Directly</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
