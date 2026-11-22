/**
 * UpdateOccupationModal Component
 *
 * Dedicated modal allowing authorized community members (record owner, creator,
 * family head, or admin) to set or update a person's occupation / profession directly.
 *
 * FEATURES:
 * - TwoLevelOccupationSelect for picking from 30 official categories or custom occupations
 * - Pre-populates with the person's existing occupation, category, and custom values
 * - Direct atomic update via people service to persist occupation, occupation_category, and custom_occupation
 * - Automatic query cache invalidation for instant updates on the profile and directory
 */

import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Briefcase, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { TwoLevelOccupationSelect } from '@/components/forms/TwoLevelOccupationSelect'
import { OCCUPATION_CATEGORIES, getCategoryForOccupation } from '@/constants/occupations'
import { updatePerson } from '../services/people.service'
import { AvatarImage } from '@/features/media'
import { toProperCaseName } from '@/utils/text-casing'
import type { PersonRow } from '@/types'

export interface UpdateOccupationModalProps {
  person: PersonRow & {
    city?: string | null
    occupation_category?: string | null
    custom_occupation?: string | null
  }
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function UpdateOccupationModal({
  person,
  isOpen,
  onClose,
  onSuccess,
}: UpdateOccupationModalProps) {
  let queryClient: ReturnType<typeof useQueryClient> | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    queryClient = useQueryClient()
  } catch {
    // Graceful fallback if rendered outside of QueryClientProvider in static or unit test environments
  }

  // Initialize selected values from person record
  const [selectedOccupation, setSelectedOccupation] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const rawOcc = (person.occupation || '').trim()
      const rawCat = (person.occupation_category || '').trim()
      const rawCustom = ((person as unknown as { custom_occupation?: string | null })?.custom_occupation || '').trim()

      const isPlaceholder =
        !rawOcc ||
        rawOcc === 'Occupation Pending' ||
        rawOcc === 'Occupation Not Provided' ||
        rawOcc === 'Occupation Not Available' ||
        rawOcc === 'Occupation Rejected'

      if (isPlaceholder) {
        setSelectedOccupation(rawCustom || '')
        setSelectedCategory(rawCat || '')
      } else {
        setSelectedOccupation(rawCustom || rawOcc)
        setSelectedCategory(rawCat || getCategoryForOccupation(rawOcc) || rawOcc)
      }

      setErrorMsg(null)
      setSuccessMsg(null)
      setIsSaving(false)
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

  const fullName = toProperCaseName(
    [person.first_name, person.middle_name, person.last_name]
      .filter(Boolean)
      .join(' ')
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    const chosenSpecific = selectedOccupation.trim()
    let chosenCategory = selectedCategory.trim()

    let dbOfficialOccupation: string | null = null
    let dbCustomOccupation: string | null = null

    if (chosenCategory && chosenCategory !== 'Other') {
      const matchedOfficial = OCCUPATION_CATEGORIES.find(
        (c) => c.toLowerCase() === chosenCategory.toLowerCase()
      )
      if (matchedOfficial) {
        dbOfficialOccupation = matchedOfficial
        if (chosenSpecific && chosenSpecific.toLowerCase() !== matchedOfficial.toLowerCase()) {
          dbCustomOccupation = chosenSpecific
        }
      } else {
        dbOfficialOccupation = chosenCategory
        if (chosenSpecific && chosenSpecific.toLowerCase() !== chosenCategory.toLowerCase()) {
          dbCustomOccupation = chosenSpecific
        }
      }
    } else if (chosenCategory === 'Other' && chosenSpecific) {
      const detected = getCategoryForOccupation(chosenSpecific)
      dbOfficialOccupation = detected || 'Business and Entrepreneurship'
      chosenCategory = detected || 'Other'
      dbCustomOccupation = chosenSpecific
    } else if (chosenSpecific) {
      const detected = getCategoryForOccupation(chosenSpecific)
      if (detected) {
        dbOfficialOccupation = detected
        chosenCategory = detected
        dbCustomOccupation = chosenSpecific
      } else {
        dbOfficialOccupation = 'Business and Entrepreneurship'
        dbCustomOccupation = chosenSpecific
      }
    }

    setIsSaving(true)

    try {
      const result = await updatePerson(person.id, {
        occupation: dbOfficialOccupation,
        occupation_category: chosenCategory || null,
        custom_occupation: dbCustomOccupation || null,
      })

      if (result.error) {
        setErrorMsg(result.error.message || 'Failed to update occupation. Please try again.')
        setIsSaving(false)
        return
      }

      setSuccessMsg('Occupation / Profession updated successfully!')

      // Reactive invalidation across all domains
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
      }, 700)
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while saving occupation.'
      )
      setIsSaving(false)
    }
  }

  const handleClearOccupation = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)
    setIsSaving(true)

    try {
      const result = await updatePerson(person.id, {
        occupation: null,
        occupation_category: null,
        custom_occupation: null,
      })

      if (result.error) {
        setErrorMsg(result.error.message || 'Failed to clear occupation.')
        setIsSaving(false)
        return
      }

      setSuccessMsg('Occupation cleared successfully!')

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
      }, 700)
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to clear occupation.'
      )
      setIsSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-occupation-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-navy-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Briefcase className="h-5 w-5" />
            </span>
            <div>
              <h3
                id="update-occupation-title"
                className="text-base font-bold text-navy-900"
              >
                Update Occupation / Profession
              </h3>
              <p className="text-xs text-navy-500">
                Update professional details for {fullName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 transition"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Member preview strip */}
        <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <AvatarImage
            src={person.avatar_url ?? null}
            name={fullName}
            size="sm"
            shape="circle"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy-900 truncate">
              {fullName}
            </p>
            <p className="text-[11px] text-slate-500">
              {person.gotra ? `Gotra: ${person.gotra}` : 'Community Member'}
              {person.city ? ` • ${person.city}` : ''}
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <TwoLevelOccupationSelect
            id="modal-update-occupation"
            label="Selected Occupation / Profession"
            categoryValue={selectedCategory}
            occupationValue={selectedOccupation}
            onChange={(occ, cat) => {
              setSelectedOccupation(occ)
              setSelectedCategory(cat)
            }}
            disabled={isSaving}
          />

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900 leading-relaxed">
            <p className="font-semibold text-blue-950 mb-0.5">Directory & Profile Synchronization:</p>
            <p className="text-blue-800">
              Saving your occupation updates this profile and automatically reflects in the
              public Profession &amp; Occupation Directory for verified community discovery.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClearOccupation}
              disabled={isSaving}
              className="text-xs text-slate-500 hover:text-red-600 underline transition cursor-pointer disabled:opacity-50"
            >
              Clear occupation
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition min-h-[38px] cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition min-h-[38px] cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Occupation</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
