/**
 * MukhiFormModal — Add and Edit Official Community Mukhi.
 *
 * Requirements:
 * - Search Existing Community Person: allows Admin/Super Admin to search census persons
 *   by full name, mobile, birthplace or city, and autofills name, city/gram, gotra, nukh,
 *   while setting `linked_person_id` without creating duplicate person records.
 * - Detects if candidate is already registered as a Mukhi in another gram and displays a warning.
 * - Gotra & Dependent Nukh Selection: Uses official 29 Gotras and dependent Nukhs via GotraNukhSelect.
 * - Preserves strict domain separation: PERSON != USER != MUKHI.
 */

import React, { useState, useEffect, useId } from 'react'
import {
  X,
  Search,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Shield,
  Loader2,
  Trash2,
} from 'lucide-react'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import {
  upsertCommunityMukhi,
  checkPersonAlreadyMukhi,
  searchPersonsForMukhiForm,
  type MukhiPersonCandidate,
} from '../services/community-mukhis.service'
import type { MukhiLeaderItem } from '../types'

export interface MukhiFormModalProps {
  isOpen: boolean
  mukhi?: MukhiLeaderItem | null
  onClose: () => void
  onSuccess: () => void
}

export const MukhiFormModal: React.FC<MukhiFormModalProps> = ({
  isOpen,
  mukhi,
  onClose,
  onSuccess,
}) => {
  // Form Fields
  const [fullName, setFullName] = useState(mukhi?.name || '')
  const [gram, setGram] = useState(mukhi?.gram || mukhi?.city || '')
  const [mobileNumber, setMobileNumber] = useState(mukhi?.phone || '')
  const [officialEmail, setOfficialEmail] = useState(mukhi?.official_email || '')
  const [gotra, setGotra] = useState(mukhi?.gotra || '')
  const [nukh, setNukh] = useState(mukhi?.nukh || '')
  const [authorityStatus, setAuthorityStatus] = useState(mukhi?.authority_status || 'ACTIVE')
  const [linkedPersonId, setLinkedPersonId] = useState<string | null>(mukhi?.person_id || null)
  const [linkedPersonSummary, setLinkedPersonSummary] = useState<string | null>(
    mukhi?.person_id ? `Linked Person ID: ${mukhi.person_id}` : null
  )

  // Person Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<MukhiPersonCandidate[]>([])
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isEditMode = Boolean(mukhi?.id)

  const searchInputId = useId()
  const fullNameInputId = useId()
  const gramInputId = useId()
  const mobileInputId = useId()
  const emailInputId = useId()
  const statusSelectId = useId()

  // Populate on open / mukhi change
  useEffect(() => {
    if (isOpen) {
      if (mukhi) {
        setFullName(mukhi.name || '')
        setGram(mukhi.gram || mukhi.city || '')
        setMobileNumber(mukhi.phone || '')
        setOfficialEmail(mukhi.official_email || '')
        setGotra(mukhi.gotra || '')
        setNukh(mukhi.nukh || '')
        setAuthorityStatus(mukhi.authority_status || 'ACTIVE')
        setLinkedPersonId(mukhi.person_id || null)
        setLinkedPersonSummary(
          mukhi.person_id ? `Linked Person ID: ${mukhi.person_id}` : null
        )
      } else {
        setFullName('')
        setGram('')
        setMobileNumber('')
        setOfficialEmail('')
        setGotra('')
        setNukh('')
        setAuthorityStatus('ACTIVE')
        setLinkedPersonId(null)
        setLinkedPersonSummary(null)
      }
      setSearchQuery('')
      setSearchResults([])
      setDuplicateWarning(null)
      setFormError(null)
    }
  }, [isOpen, mukhi])

  // Search existing person with debounce
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await searchPersonsForMukhiForm(trimmed)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Handle selecting an existing community person
  const handleSelectPerson = async (candidate: MukhiPersonCandidate) => {
    // Format full name with Mukhi honorific if not present
    const nameWithHonorific = candidate.full_name.startsWith('Mukhi ')
      ? candidate.full_name
      : `Mukhi ${candidate.full_name}`

    setFullName(nameWithHonorific)
    if (candidate.birth_place || candidate.city) {
      setGram(candidate.birth_place || candidate.city || '')
    }
    if (candidate.gotra) {
      setGotra(candidate.gotra)
    }
    if (candidate.nukh) {
      setNukh(candidate.nukh)
    }

    setLinkedPersonId(candidate.id)
    setLinkedPersonSummary(
      `${candidate.full_name}${candidate.birth_place ? ` (${candidate.birth_place})` : ''}`
    )
    setSearchQuery('')
    setSearchResults([])

    // Check if this person is already registered as a Mukhi
    const alreadyMukhi = await checkPersonAlreadyMukhi(candidate.id, mukhi?.id)
    if (alreadyMukhi.isMukhi) {
      setDuplicateWarning(
        `Notice: This community person is already registered as an official Mukhi in "${alreadyMukhi.gram}".`
      )
    } else {
      setDuplicateWarning(null)
    }
  }

  // Handle clearing linked person
  const handleClearLinkedPerson = () => {
    setLinkedPersonId(null)
    setLinkedPersonSummary(null)
    setDuplicateWarning(null)
  }

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName.trim()) {
      setFormError('Mukhi Full Name is required.')
      return
    }
    if (!gram.trim()) {
      setFormError('Region / Gram / City is required.')
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    try {
      const result = await upsertCommunityMukhi({
        id: mukhi?.id,
        full_name: fullName.trim(),
        gram: gram.trim(),
        mobile_number: mobileNumber.trim() || null,
        official_email: officialEmail.trim() || null,
        gotra: gotra.trim() || null,
        nukh: nukh.trim() || null,
        authority_status: authorityStatus,
        linked_person_id: linkedPersonId,
      })

      if (result.error) {
        setFormError(result.error.message || 'Failed to save Mukhi record.')
        setIsSubmitting(false)
        return
      }

      onSuccess()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mukhi-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 id="mukhi-form-title" className="text-lg font-bold text-slate-900">
                {isEditMode ? 'Edit Mukhi Details' : 'Add Official Community Mukhi'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditMode
                  ? 'Update regional Mukhi credentials, lineage and contact details.'
                  : 'Register a community leader into the official Mukhi Council Directory.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {formError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* SEARCH EXISTING COMMUNITY PERSON SECTION */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor={searchInputId} className="flex items-center gap-1.5 font-bold text-blue-900 text-xs">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <span>Search Existing Community Person (Optional Autofill)</span>
              </label>
              <span className="text-[11px] text-blue-700">Preserves single person record</span>
            </div>

            {linkedPersonSummary ? (
              <div className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-blue-200 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-slate-900 block">
                      {linkedPersonSummary}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Linked Person ID: {linkedPersonId}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearLinkedPerson}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 px-2 py-1 rounded-md hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Unlink</span>
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <input
                    id={searchInputId}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search community member by full name, city or birthplace..."
                    className="w-full rounded-lg border border-blue-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-blue-500" />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-blue-500" />
                  )}
                </div>

                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg text-xs divide-y divide-slate-100">
                    {searchResults.map((cand) => (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handleSelectPerson(cand)}
                        className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <span className="font-semibold text-slate-900 block">
                            {cand.full_name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {cand.birth_place || cand.city || 'City unspecified'}
                            {cand.gotra ? ` • Gotra: ${cand.gotra}` : ''}
                            {cand.nukh ? ` • Nukh: ${cand.nukh}` : ''}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-blue-600">Select</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {duplicateWarning && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                <span>{duplicateWarning}</span>
              </div>
            )}
          </div>

          {/* BASIC INFO */}
          <div className="space-y-3">
            <div>
              <label htmlFor={fullNameInputId} className="block font-semibold text-slate-700 mb-1">
                Mukhi Full Name *
              </label>
              <input
                id={fullNameInputId}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Mukhi Ghanshyamdas Hemandas"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={gramInputId} className="block font-semibold text-slate-700 mb-1">
                  Region / Gram / City *
                </label>
                <div className="relative">
                  <input
                    id={gramInputId}
                    type="text"
                    value={gram}
                    onChange={(e) => setGram(e.target.value)}
                    placeholder="e.g. Ahmedabad, Bantwa, Jaipur"
                    required
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <MapPin className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>

              <div>
                <label htmlFor={mobileInputId} className="block font-semibold text-slate-700 mb-1">
                  Mobile Number
                </label>
                <input
                  id={mobileInputId}
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* GOTRA & DEPENDENT NUKH SELECT (29 OFFICIAL GOTRAS) */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block font-semibold text-slate-700 mb-2">
              Community Lineage (Brahma Khatri Gotra & Nukh Register)
            </label>
            <GotraNukhSelect
              selectedGotra={gotra}
              selectedNukh={nukh}
              onGotraChange={(newGotra) => {
                setGotra(newGotra)
              }}
              onNukhChange={(newNukh) => {
                setNukh(newNukh)
              }}
              gotraId="mukhi-gotra-select"
              nukhId="mukhi-nukh-select"
            />
          </div>

          {/* ADDITIONAL CONTACT & STATUS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label htmlFor={emailInputId} className="block font-semibold text-slate-700 mb-1">
                Official Email (Optional)
              </label>
              <input
                id={emailInputId}
                type="email"
                value={officialEmail}
                onChange={(e) => setOfficialEmail(e.target.value)}
                placeholder="e.g. mukhi.ahmedabad@khatrisarvaniyat.org"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor={statusSelectId} className="block font-semibold text-slate-700 mb-1">
                Authority Status
              </label>
              <select
                id={statusSelectId}
                value={authorityStatus}
                onChange={(e) => setAuthorityStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="ACTIVE">Active Mukhi Authority</option>
                <option value="INACTIVE">Inactive</option>
                <option value="REVOKED">Revoked</option>
              </select>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isEditMode ? 'Update Mukhi' : 'Save Mukhi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
