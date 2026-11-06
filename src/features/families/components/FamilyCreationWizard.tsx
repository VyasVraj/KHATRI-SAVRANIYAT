/**
 * FamilyCreationWizard — Complete Family Registration & Add Person Workflow.
 *
 * Requirements (Khatri Sarvaniyat):
 * 1. Step 1: Family Details (7 mandatory fields: Family Name, Mukhi from 118 records,
 *    City/State/Country, Gotra from 29 master list, dependent Nukh, optional description).
 * 2. Step 2: Family Head (Option A: New Person with 12 mandatory fields in exact order,
 *    or Option B: Existing Person).
 * 3. Step 3: Additional Family Members (Add multiple, new or existing, collect relationship
 *    to head, staged in memory with edit/remove before submit).
 * 4. Step 4: Review and Confirm (Display full summary, edit navigation, confirmation dialog,
 *    atomic submission via register_complete_family RPC).
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  UserPlus,
  Users,
  Search,
  AlertCircle,
  Check,
  Shield,
  MapPin,
  Phone,
  Edit2,
  Trash2,
  Plus,
  X,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import { CitySelector } from '@/components/forms/CitySelector'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import {
  registerCompleteFamily,
  type CompleteFamilyRegistrationPayload,
  type RegistrationMemberInput,
} from '../services/families.service'
import { usePersonList } from '@/features/people/hooks/usePersonList'
import { useCommunityMukhis } from '@/features/community/hooks/useCommunityMukhis'
import { isLocationMatch } from '@/features/community/services/community-mukhis.service'
import { BLOOD_GROUP_OPTIONS } from '@/constants/bloodGroup'
import { ROUTES } from '@/constants/app'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

export interface PersonFormValues {
  first_name: string
  middle_name: string
  last_name: string
  gender: 'MALE' | 'FEMALE' | 'OTHER'
  date_of_birth: string
  city: string
  state: string
  country: string
  gotra: string
  nukh: string
  phone: string
  email: string
  // Optional fields
  maiden_name: string
  birth_place: string
  date_of_death: string
  phone_secondary: string
  blood_group: string
  blood_group_consent: boolean
  kul: string
}

export interface StagedMember {
  id: string // temporary client id
  is_existing: boolean
  existing_person?: PersonRow | null
  relationship_to_head: string
  form_values: PersonFormValues
}

const RELATIONSHIP_OPTIONS = [
  'Wife',
  'Husband',
  'Son',
  'Daughter',
  'Mother',
  'Father',
  'Brother',
  'Sister',
  'Grandfather',
  'Grandmother',
  'Grandson',
  'Granddaughter',
  'Other',
] as const

const INITIAL_PERSON_VALUES: PersonFormValues = {
  first_name: '',
  middle_name: '',
  last_name: '',
  gender: 'MALE',
  date_of_birth: '',
  city: '',
  state: '',
  country: 'India',
  gotra: '',
  nukh: '',
  phone: '',
  email: '',
  maiden_name: '',
  birth_place: '',
  date_of_death: '',
  phone_secondary: '',
  blood_group: '',
  blood_group_consent: false,
  kul: '',
}

function validatePersonFields(vals: PersonFormValues): Record<string, string> {
  const errs: Record<string, string> = {}

  if (!vals.first_name.trim()) errs.first_name = 'First Name is required'
  // Middle Name is OPTIONAL per specification
  if (!vals.last_name.trim()) errs.last_name = 'Last Name / Surname is required'
  if (!vals.gender) errs.gender = 'Gender is required'
  
  if (!vals.date_of_birth) {
    errs.date_of_birth = 'Date of Birth is required'
  } else {
    const dob = new Date(vals.date_of_birth)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (dob > today) {
      errs.date_of_birth = 'Date of Birth cannot be in the future'
    }
  }

  // Birthplace is mandatory
  const effectiveBirthplace = vals.birth_place.trim() || vals.city.trim()
  if (!effectiveBirthplace) {
    errs.birth_place = 'Birthplace is required'
  }

  // Blood Group is mandatory
  if (!vals.blood_group || vals.blood_group === 'UNKNOWN') {
    errs.blood_group = 'Blood Group is required'
  }

  if (vals.date_of_death && vals.date_of_birth) {
    const dod = new Date(vals.date_of_death)
    const dob = new Date(vals.date_of_birth)
    if (dod < dob) {
      errs.date_of_death = 'Date of Death cannot be earlier than Date of Birth'
    }
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (dod > today) {
      errs.date_of_death = 'Date of Death cannot be in the future'
    }
  }

  if (!vals.city.trim()) errs.city = 'City / Town / Gaon is required'
  if (!vals.state.trim()) errs.state = 'State / Province is required'
  if (!vals.country.trim()) errs.country = 'Country is required'
  if (!vals.gotra.trim()) errs.gotra = 'Gotra is required'
  if (!vals.nukh.trim()) errs.nukh = 'Nukh is required'

  if (!vals.phone.trim()) {
    errs.phone = 'Primary Phone Number is required'
  } else if (!/^[0-9+\s\-()]{7,20}$/.test(vals.phone.trim())) {
    errs.phone = 'Please enter a valid phone number (digits, +, -)'
  }

  if (!vals.email.trim()) {
    errs.email = 'Email Address is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vals.email.trim())) {
    errs.email = 'Please enter a valid email address'
  }

  return errs
}

export function FamilyCreationWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  // Active step: 1 (Family) | 2 (Head) | 3 (Members) | 4 (Review)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // ---------------------------------------------------------------------------
  // STEP 1: FAMILY DETAILS
  // ---------------------------------------------------------------------------
  const [familyName, setFamilyName] = useState('')
  const [selectedMukhiId, setSelectedMukhiId] = useState<string>('')
  const [mukhiSearchQuery, setMukhiSearchQuery] = useState('')
  const [familyCity, setFamilyCity] = useState('')
  const [familyState, setFamilyState] = useState('')
  const [familyCountry, setFamilyCountry] = useState('India')
  const [familyGotra, setFamilyGotra] = useState('')
  const [familyNukh, setFamilyNukh] = useState('')
  const [familyDescription, setFamilyDescription] = useState('')
  const [familyKul, setFamilyKul] = useState('')
  const [familyErrors, setFamilyErrors] = useState<Record<string, string>>({})

  const { mukhis: communityMukhis, isLoading: isMukhisLoading } = useCommunityMukhis({
    priorityLocation: familyCity || undefined,
  })

  const filteredMukhis = useMemo(() => {
    if (!mukhiSearchQuery.trim()) return communityMukhis
    const q = mukhiSearchQuery.toLowerCase().trim()
    return communityMukhis.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.gram.toLowerCase().includes(q) ||
        (m.mobile_number && m.mobile_number.includes(q)) ||
        String(m.source_serial_number) === q
    )
  }, [communityMukhis, mukhiSearchQuery])

  const selectedMukhi = useMemo(
    () => communityMukhis.find((m) => m.id === selectedMukhiId) || null,
    [communityMukhis, selectedMukhiId]
  )

  // ---------------------------------------------------------------------------
  // STEP 2: FAMILY HEAD
  // ---------------------------------------------------------------------------
  const [headMode, setHeadMode] = useState<'new' | 'existing'>('new')
  const [headForm, setHeadForm] = useState<PersonFormValues>(INITIAL_PERSON_VALUES)
  const [headErrors, setHeadErrors] = useState<Record<string, string>>({})
  const [selectedExistingHead, setSelectedExistingHead] = useState<PersonRow | null>(null)
  const [headSearchQuery, setHeadSearchQuery] = useState('')

  // ---------------------------------------------------------------------------
  // STEP 3: ADDITIONAL MEMBERS
  // ---------------------------------------------------------------------------
  const [stagedMembers, setStagedMembers] = useState<StagedMember[]>([])
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)

  // Member form state inside modal
  const [memberMode, setMemberMode] = useState<'new' | 'existing'>('new')
  const [memberRelationship, setMemberRelationship] = useState<string>('Wife')
  const [memberForm, setMemberForm] = useState<PersonFormValues>(INITIAL_PERSON_VALUES)
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({})
  const [selectedExistingMember, setSelectedExistingMember] = useState<PersonRow | null>(null)
  const [memberSearchQuery, setMemberSearchQuery] = useState('')

  // ---------------------------------------------------------------------------
  // STEP 4: REVIEW, CONFIRMATION & SUBMIT
  // ---------------------------------------------------------------------------
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  // Person search query for existing records
  const { data: persons = [] } = usePersonList({ limit: 100 })

  const filteredPersonsForHead = useMemo(() => {
    if (!headSearchQuery.trim()) return persons.slice(0, 20)
    const q = headSearchQuery.toLowerCase().trim()
    return persons.filter((p) => {
      const name = `${p.first_name} ${p.middle_name || ''} ${p.last_name}`.toLowerCase()
      const ph = p.phone || ''
      const city = p.city || p.birth_place || ''
      return name.includes(q) || ph.includes(q) || city.toLowerCase().includes(q)
    })
  }, [persons, headSearchQuery])

  const filteredPersonsForMember = useMemo(() => {
    if (!memberSearchQuery.trim()) return persons.slice(0, 20)
    const q = memberSearchQuery.toLowerCase().trim()
    return persons.filter((p) => {
      const name = `${p.first_name} ${p.middle_name || ''} ${p.last_name}`.toLowerCase()
      const ph = p.phone || ''
      const city = p.city || p.birth_place || ''
      return name.includes(q) || ph.includes(q) || city.toLowerCase().includes(q)
    })
  }, [persons, memberSearchQuery])

  // ---------------------------------------------------------------------------
  // STEP 1 VALIDATION & PROCEED
  // ---------------------------------------------------------------------------
  function validateStep1(): boolean {
    const errs: Record<string, string> = {}
    if (!familyName.trim()) errs.family_name = 'Family Name / Household Title is required'
    if (!selectedMukhiId) errs.selected_mukhi_id = 'Mukhi must be selected from the approved 118 Mukhi records'
    if (!familyCity.trim()) errs.city = 'City / Gaon is required'
    if (!familyState.trim()) errs.state = 'State / Province is required'
    if (!familyCountry.trim()) errs.country = 'Country is required'
    if (!familyGotra.trim()) errs.gotra = 'Gotra is required'
    if (!familyNukh.trim()) errs.nukh = 'Nukh is required'

    setFamilyErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleProceedToStep2() {
    if (!validateStep1()) return

    // Prepopulate Head form defaults from Family details if not yet customized
    setHeadForm((prev) => ({
      ...prev,
      last_name: prev.last_name || familyName.split(' ')[0] || '',
      city: prev.city || familyCity,
      state: prev.state || familyState,
      country: prev.country || familyCountry,
      gotra: prev.gotra || familyGotra,
      nukh: prev.nukh || familyNukh,
    }))

    setStep(2)
  }

  // ---------------------------------------------------------------------------
  // STEP 2 VALIDATION & PROCEED
  // ---------------------------------------------------------------------------
  function validateStep2(): boolean {
    setGeneralError(null)
    if (headMode === 'existing') {
      if (!selectedExistingHead) {
        setGeneralError('Please search and select an existing person to designate as Family Head.')
        return false
      }
      return true
    }

    const errs = validatePersonFields(headForm)
    setHeadErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleProceedToStep3() {
    if (!validateStep2()) return
    setStep(3)
  }

  // ---------------------------------------------------------------------------
  // STEP 3: MEMBER MODAL CONTROLS
  // ---------------------------------------------------------------------------
  function handleOpenAddMemberModal() {
    setEditingMemberId(null)
    setMemberMode('new')
    setMemberRelationship('Wife')
    setMemberForm({
      ...INITIAL_PERSON_VALUES,
      last_name: familyName.split(' ')[0] || '',
      city: familyCity,
      state: familyState,
      country: familyCountry,
      gotra: familyGotra,
      nukh: familyNukh,
    })
    setMemberErrors({})
    setSelectedExistingMember(null)
    setMemberSearchQuery('')
    setShowMemberModal(true)
  }

  function handleOpenEditMemberModal(m: StagedMember) {
    setEditingMemberId(m.id)
    setMemberMode(m.is_existing ? 'existing' : 'new')
    setMemberRelationship(m.relationship_to_head)
    setMemberForm(m.form_values)
    setSelectedExistingMember(m.existing_person || null)
    setMemberErrors({})
    setShowMemberModal(true)
  }

  function handleSaveMemberModal() {
    setGeneralError(null)
    const headId = headMode === 'existing' ? selectedExistingHead?.id : null

    if (memberMode === 'existing') {
      if (!selectedExistingMember) {
        setMemberErrors({ existing: 'Please select an existing person.' })
        return
      }
      if (headId && selectedExistingMember.id === headId) {
        setMemberErrors({ existing: 'The Family Head cannot also be added as an additional member.' })
        return
      }
      if (
        stagedMembers.some(
          (m) => m.id !== editingMemberId && m.is_existing && m.existing_person?.id === selectedExistingMember.id
        )
      ) {
        setMemberErrors({ existing: 'This person has already been added to the family.' })
        return
      }

      const updated: StagedMember = {
        id: editingMemberId || `member_${Date.now()}`,
        is_existing: true,
        existing_person: selectedExistingMember,
        relationship_to_head: memberRelationship,
        form_values: {
          ...INITIAL_PERSON_VALUES,
          first_name: selectedExistingMember.first_name,
          middle_name: selectedExistingMember.middle_name || '',
          last_name: selectedExistingMember.last_name,
          gender: (selectedExistingMember.gender as 'MALE' | 'FEMALE' | 'OTHER') || 'MALE',
          date_of_birth: selectedExistingMember.date_of_birth || '',
          city: selectedExistingMember.city || familyCity,
          state: selectedExistingMember.state || familyState,
          country: selectedExistingMember.country || familyCountry,
          gotra: selectedExistingMember.gotra || familyGotra,
          nukh: selectedExistingMember.nukh || familyNukh,
          phone: selectedExistingMember.phone || '',
          email: selectedExistingMember.email_contact || '',
        },
      }

      if (editingMemberId) {
        setStagedMembers((prev) => prev.map((m) => (m.id === editingMemberId ? updated : m)))
      } else {
        setStagedMembers((prev) => [...prev, updated])
      }
      setShowMemberModal(false)
      return
    }

    // New Member
    const errs = validatePersonFields(memberForm)
    if (Object.keys(errs).length > 0) {
      setMemberErrors(errs)
      return
    }

    const updated: StagedMember = {
      id: editingMemberId || `member_${Date.now()}`,
      is_existing: false,
      existing_person: null,
      relationship_to_head: memberRelationship,
      form_values: { ...memberForm },
    }

    if (editingMemberId) {
      setStagedMembers((prev) => prev.map((m) => (m.id === editingMemberId ? updated : m)))
    } else {
      setStagedMembers((prev) => [...prev, updated])
    }
    setShowMemberModal(false)
  }

  function handleRemoveStagedMember(id: string) {
    setStagedMembers((prev) => prev.filter((m) => m.id !== id))
  }

  function handleProceedToStep4() {
    setStep(4)
  }

  // ---------------------------------------------------------------------------
  // STEP 4: FINAL SUBMISSION VIA ATOMIC RPC
  // ---------------------------------------------------------------------------
  async function handleFinalSubmit() {
    setGeneralError(null)

    if (!user?.id) {
      setGeneralError('You must be logged in to register a family.')
      setShowConfirmModal(false)
      return
    }

    setIsSubmitting(true)

    try {
      // Build head payload
      const headPayload =
        headMode === 'existing'
          ? {
              is_existing: true,
              person_id: selectedExistingHead!.id,
            }
          : {
              is_existing: false,
              first_name: headForm.first_name.trim(),
              middle_name: headForm.middle_name.trim() || null,
              last_name: headForm.last_name.trim(),
              gender: headForm.gender,
              date_of_birth: headForm.date_of_birth,
              city: headForm.city.trim(),
              state: headForm.state.trim(),
              country: headForm.country.trim(),
              gotra: headForm.gotra.trim(),
              nukh: headForm.nukh.trim(),
              phone: headForm.phone.trim(),
              email: headForm.email.trim(),
              maiden_name: headForm.maiden_name.trim() || null,
              birth_place: headForm.birth_place.trim() || headForm.city.trim(),
              date_of_death: headForm.date_of_death || null,
              phone_secondary: headForm.phone_secondary.trim() || null,
              blood_group: headForm.blood_group.trim(),
              blood_group_consent: Boolean(headForm.blood_group_consent),
              kul: headForm.kul.trim() || null,
            }

      // Build staged members payload
      const membersPayload: RegistrationMemberInput[] = stagedMembers.map((m) => {
        if (m.is_existing && m.existing_person) {
          return {
            is_existing: true,
            person_id: m.existing_person.id,
            relationship_to_head: m.relationship_to_head,
          }
        }
        return {
          is_existing: false,
          relationship_to_head: m.relationship_to_head,
          first_name: m.form_values.first_name.trim(),
          middle_name: m.form_values.middle_name.trim() || null,
          last_name: m.form_values.last_name.trim(),
          gender: m.form_values.gender,
          date_of_birth: m.form_values.date_of_birth,
          city: m.form_values.city.trim(),
          state: m.form_values.state.trim(),
          country: m.form_values.country.trim(),
          gotra: m.form_values.gotra.trim(),
          nukh: m.form_values.nukh.trim(),
          phone: m.form_values.phone.trim(),
          email: m.form_values.email.trim(),
          maiden_name: m.form_values.maiden_name.trim() || null,
          birth_place: m.form_values.birth_place.trim() || m.form_values.city.trim(),
          date_of_death: m.form_values.date_of_death || null,
          phone_secondary: m.form_values.phone_secondary.trim() || null,
          blood_group: m.form_values.blood_group.trim(),
          blood_group_consent: Boolean(m.form_values.blood_group_consent),
          kul: m.form_values.kul.trim() || null,
        }
      })

      const completePayload: CompleteFamilyRegistrationPayload = {
        family: {
          family_name: familyName.trim(),
          selected_mukhi_id: selectedMukhiId,
          city: familyCity.trim(),
          state: familyState.trim(),
          country: familyCountry.trim() || 'India',
          gotra: familyGotra.trim(),
          nukh: familyNukh.trim(),
          description: familyDescription.trim() || null,
          kul: familyKul.trim() || null,
        },
        head: headPayload,
        members: membersPayload,
      }

      const res = await registerCompleteFamily(completePayload, user.id)

      if (res.error || !res.data) {
        throw new Error(res.error?.message || 'Failed to register complete family.')
      }

      setShowConfirmModal(false)

      // Invalidate relevant cache queries
      await queryClient.invalidateQueries({ queryKey: ['families'] })
      await queryClient.invalidateQueries({ queryKey: ['family-members'] })
      await queryClient.invalidateQueries({ queryKey: ['persons'] })
      await queryClient.invalidateQueries({ queryKey: ['relationships'] })

      navigate(ROUTES.FAMILIES, {
        state: {
          highlightFamilyId: res.data.family_id,
          message: `Family "${familyName}" registered successfully with designated Head and ${stagedMembers.length} member(s)!`,
        },
      })
    } catch (err) {
      setShowConfirmModal(false)
      setGeneralError(
        (err as { message?: string }).message || 'Failed to register family. Please check the entered details and try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper renderer for Person form (used for Head Option A and Member Option A)
  function renderPersonForm(
    values: PersonFormValues,
    errors: Record<string, string>,
    onChange: (field: keyof PersonFormValues, val: string | boolean) => void,
    idPrefix: string
  ) {
    return (
      <div className="space-y-4">
        {/* Name Fields: Exact Order 1. First, 2. Middle, 3. Last */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${idPrefix}-first-name`} className="block text-sm font-medium text-navy-700">
              1. First Name <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-first-name`}
              value={values.first_name}
              onChange={(e) => onChange('first_name', e.target.value)}
              placeholder="e.g. Ramesh"
              error={errors.first_name}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-middle-name`} className="block text-sm font-medium text-navy-700">
              2. Middle Name
            </label>
            <Input
              id={`${idPrefix}-middle-name`}
              value={values.middle_name}
              onChange={(e) => onChange('middle_name', e.target.value)}
              placeholder="Father's / Husband's Name (optional)"
              error={errors.middle_name}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-last-name`} className="block text-sm font-medium text-navy-700">
              3. Last Name / Surname <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-last-name`}
              value={values.last_name}
              onChange={(e) => onChange('last_name', e.target.value)}
              placeholder="e.g. Khatri / Vyas"
              error={errors.last_name}
            />
          </div>
        </div>

        {/* Identity: 4. Gender, 5. Date of Birth, 6. Blood Group, 7. Birthplace */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-gender`} className="block text-sm font-medium text-navy-700">
              4. Gender <span className="text-red-500">*</span>
            </label>
            <select
              id={`${idPrefix}-gender`}
              value={values.gender}
              onChange={(e) => onChange('gender', e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
              className="mt-1 block w-full rounded-md border border-navy-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
            {errors.gender && <p className="mt-1 text-xs text-red-600">{errors.gender}</p>}
          </div>

          <div>
            <label htmlFor={`${idPrefix}-dob`} className="block text-sm font-medium text-navy-700">
              5. Date of Birth <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-dob`}
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={values.date_of_birth}
              onChange={(e) => onChange('date_of_birth', e.target.value)}
              error={errors.date_of_birth}
            />
          </div>

          <div>
            <label htmlFor={`${idPrefix}-blood-group`} className="block text-sm font-medium text-navy-700">
              6. Blood Group <span className="text-red-500">*</span>
            </label>
            <select
              id={`${idPrefix}-blood-group`}
              value={values.blood_group}
              onChange={(e) => onChange('blood_group', e.target.value)}
              className="mt-1 block w-full rounded-md border border-navy-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Select Blood Group</option>
              {BLOOD_GROUP_OPTIONS.map((bg) => (
                <option key={bg.value} value={bg.value}>
                  {bg.label}
                </option>
              ))}
            </select>
            {errors.blood_group && <p className="mt-1 text-xs text-red-600">{errors.blood_group}</p>}
          </div>

          <div>
            <label htmlFor={`${idPrefix}-birth-place`} className="block text-sm font-medium text-navy-700">
              7. Birthplace <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-birth-place`}
              value={values.birth_place}
              onChange={(e) => onChange('birth_place', e.target.value)}
              placeholder="e.g. Anand, Gujarat"
              error={errors.birth_place}
            />
          </div>
        </div>

        {/* Location: 6. City, 7. State, 8. Country */}
        <div className="rounded-lg border border-navy-100 bg-navy-50/40 p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-600">
            Residential Location (Prepopulated from Family)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`${idPrefix}-city`} className="block text-xs font-medium text-navy-700">
                6. City / Town / Gaon <span className="text-red-500">*</span>
              </label>
              <Input
                id={`${idPrefix}-city`}
                value={values.city}
                onChange={(e) => onChange('city', e.target.value)}
                placeholder="City"
                error={errors.city}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-state`} className="block text-xs font-medium text-navy-700">
                7. State / Province <span className="text-red-500">*</span>
              </label>
              <Input
                id={`${idPrefix}-state`}
                value={values.state}
                onChange={(e) => onChange('state', e.target.value)}
                placeholder="State"
                error={errors.state}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-country`} className="block text-xs font-medium text-navy-700">
                8. Country <span className="text-red-500">*</span>
              </label>
              <Input
                id={`${idPrefix}-country`}
                value={values.country}
                onChange={(e) => onChange('country', e.target.value)}
                placeholder="Country"
                error={errors.country}
              />
            </div>
          </div>
        </div>

        {/* Lineage: 9. Gotra & 10. Nukh */}
        <div className="rounded-lg border border-navy-100 bg-navy-50/40 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-600">
            Lineage & Heritage (Prepopulated from Family)
          </p>
          <GotraNukhSelect
            gotraId={`${idPrefix}-gotra`}
            nukhId={`${idPrefix}-nukh`}
            selectedGotra={values.gotra}
            selectedNukh={values.nukh}
            onGotraChange={(gotra) => {
              onChange('gotra', gotra)
              onChange('nukh', '') // Clears Nukh on Gotra change
            }}
            onNukhChange={(nukh) => onChange('nukh', nukh)}
            gotraError={errors.gotra}
            nukhError={errors.nukh}
            required
          />
        </div>

        {/* Contact: 11. Phone & 12. Email */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-phone`} className="block text-sm font-medium text-navy-700">
              11. Primary Phone Number <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-phone`}
              type="tel"
              value={values.phone}
              onChange={(e) => onChange('phone', e.target.value)}
              placeholder="e.g. 9876543210"
              error={errors.phone}
            />
            <p className="mt-1 text-xs text-navy-500">Multiple family members may share phone numbers.</p>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-email`} className="block text-sm font-medium text-navy-700">
              12. Email Address <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-email`}
              type="email"
              value={values.email}
              onChange={(e) => onChange('email', e.target.value)}
              placeholder="name@example.com"
              error={errors.email}
            />
            <p className="mt-1 text-xs text-navy-500">Multiple family members may share email addresses.</p>
          </div>
        </div>

        {/* Optional Fields Collapsible / Grid */}
        <div className="pt-2 border-t border-navy-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-3">Optional Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idPrefix}-maiden-name`} className="block text-sm font-medium text-navy-700">
                Maiden Name
              </label>
              <Input
                id={`${idPrefix}-maiden-name`}
                value={values.maiden_name}
                onChange={(e) => onChange('maiden_name', e.target.value)}
                placeholder="Optional maiden name"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-dod`} className="block text-sm font-medium text-navy-700">
                Date of Death (Deceased)
              </label>
              <Input
                id={`${idPrefix}-dod`}
                type="date"
                value={values.date_of_death}
                onChange={(e) => onChange('date_of_death', e.target.value)}
                error={errors.date_of_death}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-phone-sec`} className="block text-sm font-medium text-navy-700">
                Secondary Phone Number
              </label>
              <Input
                id={`${idPrefix}-phone-sec`}
                type="tel"
                value={values.phone_secondary}
                onChange={(e) => onChange('phone_secondary', e.target.value)}
                placeholder="Alternate phone"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-kul`} className="block text-sm font-medium text-navy-700">
                Kul / Sub-lineage
              </label>
              <Input
                id={`${idPrefix}-kul`}
                value={values.kul}
                onChange={(e) => onChange('kul', e.target.value)}
                placeholder="Optional Kul"
              />
            </div>
          </div>

          {/* Blood Group Sharing Consent (Shown ONLY when blood group is provided) */}
          {Boolean(values.blood_group) && (
            <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={values.blood_group_consent}
                  onChange={(e) => onChange('blood_group_consent', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs text-brand-900 leading-relaxed">
                  <strong>Blood Group Sharing Consent:</strong> I explicitly consent to make this blood group visible to verified community members for emergency medical assistance.
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Brand Header Banner */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 text-white p-4 rounded-xl shadow-sm border border-navy-700">
        <BrandLogo size="md" className="shrink-0" />
        <div>
          <h2 className="text-base font-bold tracking-tight text-amber-300 uppercase">
            KHATRI SARVANIYAT
          </h2>
          <p className="text-xs text-navy-200">
            Official Community Census & Family Registration System
          </p>
        </div>
      </div>

      {/* 4-Step Progress Navigation */}
      <nav aria-label="Registration Progress" className="flex items-center justify-between border-b border-navy-200 pb-4">
        {[
          { num: 1, label: '1. Family Details' },
          { num: 2, label: '2. Family Head' },
          { num: 3, label: '3. Additional Members' },
          { num: 4, label: '4. Review & Confirm' },
        ].map((s, idx) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 text-xs sm:text-sm font-semibold transition-colors ${
                step === s.num ? 'text-brand-600' : step > s.num ? 'text-emerald-700' : 'text-navy-400'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  step === s.num
                    ? 'bg-brand-600 text-white shadow-sm'
                    : step > s.num
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {step > s.num ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.num}</span>
            </div>
            {idx < 3 && <span className="text-slate-300 font-bold mx-1">/</span>}
          </div>
        ))}
      </nav>

      {/* Global Error Banner */}
      {generalError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3 shadow-sm"
        >
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Action Required</p>
            <p className="mt-0.5">{generalError}</p>
          </div>
          <button
            type="button"
            onClick={() => setGeneralError(null)}
            className="text-red-600 hover:text-red-900 text-sm font-bold"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* STEP 1: FAMILY DETAILS                                                */}
      {/* --------------------------------------------------------------------- */}
      {step === 1 && (
        <div className="space-y-6 bg-white p-6 rounded-xl border border-navy-100 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-navy-900">Step 1: Family Details</h3>
            <p className="text-xs text-navy-500 mt-0.5">
              Specify household identity, designated Community Mukhi representative, location, and lineage.
            </p>
          </div>

          <div className="space-y-4">
            {/* 1. Family Name / Household Title */}
            <div>
              <label htmlFor="reg-family-name" className="block text-sm font-medium text-navy-700">
                1. Family Name / Household Title <span className="text-red-500">*</span>
              </label>
              <Input
                id="reg-family-name"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="e.g. Suthar Family, Pamnani Parivar, Vyas Family"
                error={familyErrors.family_name}
              />
            </div>

            {/* 2. Mukhi Selection (From approved 118 records; no free-form) */}
            <div className="space-y-2 rounded-lg border border-navy-200 bg-navy-50/50 p-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-navy-900">
                  2. Community Mukhi Representative <span className="text-red-500">*</span>
                </label>
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                  118 Approved Mukhis
                </span>
              </div>
              <p className="text-xs text-navy-600">
                Search and assign the official Mukhi representative from the verified Directory.
              </p>

              {/* Mukhi Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-navy-400" />
                <input
                  type="text"
                  value={mukhiSearchQuery}
                  onChange={(e) => setMukhiSearchQuery(e.target.value)}
                  placeholder="Filter Mukhi by name, gram/city, phone, or serial number..."
                  className="w-full rounded-md border border-navy-300 pl-9 pr-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Mukhi Scrollable List */}
              <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-md border border-navy-200 bg-white p-2">
                {isMukhisLoading ? (
                  <p className="text-xs text-navy-500 py-3 text-center">Loading official Mukhi directory...</p>
                ) : filteredMukhis.length === 0 ? (
                  <p className="text-xs text-navy-500 py-3 text-center">No Mukhi found matching search criteria.</p>
                ) : (
                  filteredMukhis.map((m) => {
                    const isSelected = selectedMukhiId === m.id
                    const isMatch = isLocationMatch(m.gram, familyCity)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMukhiId(m.id)}
                        className={`w-full text-left p-2.5 rounded-md transition-colors flex items-center justify-between border ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-900 ring-1 ring-brand-500'
                            : 'border-slate-200 hover:bg-slate-50 text-navy-800'
                        }`}
                      >
                        <div className="flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-navy-500">#{m.source_serial_number}</span>
                            <span className="text-sm font-semibold">{m.full_name}</span>
                            {isMatch && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                                Location Match
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-navy-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {m.gram}
                            </span>
                            {m.mobile_number && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {m.mobile_number}
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-brand-600 shrink-0 stroke-[3]" />}
                      </button>
                    )
                  })
                )}
              </div>
              {familyErrors.selected_mukhi_id && (
                <p className="text-xs text-red-600 font-semibold">{familyErrors.selected_mukhi_id}</p>
              )}
            </div>

            {/* 3. City, 4. State, 5. Country via CitySelector */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy-700">
                3. City / Gaon, 4. State & 5. Country <span className="text-red-500">*</span>
              </label>
              <CitySelector
                value={familyCity}
                selectedState={familyState}
                selectedCountry={familyCountry}
                onSelectCity={(sel) => {
                  setFamilyCity(sel.city)
                  setFamilyState(sel.state)
                  setFamilyCountry(sel.country)
                }}
                error={familyErrors.city || familyErrors.state || familyErrors.country}
                placeholder="Search city / village or add new..."
              />
            </div>

            {/* Manual override for location if required */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-navy-600">City / Gaon</label>
                <Input
                  value={familyCity}
                  onChange={(e) => setFamilyCity(e.target.value)}
                  placeholder="City"
                  error={familyErrors.city}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-600">State / Province</label>
                <Input
                  value={familyState}
                  onChange={(e) => setFamilyState(e.target.value)}
                  placeholder="State"
                  error={familyErrors.state}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-600">Country</label>
                <Input
                  value={familyCountry}
                  onChange={(e) => setFamilyCountry(e.target.value)}
                  placeholder="Country"
                  error={familyErrors.country}
                />
              </div>
            </div>

            {/* 6. Gotra & 7. Nukh */}
            <div className="rounded-lg border border-navy-100 bg-navy-50/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-700 mb-2">
                6. Gotra & 7. Nukh Lineage <span className="text-red-500">*</span>
              </p>
              <GotraNukhSelect
                selectedGotra={familyGotra}
                selectedNukh={familyNukh}
                onGotraChange={(gotra) => {
                  setFamilyGotra(gotra)
                  setFamilyNukh('') // Clears Nukh on Gotra change
                }}
                onNukhChange={(nukh) => setFamilyNukh(nukh)}
                gotraError={familyErrors.gotra}
                nukhError={familyErrors.nukh}
                required
              />
            </div>

            {/* Optional Fields: Description & Kul */}
            <div className="space-y-3 pt-2 border-t border-navy-100">
              <div>
                <label htmlFor="reg-desc" className="block text-sm font-medium text-navy-700">
                  Description / Family History / Notes (Optional)
                </label>
                <textarea
                  id="reg-desc"
                  rows={3}
                  value={familyDescription}
                  onChange={(e) => setFamilyDescription(e.target.value)}
                  placeholder="Brief history, ancestral roots, or household notes..."
                  className="mt-1 block w-full rounded-md border border-navy-300 p-2.5 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label htmlFor="reg-kul" className="block text-sm font-medium text-navy-700">
                  Kul / Sub-lineage (Optional)
                </label>
                <Input
                  id="reg-kul"
                  value={familyKul}
                  onChange={(e) => setFamilyKul(e.target.value)}
                  placeholder="Optional Kul classification"
                />
              </div>
            </div>
          </div>

          {/* Step 1 Actions */}
          <div className="flex justify-end pt-4 border-t border-navy-100">
            <Button type="button" onClick={handleProceedToStep2} className="flex items-center gap-2">
              Proceed to Family Head
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* STEP 2: FAMILY HEAD                                                   */}
      {/* --------------------------------------------------------------------- */}
      {step === 2 && (
        <div className="space-y-6 bg-white p-6 rounded-xl border border-navy-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-navy-900">Step 2: Designate Family Head</h3>
              <p className="text-xs text-navy-500 mt-0.5">
                Every family must have an active designated head. Create a new canonical person or attach an existing record.
              </p>
            </div>
            <span className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-900 font-bold text-xs rounded-full">
              <Crown className="h-3.5 w-3.5 text-amber-600" />
              Family Head
            </span>
          </div>

          {/* Option A vs Option B Toggle */}
          <div className="grid grid-cols-2 gap-3 p-1 bg-navy-50 rounded-lg border border-navy-200">
            <button
              type="button"
              onClick={() => setHeadMode('new')}
              className={`py-2 text-xs sm:text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 ${
                headMode === 'new'
                  ? 'bg-white text-navy-900 shadow-sm border border-navy-200'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Option A: Create New Person
            </button>
            <button
              type="button"
              onClick={() => setHeadMode('existing')}
              className={`py-2 text-xs sm:text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 ${
                headMode === 'existing'
                  ? 'bg-white text-navy-900 shadow-sm border border-navy-200'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <Search className="h-4 w-4" />
              Option B: Select Existing Person
            </button>
          </div>

          {headMode === 'new' ? (
            renderPersonForm(
              headForm,
              headErrors,
              (field, val) => setHeadForm((prev) => ({ ...prev, [field]: val })),
              'head'
            )
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-navy-600">
                Search the community directory by name or phone to designate an existing registered person as head.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-navy-400" />
                <input
                  type="text"
                  value={headSearchQuery}
                  onChange={(e) => setHeadSearchQuery(e.target.value)}
                  placeholder="Search by name, phone, or location..."
                  className="w-full rounded-md border border-navy-300 pl-9 pr-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-md border border-navy-200 bg-white p-2">
                {filteredPersonsForHead.length === 0 ? (
                  <p className="text-xs text-navy-500 py-4 text-center">No matching persons found.</p>
                ) : (
                  filteredPersonsForHead.map((p) => {
                    const isSelected = selectedExistingHead?.id === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedExistingHead(p)}
                        className={`w-full text-left p-2.5 rounded-md transition-colors flex items-center justify-between border ${
                          isSelected
                            ? 'bg-brand-50 border-brand-500 text-brand-900 ring-1 ring-brand-500'
                            : 'border-slate-200 hover:bg-slate-50 text-navy-800'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {p.first_name} {p.middle_name} {p.last_name}
                          </p>
                          <p className="text-xs text-navy-500">
                            {p.gender || 'Person'} • Gotra: {p.gotra || '—'} ({p.nukh || '—'}) • {p.city || p.birth_place || 'India'}
                          </p>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-brand-600 shrink-0 stroke-[3]" />}
                      </button>
                    )
                  })
                )}
              </div>

              {selectedExistingHead && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    Selected Head: <strong>{selectedExistingHead.first_name} {selectedExistingHead.last_name}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Step 2 Actions */}
          <div className="flex justify-between pt-4 border-t border-navy-100">
            <Button type="button" variant="secondary" onClick={() => setStep(1)} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Family Details
            </Button>
            <Button type="button" onClick={handleProceedToStep3} className="flex items-center gap-2">
              Proceed to Additional Members
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* STEP 3: ADDITIONAL FAMILY MEMBERS                                     */}
      {/* --------------------------------------------------------------------- */}
      {step === 3 && (
        <div className="space-y-6 bg-white p-6 rounded-xl border border-navy-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-navy-900">Step 3: Additional Family Members</h3>
              <p className="text-xs text-navy-500 mt-0.5">
                Add family members (Spouse, Children, Parents, Siblings) and stage them before final atomic registration.
              </p>
            </div>
            <Button type="button" onClick={handleOpenAddMemberModal} className="flex items-center gap-1.5 text-xs">
              <Plus className="h-4 w-4" />
              Add Member
            </Button>
          </div>

          {/* Staged Members Roster */}
          {stagedMembers.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40">
              <Users className="h-10 w-10 text-navy-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-navy-800">No Additional Members Added Yet</h4>
              <p className="text-xs text-navy-500 max-w-sm mx-auto mt-1 mb-4">
                You can add spouses, children, parents, or siblings now, or proceed directly to review if this is a single-person household.
              </p>
              <Button type="button" variant="secondary" onClick={handleOpenAddMemberModal} className="text-xs">
                + Add First Member
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {stagedMembers.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-lg border border-navy-200 bg-white flex items-center justify-between shadow-sm hover:border-brand-300 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 bg-brand-100 text-brand-800 rounded">
                        {m.relationship_to_head}
                      </span>
                      <h4 className="text-sm font-bold text-navy-900">
                        {m.form_values.first_name} {m.form_values.middle_name} {m.form_values.last_name}
                      </h4>
                      {m.is_existing && (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                          Existing Record
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-navy-500 mt-1">
                      <span>Gender: {m.form_values.gender}</span>
                      {m.form_values.date_of_birth && <span>DOB: {m.form_values.date_of_birth}</span>}
                      <span>Gotra: {m.form_values.gotra || '—'}</span>
                      {m.form_values.phone && <span>Phone: {m.form_values.phone}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditMemberModal(m)}
                      className="p-1.5 text-navy-600 hover:text-navy-900 hover:bg-navy-50 rounded"
                      title="Edit member"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveStagedMember(m.id)}
                      className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 3 Actions */}
          <div className="flex justify-between pt-4 border-t border-navy-100">
            <Button type="button" variant="secondary" onClick={() => setStep(2)} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Family Head
            </Button>
            <Button type="button" onClick={handleProceedToStep4} className="flex items-center gap-2">
              Proceed to Review & Confirm
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* STEP 4: REVIEW AND CONFIRM                                            */}
      {/* --------------------------------------------------------------------- */}
      {step === 4 && (
        <div className="space-y-6 bg-white p-6 rounded-xl border border-navy-100 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-navy-900">Step 4: Review and Confirm</h3>
            <p className="text-xs text-navy-500 mt-0.5">
              Please inspect the complete family registry summary before submitting. All records will be atomically persisted.
            </p>
          </div>

          {/* Section 1: Family Details Card */}
          <div className="rounded-xl border border-navy-200 bg-navy-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-navy-200 pb-2">
              <h4 className="text-sm font-bold text-navy-900">1. Family Details</h4>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit Details
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <span className="text-navy-500">Family Name:</span>{' '}
                <strong className="text-navy-900">{familyName}</strong>
              </div>
              <div>
                <span className="text-navy-500">Designated Mukhi:</span>{' '}
                <strong className="text-navy-900">
                  {selectedMukhi ? `#${selectedMukhi.source_serial_number} ${selectedMukhi.full_name} (${selectedMukhi.gram})` : '—'}
                </strong>
              </div>
              <div>
                <span className="text-navy-500">Location:</span>{' '}
                <span className="text-navy-900 font-medium">{familyCity}, {familyState}, {familyCountry}</span>
              </div>
              <div>
                <span className="text-navy-500">Gotra & Nukh:</span>{' '}
                <span className="text-navy-900 font-medium">{familyGotra} • {familyNukh}</span>
              </div>
              {familyDescription && (
                <div className="sm:col-span-2">
                  <span className="text-navy-500">Description:</span>{' '}
                  <span className="text-navy-800">{familyDescription}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Family Head Card */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-amber-200 pb-2">
              <div className="flex items-center gap-1.5">
                <Crown className="h-4 w-4 text-amber-600" />
                <h4 className="text-sm font-bold text-navy-900">2. Family Head</h4>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit Head
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <span className="text-navy-500">Full Name:</span>{' '}
                <strong className="text-navy-900">
                  {headMode === 'existing'
                    ? `${selectedExistingHead?.first_name} ${selectedExistingHead?.middle_name || ''} ${selectedExistingHead?.last_name}`
                    : `${headForm.first_name} ${headForm.middle_name} ${headForm.last_name}`}
                </strong>
              </div>
              <div>
                <span className="text-navy-500">Mode:</span>{' '}
                <span className="font-medium text-navy-800">{headMode === 'existing' ? 'Existing Record' : 'New Person'}</span>
              </div>
              <div>
                <span className="text-navy-500">Gender & DOB:</span>{' '}
                <span className="text-navy-800">
                  {headMode === 'existing'
                    ? `${selectedExistingHead?.gender || '—'} • ${selectedExistingHead?.date_of_birth || '—'}`
                    : `${headForm.gender} • ${headForm.date_of_birth}`}
                </span>
              </div>
              <div>
                <span className="text-navy-500">Contact:</span>{' '}
                <span className="text-navy-800">
                  {headMode === 'existing'
                    ? `${selectedExistingHead?.phone || '—'} • ${selectedExistingHead?.email_contact || '—'}`
                    : `${headForm.phone} • ${headForm.email}`}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Additional Members Card */}
          <div className="rounded-xl border border-navy-200 bg-navy-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-navy-200 pb-2">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-navy-600" />
                <h4 className="text-sm font-bold text-navy-900">
                  3. Additional Members ({stagedMembers.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit Members
              </button>
            </div>

            {stagedMembers.length === 0 ? (
              <p className="text-xs text-navy-500 py-1">No additional members added (Single person household).</p>
            ) : (
              <div className="divide-y divide-navy-100">
                {stagedMembers.map((m) => (
                  <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-brand-700 mr-2">[{m.relationship_to_head}]</span>
                      <strong className="text-navy-900">
                        {m.form_values.first_name} {m.form_values.middle_name} {m.form_values.last_name}
                      </strong>
                      <span className="text-navy-500 ml-2">
                        ({m.form_values.gender}, DOB: {m.form_values.date_of_birth || '—'})
                      </span>
                    </div>
                    <span className="text-navy-500">{m.form_values.phone || m.form_values.city}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 4 Actions */}
          <div className="flex justify-between pt-4 border-t border-navy-100">
            <Button type="button" variant="secondary" onClick={() => setStep(3)} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Members
            </Button>
            <Button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              Confirm & Register Family
            </Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* ADD / EDIT MEMBER MODAL                                               */}
      {/* --------------------------------------------------------------------- */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-navy-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-navy-200 pb-3">
              <h3 className="text-base font-bold text-navy-900">
                {editingMemberId ? 'Edit Family Member' : 'Add Family Member'}
              </h3>
              <button
                type="button"
                onClick={() => setShowMemberModal(false)}
                className="text-navy-400 hover:text-navy-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Relationship to Head Selector */}
            <div>
              <label htmlFor="member-relationship" className="block text-sm font-bold text-navy-800">
                Relationship to Family Head <span className="text-red-500">*</span>
              </label>
              <select
                id="member-relationship"
                value={memberRelationship}
                onChange={(e) => setMemberRelationship(e.target.value)}
                className="mt-1 block w-full rounded-md border border-navy-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Option A vs Option B Toggle */}
            <div className="grid grid-cols-2 gap-3 p-1 bg-navy-50 rounded-lg border border-navy-200">
              <button
                type="button"
                onClick={() => setMemberMode('new')}
                className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  memberMode === 'new'
                    ? 'bg-white text-navy-900 shadow-sm border border-navy-200'
                    : 'text-navy-600 hover:text-navy-900'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                New Person
              </button>
              <button
                type="button"
                onClick={() => setMemberMode('existing')}
                className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  memberMode === 'existing'
                    ? 'bg-white text-navy-900 shadow-sm border border-navy-200'
                    : 'text-navy-600 hover:text-navy-900'
                }`}
              >
                <Search className="h-3.5 w-3.5" />
                Select Existing
              </button>
            </div>

            {memberMode === 'new' ? (
              renderPersonForm(
                memberForm,
                memberErrors,
                (field, val) => setMemberForm((prev) => ({ ...prev, [field]: val })),
                'member'
              )
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-navy-600">
                  Search and attach an existing registered community person.
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-navy-400" />
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Search by name, phone, or location..."
                    className="w-full rounded-md border border-navy-300 pl-9 pr-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-md border border-navy-200 bg-white p-2">
                  {filteredPersonsForMember.length === 0 ? (
                    <p className="text-xs text-navy-500 py-3 text-center">No matching persons found.</p>
                  ) : (
                    filteredPersonsForMember.map((p) => {
                      const isSelected = selectedExistingMember?.id === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedExistingMember(p)}
                          className={`w-full text-left p-2.5 rounded-md transition-colors flex items-center justify-between border ${
                            isSelected
                              ? 'bg-brand-50 border-brand-500 text-brand-900 ring-1 ring-brand-500'
                              : 'border-slate-200 hover:bg-slate-50 text-navy-800'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold">
                              {p.first_name} {p.middle_name} {p.last_name}
                            </p>
                            <p className="text-xs text-navy-500">
                              {p.gender || 'Person'} • Gotra: {p.gotra || '—'} ({p.nukh || '—'}) • {p.city || p.birth_place || 'India'}
                            </p>
                          </div>
                          {isSelected && <Check className="h-5 w-5 text-brand-600 shrink-0 stroke-[3]" />}
                        </button>
                      )
                    })
                  )}
                </div>

                {memberErrors.existing && (
                  <p className="text-xs text-red-600 font-semibold">{memberErrors.existing}</p>
                )}

                {selectedExistingMember && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      Selected Member: <strong>{selectedExistingMember.first_name} {selectedExistingMember.last_name}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-navy-200">
              <Button type="button" variant="secondary" onClick={() => setShowMemberModal(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveMemberModal}>
                {editingMemberId ? 'Update Member' : 'Add to Family'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* FINAL CONFIRMATION DIALOG                                             */}
      {/* --------------------------------------------------------------------- */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-navy-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-full text-emerald-700">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-navy-900">Confirm Family Registration</h3>
                <p className="text-xs text-navy-500">Atomic database transaction</p>
              </div>
            </div>

            <p className="text-sm text-navy-700 leading-relaxed">
              Are you sure you want to register family <strong>"{familyName}"</strong> with designated Head{' '}
              <strong>
                "{headMode === 'existing' ? selectedExistingHead?.first_name : headForm.first_name} {headMode === 'existing' ? selectedExistingHead?.last_name : headForm.last_name}"
              </strong>{' '}
              and <strong>{stagedMembers.length}</strong> additional member(s)?
            </p>

            <div className="rounded-lg bg-navy-50 p-3 text-xs text-navy-600 space-y-1">
              <p>• All records will be verified and atomically saved.</p>
              <p>• Mukhi: <strong>{selectedMukhi?.full_name}</strong></p>
              <p>• Gotra & Nukh: <strong>{familyGotra} • {familyNukh}</strong></p>
              <p>• Strict privacy standards are enforced by default.</p>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalSubmit}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering Family...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 stroke-[3]" />
                    Confirm & Register
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
