/**
 * FamilyCreationWizard — Streamlined 2-Step Flow for Family Creation.
 *
 * Requirements:
 * Step 1: Create Family (Family Name, City/State/Country via CitySelector, Description, Gotra & Nukh)
 * Step 2: Add Family Head (Option A: New Person with full details | Option B: Existing Person)
 * Step 3: Save & Display:
 *   - Creates family and Family Head in database.
 *   - Links Family Head to family with role='HEAD' and is_head=TRUE.
 *   - Strictly does NOT assign Mukhi role or permissions.
 *   - Redirects to My Family (ROUTES.FAMILIES) with immediate display and highlight.
 *   - Equal field widths, zero clipping, balanced spacing, high z-index.
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  UserPlus,
  Search,
  AlertCircle,
  Sparkles,
  Award,
  Check,
} from 'lucide-react'

import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { PrivacyLevelSelect } from '@/components/forms/PrivacyLevelSelect'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import { CitySelector } from '@/components/forms/CitySelector'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { createFamilyWithHead } from '../services/families.service'
import { listPersonFamilies } from '@/features/family-members/services/family-members.service'
import { usePersonList } from '@/features/people/hooks/usePersonList'
import { useExecutiveCommittee } from '@/features/community/hooks/useExecutiveCommittee'
import { ROUTES, canManagePrivacy } from '@/constants/app'
import type { Tables } from '@/types/database.types'
import type { PrivacyLevel } from '@/types'

type PersonRow = Tables<'persons'>

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const PRIVACY_ENUM = z.enum(['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'])

const familyDetailsSchema = z.object({
  family_name: z
    .string({ required_error: 'Family name is required' })
    .min(1, 'Family name is required')
    .max(200, 'Family name must not exceed 200 characters'),
  description: z.string().max(2000, 'Description must not exceed 2000 characters').optional(),
  city: z.string().max(100, 'City must not exceed 100 characters').optional(),
  state: z.string().max(100, 'State must not exceed 100 characters').optional(),
  country: z.string().max(100, 'Country must not exceed 100 characters').optional(),
  gotra: z.string().max(100).optional(),
  nukh: z.string().max(100).optional(),
  profile_privacy: PRIVACY_ENUM.default('COMMUNITY'),
  members_privacy: PRIVACY_ENUM.default('COMMUNITY'),
})

type FamilyDetailsFormValues = z.infer<typeof familyDetailsSchema>

interface NewHeadFormValues {
  first_name: string
  middle_name: string
  last_name: string
  maiden_name: string
  gender: 'MALE' | 'FEMALE' | 'OTHER'
  date_of_birth: string
  birth_place: string
  gotra: string
  nukh: string
}

function sanitizeOptional(val: string | null | undefined): string | null {
  if (!val) return null
  const trimmed = val.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function FamilyCreationWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, profile } = useAuthContext()
  const isPrivacyManager = canManagePrivacy(profile?.role)

  // Step state: 1 (Details) | 2 (Head) | 3 (Mukhi)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 3 Mukhi State
  const [selectedMukhiId, setSelectedMukhiId] = useState<string | null>(null)
  const [mukhiSearchQuery, setMukhiSearchQuery] = useState('')
  const { members: committeeMembers, isLoading: isCommitteeLoading } = useExecutiveCommittee()

  const filteredCommitteeMembers = useMemo(() => {
    if (!mukhiSearchQuery.trim()) return committeeMembers
    const q = mukhiSearchQuery.toLowerCase().trim()
    return committeeMembers.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.designation.toLowerCase().includes(q) ||
        m.city.toLowerCase().includes(q) ||
        (m.nukh && m.nukh.toLowerCase().includes(q))
    )
  }, [committeeMembers, mukhiSearchQuery])

  const selectedMukhi = useMemo(
    () => committeeMembers.find((m) => m.id === selectedMukhiId) || null,
    [committeeMembers, selectedMukhiId]
  )

  // Step 2 Head Mode: 'new' | 'existing'
  const [headMode, setHeadMode] = useState<'new' | 'existing'>('new')

  // Step 1 Form
  const {
    register: registerFamily,
    trigger: triggerFamily,
    getValues: getFamilyValues,
    setValue: setFamilyValue,
    watch: watchFamily,
    formState: { errors: familyErrors },
  } = useForm<FamilyDetailsFormValues>({
    resolver: zodResolver(familyDetailsSchema),
    mode: 'onTouched',
    defaultValues: {
      family_name: '',
      description: '',
      city: '',
      state: '',
      country: 'India',
      gotra: '',
      nukh: '',
      profile_privacy: 'COMMUNITY',
      members_privacy: 'COMMUNITY',
    },
  })

  const familyGotra = watchFamily('gotra')
  const familyNukh = watchFamily('nukh')
  const familyCity = watchFamily('city')
  const familyState = watchFamily('state')
  const familyCountry = watchFamily('country')

  // Option A: New Head Form State
  const [newHead, setNewHead] = useState<NewHeadFormValues>({
    first_name: '',
    middle_name: '',
    last_name: '',
    maiden_name: '',
    gender: 'MALE',
    date_of_birth: '',
    birth_place: '',
    gotra: '',
    nukh: '',
  })
  const [newHeadErrors, setNewHeadErrors] = useState<Record<string, string>>({})

  // Option B: Existing Head Selection State
  const [selectedExistingPerson, setSelectedExistingPerson] = useState<PersonRow | null>(null)
  const [personSearch, setPersonSearch] = useState('')
  const [existingFamilyWarning, setExistingFamilyWarning] = useState<string | null>(null)
  const [confirmedTransfer, setConfirmedTransfer] = useState(false)

  // Overall submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  // Persons list for Option B
  const { data: persons = [], isLoading: isLoadingPersons } = usePersonList({ limit: 50 })

  const filteredPersons = useMemo(() => {
    if (!personSearch.trim()) return persons
    const q = personSearch.toLowerCase().trim()
    return persons.filter((p) => {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
      const gotra = p.gotra?.toLowerCase() ?? ''
      const place = p.birth_place?.toLowerCase() ?? ''
      return fullName.includes(q) || gotra.includes(q) || place.includes(q)
    })
  }, [persons, personSearch])

  // Advance from Step 1 to Step 2
  async function handleNextToHead() {
    const isValid = await triggerFamily()
    if (!isValid) return

    // Pre-populate new head's last name & gotra/nukh from family details if not yet touched
    const fam = getFamilyValues()
    setNewHead((prev) => ({
      ...prev,
      last_name: prev.last_name || fam.family_name.split(' ')[0] || '',
      gotra: prev.gotra || fam.gotra || '',
      nukh: prev.nukh || fam.nukh || '',
      birth_place: prev.birth_place || fam.city ? `${fam.city}, ${fam.state || ''}`.trim() : '',
    }))

    setStep(2)
  }

  // Handle selecting existing person
  async function handleSelectExistingPerson(p: PersonRow) {
    setSelectedExistingPerson(p)
    setExistingFamilyWarning(null)
    setConfirmedTransfer(false)

    try {
      const res = await listPersonFamilies(p.id)
      if (res.data && res.data.length > 0) {
        const activeMembership = res.data.find((m) => !m.left_at)
        if (activeMembership) {
          const famName = activeMembership.family?.family_name || 'another family'
          const roleLabel = activeMembership.is_head ? 'Head' : 'a Member'
          setExistingFamilyWarning(
            `This person is currently ${roleLabel} of "${famName}". Designating them as head will link them to this new family. Do you want to proceed?`
          )
        }
      }
    } catch {
      // Non-blocking
    }
  }

  // Validate New Head fields
  function validateNewHead(): boolean {
    const errs: Record<string, string> = {}
    if (!newHead.first_name.trim()) {
      errs.first_name = 'First name is required'
    }
    if (!newHead.last_name.trim()) {
      errs.last_name = 'Last name is required'
    }
    setNewHeadErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Advance from Step 2 to Step 3 (Mukhi Selection)
  function handleProceedToMukhi() {
    setGeneralError(null)

    // Validate Head selection
    if (headMode === 'new') {
      if (!validateNewHead()) return
    } else {
      if (!selectedExistingPerson) {
        setGeneralError('Please select an existing person to designate as Family Head.')
        return
      }
      if (existingFamilyWarning && !confirmedTransfer) {
        setGeneralError('Please confirm designating this person as Family Head to continue.')
        return
      }
    }

    setStep(3)
  }

  // Final Submission
  async function handleCreateFamily() {
    setGeneralError(null)

    if (!user?.id) {
      setGeneralError('You must be logged in to register a family.')
      return
    }

    // Validate Head selection
    if (headMode === 'new') {
      if (!validateNewHead()) return
    } else {
      if (!selectedExistingPerson) {
        setGeneralError('Please select an existing person to designate as Family Head.')
        return
      }
      if (existingFamilyWarning && !confirmedTransfer) {
        setGeneralError('Please confirm designating this person as Family Head to continue.')
        return
      }
    }

    setIsSubmitting(true)

    try {
      const famValues = getFamilyValues()
      const effPrivacy: PrivacyLevel = isPrivacyManager ? famValues.profile_privacy : 'COMMUNITY'

      const input = {
        family_name: famValues.family_name.trim(),
        description: sanitizeOptional(famValues.description),
        city: sanitizeOptional(famValues.city),
        state: sanitizeOptional(famValues.state),
        country: sanitizeOptional(famValues.country) || 'India',
        gotra: sanitizeOptional(famValues.gotra),
        nukh: sanitizeOptional(famValues.nukh),
        profile_privacy: effPrivacy,
        members_privacy: effPrivacy,
        selected_mukhi_id: selectedMukhiId,
        existing_person_id: headMode === 'existing' ? selectedExistingPerson!.id : null,
        new_person:
          headMode === 'new'
            ? {
                first_name: newHead.first_name.trim(),
                middle_name: sanitizeOptional(newHead.middle_name),
                last_name: newHead.last_name.trim(),
                maiden_name: sanitizeOptional(newHead.maiden_name),
                gender: newHead.gender,
                date_of_birth: sanitizeOptional(newHead.date_of_birth),
                birth_place: sanitizeOptional(newHead.birth_place),
              }
            : undefined,
      }

      const res = await createFamilyWithHead(input, user.id)

      if (res.error || !res.data) {
        throw new Error(res.error?.message || 'Failed to create family with designated head.')
      }

      // Invalidate relevant caches
      await queryClient.invalidateQueries({ queryKey: ['families'] })
      await queryClient.invalidateQueries({ queryKey: ['family-members'] })
      await queryClient.invalidateQueries({ queryKey: ['persons'] })

      // Redirect directly to My Family (/families) with highlight state per requirements
      navigate(ROUTES.FAMILIES, {
        state: {
          highlightFamilyId: res.data.family_id,
          message: `Family "${famValues.family_name}" created successfully with designated Family Head!`,
        },
      })
    } catch (err) {
      setGeneralError(
        (err as { message?: string }).message || 'Failed to create family. Please check details and try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Step Indicators */}
      <nav aria-label="Creation Progress" className="flex items-center gap-3 border-b border-navy-100 pb-4">
        <div
          className={`flex items-center gap-2 text-sm font-semibold ${
            step === 1 ? 'text-brand-600' : 'text-navy-500'
          }`}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              step === 1 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            1
          </span>
          <span>1. Family Details</span>
        </div>
        <span className="text-slate-300">/</span>
        <div
          className={`flex items-center gap-2 text-sm font-semibold ${
            step === 2 ? 'text-brand-600' : 'text-navy-500'
          }`}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              step === 2 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            2
          </span>
          <span>2. Add Family Head</span>
        </div>
        <span className="text-slate-300">/</span>
        <div
          className={`flex items-center gap-2 text-sm font-semibold ${
            step === 3 ? 'text-brand-600' : 'text-navy-500'
          }`}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              step === 3 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            3
          </span>
          <span>3. Select Mukhi</span>
        </div>
      </nav>

      {/* General Error Banner */}
      {generalError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{generalError}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 1: FAMILY DETAILS */}
      {/* ===================================================================== */}
      {step === 1 && (
        <div className="space-y-5 rounded-xl border border-navy-200 bg-white p-5 sm:p-7 shadow-xs">
          <div>
            <h2 className="text-lg font-bold text-navy-900">Family Information</h2>
            <p className="text-xs text-navy-500 mt-0.5">
              Register the household name, location, and cultural lineage for the community census.
            </p>
          </div>

          <div className="space-y-4">
            {/* Family Name */}
            <Input
              label="Family Name / Household Title"
              required
              placeholder="e.g. Ramesh Mulchand Household, Keria Family"
              error={familyErrors.family_name?.message}
              {...registerFamily('family_name')}
            />

            {/* City Autocomplete / Combobox */}
            <div className="space-y-1">
              <input type="hidden" {...registerFamily('city')} />
              <input type="hidden" {...registerFamily('state')} />
              <input type="hidden" {...registerFamily('country')} />
              <CitySelector
                label="City / Location"
                required
                value={familyCity || ''}
                selectedState={familyState || ''}
                selectedCountry={familyCountry || 'India'}
                onSelectCity={(selected) => {
                  setFamilyValue('city', selected.city, { shouldValidate: true })
                  setFamilyValue('state', selected.state, { shouldValidate: true })
                  setFamilyValue('country', selected.country, { shouldValidate: true })
                }}
                error={familyErrors.city?.message}
              />
              {(familyState || familyCountry) && (
                <p className="text-xs text-navy-500 pl-1">
                  Selected State: <span className="font-semibold text-navy-800">{familyState || '—'}</span> &bull;
                  Country: <span className="font-semibold text-navy-800">{familyCountry || 'India'}</span>
                </p>
              )}
            </div>

            {/* Cultural Lineage: Gotra & Nukh Dependent Dropdown */}
            <div className="border-t border-navy-100 pt-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-500">
                Cultural Lineage (Brahm Kshatriya Master List)
              </h3>
              <GotraNukhSelect
                selectedGotra={familyGotra}
                selectedNukh={familyNukh}
                onGotraChange={(val) => {
                  setFamilyValue('gotra', val, { shouldValidate: true })
                  setFamilyValue('nukh', '', { shouldValidate: true })
                }}
                onNukhChange={(val) => setFamilyValue('nukh', val, { shouldValidate: true })}
                gotraError={familyErrors.gotra?.message}
                nukhError={familyErrors.nukh?.message}
              />
            </div>

            {/* Description / Notes */}
            <div>
              <label htmlFor="family-desc" className="block text-sm font-medium text-navy-700 mb-1">
                Description / Notes (Optional)
              </label>
              <textarea
                id="family-desc"
                rows={2}
                placeholder="Brief notes about the household lineage, branch, or ancestral hometown..."
                className="w-full rounded-md border border-navy-300 px-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
                {...registerFamily('description')}
              />
            </div>

            {/* Privacy Controls (Admin only) */}
            {isPrivacyManager && (
              <div className="border-t border-navy-100 pt-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-500">Privacy Settings</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <PrivacyLevelSelect
                    label="Profile Privacy"
                    value={watchFamily('profile_privacy')}
                    onChange={(e) => setFamilyValue('profile_privacy', e.target.value as PrivacyLevel)}
                  />
                  <PrivacyLevelSelect
                    label="Members Privacy"
                    value={watchFamily('members_privacy')}
                    onChange={(e) => setFamilyValue('members_privacy', e.target.value as PrivacyLevel)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-navy-100">
            <Button type="button" onClick={handleNextToHead} className="font-bold shadow-sm">
              Next: Add Family Head
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 2: FAMILY HEAD SELECTION */}
      {/* ===================================================================== */}
      {step === 2 && (
        <div className="space-y-5 rounded-xl border border-navy-200 bg-white p-5 sm:p-7 shadow-xs">
          <div className="rounded-lg bg-amber-50/70 border border-amber-200/80 p-4">
            <div className="flex items-start gap-3">
              <Crown className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-900">Designate Family Head</h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Every household must have a designated Family Head. Enter personal details to create a new person or
                  select an existing individual from the census.
                </p>
              </div>
            </div>
          </div>

          {/* Option Mode Toggle */}
          <div className="flex rounded-lg border border-navy-200 p-1 bg-slate-50">
            <button
              type="button"
              onClick={() => setHeadMode('new')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-bold transition-all ${
                headMode === 'new'
                  ? 'bg-white text-navy-900 shadow-sm border border-slate-200'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <UserPlus className="h-4 w-4 text-brand-600" />
              Option A: Create New Person
            </button>
            <button
              type="button"
              onClick={() => setHeadMode('existing')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-bold transition-all ${
                headMode === 'existing'
                  ? 'bg-white text-navy-900 shadow-sm border border-slate-200'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <Search className="h-4 w-4 text-brand-600" />
              Option B: Select Existing Person
            </button>
          </div>

          {/* Mode A: Create New Person Form */}
          {headMode === 'new' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="1. First Name"
                  required
                  placeholder="e.g. Ramesh"
                  value={newHead.first_name}
                  onChange={(e) => {
                    setNewHead((prev) => ({ ...prev, first_name: e.target.value }))
                    if (newHeadErrors.first_name) setNewHeadErrors((prev) => ({ ...prev, first_name: '' }))
                  }}
                  error={newHeadErrors.first_name}
                />
                <Input
                  label="2. Middle Name"
                  placeholder="Father's / Husband's name"
                  value={newHead.middle_name}
                  onChange={(e) => setNewHead((prev) => ({ ...prev, middle_name: e.target.value }))}
                />
                <Input
                  label="3. Last Name / Surname"
                  required
                  placeholder="e.g. Mulchand, Keria"
                  value={newHead.last_name}
                  onChange={(e) => {
                    setNewHead((prev) => ({ ...prev, last_name: e.target.value }))
                    if (newHeadErrors.last_name) setNewHeadErrors((prev) => ({ ...prev, last_name: '' }))
                  }}
                  error={newHeadErrors.last_name}
                />
                <Input
                  label="4. Maiden Name (if applicable)"
                  placeholder="Birth surname"
                  value={newHead.maiden_name}
                  onChange={(e) => setNewHead((prev) => ({ ...prev, maiden_name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="head-gender" className="block text-sm font-medium text-navy-700">
                    Gender
                  </label>
                  <select
                    id="head-gender"
                    value={newHead.gender}
                    onChange={(e) =>
                      setNewHead((prev) => ({ ...prev, gender: e.target.value as 'MALE' | 'FEMALE' | 'OTHER' }))
                    }
                    className="h-10 w-full rounded-md border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <Input
                  label="Date of Birth"
                  type="date"
                  value={newHead.date_of_birth}
                  onChange={(e) => setNewHead((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                />

                <CitySelector
                  label="Birth Place"
                  placeholder="Search city/village..."
                  value={newHead.birth_place}
                  onSelectCity={(selected) => {
                    setNewHead((prev) => ({
                      ...prev,
                      birth_place: selected.city ? `${selected.city}, ${selected.state}` : '',
                    }))
                  }}
                />
              </div>

              {/* Gotra & Nukh for Head */}
              <div className="pt-2 border-t border-navy-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-2">
                  Lineage of Family Head
                </h4>
                <GotraNukhSelect
                  selectedGotra={newHead.gotra}
                  selectedNukh={newHead.nukh}
                  onGotraChange={(val) => setNewHead((prev) => ({ ...prev, gotra: val, nukh: '' }))}
                  onNukhChange={(val) => setNewHead((prev) => ({ ...prev, nukh: val }))}
                />
              </div>
            </div>
          )}

          {/* Mode B: Select Existing Person */}
          {headMode === 'existing' && (
            <div className="space-y-4 pt-1">
              <h3 className="text-sm font-bold text-navy-900">Choose from Community Census</h3>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, birthplace, or gotra..."
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  className="w-full rounded-lg border border-navy-300 pl-10 pr-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>

              {/* Person Candidates List */}
              <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-navy-100 p-1.5 scrollbar-thin">
                {isLoadingPersons ? (
                  <p className="p-3 text-center text-xs text-navy-400">Loading census records...</p>
                ) : filteredPersons.length === 0 ? (
                  <p className="p-3 text-center text-xs text-navy-400">No matching persons found in census.</p>
                ) : (
                  filteredPersons.map((p) => {
                    const isSelected = selectedExistingPerson?.id === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectExistingPerson(p)}
                        className={`w-full flex items-center justify-between rounded-md p-2.5 text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-brand-50 border border-brand-300 text-brand-900 font-semibold'
                            : 'hover:bg-navy-50 text-navy-800'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-sm">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="text-[11px] text-navy-500">
                            {p.gotra && `Gotra: ${p.gotra}`} {p.birth_place && `• ${p.birth_place}`}
                          </p>
                        </div>
                        {isSelected && <span className="rounded bg-brand-600 px-2 py-0.5 text-[10px] text-white">Selected</span>}
                      </button>
                    )
                  })
                )}
              </div>

              {/* Cross-Family Warning */}
              {existingFamilyWarning && (
                <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                  <p>{existingFamilyWarning}</p>
                  <label className="flex items-center gap-2 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={confirmedTransfer}
                      onChange={(e) => setConfirmedTransfer(e.target.checked)}
                      className="rounded border-amber-400 text-brand-600 focus:ring-brand-400"
                    />
                    <span>I confirm designating this person as Head of the new family unit.</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Navigation Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-navy-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
            >
              <ArrowLeft className="h-4 w-4" />
              Back: Family Details
            </Button>

            <Button
              type="button"
              onClick={handleProceedToMukhi}
              className="font-bold shadow-sm"
            >
              Next: Select Mukhi
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 3: SELECT MUKHI */}
      {/* ===================================================================== */}
      {step === 3 && (
        <div className="space-y-5 rounded-xl border border-navy-200 bg-white p-5 sm:p-7 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy-900 flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-600" />
                Select Mukhi
              </h2>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-200">
                Official Register: 31 Members
              </span>
            </div>
            <p className="text-xs text-navy-500 mt-1">
              Choose your family&apos;s designated Mukhi from the official Khatri Sarvaniyat Executive Committee Register.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
            <input
              type="text"
              placeholder="Search by Mukhi name, designation, city, or nukh..."
              value={mukhiSearchQuery}
              onChange={(e) => setMukhiSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Currently Selected Summary */}
          {selectedMukhi && (
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-brand-200 bg-brand-50/60">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  {selectedMukhi.serial_number}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-brand-950">{selectedMukhi.full_name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-brand-100 text-brand-800">
                      {selectedMukhi.designation}
                    </span>
                  </div>
                  <div className="text-xs text-brand-700 flex items-center gap-2 mt-0.5">
                    <span>City: <strong>{selectedMukhi.city}</strong></span>
                    {selectedMukhi.nukh && <span>• Nukh: <strong>{selectedMukhi.nukh}</strong></span>}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMukhiId(null)}
                className="text-xs text-brand-600 hover:text-brand-800 underline font-medium"
              >
                Clear
              </button>
            </div>
          )}

          {/* Mukhi Members List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-navy-100 border border-navy-200 rounded-lg">
            {isCommitteeLoading ? (
              <div className="p-6 text-center text-sm text-navy-500">
                Loading official Executive Committee members...
              </div>
            ) : filteredCommitteeMembers.length === 0 ? (
              <div className="p-6 text-center text-sm text-navy-500">
                No committee members match &quot;{mukhiSearchQuery}&quot;.
              </div>
            ) : (
              filteredCommitteeMembers.map((member) => {
                const isSelected = selectedMukhiId === member.id
                return (
                  <div
                    key={member.id}
                    onClick={() => setSelectedMukhiId(member.id)}
                    className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-50/80 font-medium' : 'hover:bg-navy-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSelected
                            ? 'bg-brand-600 text-white'
                            : 'bg-navy-100 text-navy-600'
                        }`}
                      >
                        {member.serial_number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-navy-900 font-semibold">{member.full_name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              member.designation.includes('President') || member.designation.includes('Secretary')
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {member.designation}
                          </span>
                        </div>
                        <div className="text-xs text-navy-500 flex items-center gap-2 mt-0.5">
                          <span>{member.city}</span>
                          {member.nukh && <span>• {member.nukh}</span>}
                          {member.mobile_number && <span>• 📞 {member.mobile_number}</span>}
                        </div>
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-brand-600">
                        <Check className="h-4 w-4" />
                        Selected
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs px-2.5 py-1 rounded border border-navy-200 text-navy-600 hover:border-brand-500 hover:text-brand-600 bg-white"
                      >
                        Select
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <p className="text-[11px] text-navy-400 italic">
            Note: Selecting a Mukhi links your family to their registered community leader from the Executive Committee. It does not transfer family ownership or administrative rights.
          </p>

          {/* Navigation Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-navy-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(2)}
              disabled={isSubmitting}
            >
              <ArrowLeft className="h-4 w-4" />
              Back: Family Head
            </Button>

            <Button
              type="button"
              onClick={handleCreateFamily}
              isLoading={isSubmitting}
              className="font-bold shadow-sm"
            >
              <Sparkles className="h-4 w-4" />
              Save & Register Family
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
