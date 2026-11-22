/**
 * EditMemberModal — Complete Family Member Editing for Authorized Family Heads.
 *
 * Requirements:
 * - Family Head who manages the family can edit all details of any member in their family.
 * - Personal Identity: First Name, Middle Name, Last Name, Gender, Date of Birth, Birthplace, City, State, Country.
 * - Contact Information: Country Calling Code (searchable 245 countries), Mobile Number (optional), Email (optional).
 * - Community Information: Gotra, Nukh, Blood Group.
 * - Occupation: Searchable dropdown with 30 official categories.
 * - Family Information: Relationship to Head (13 categories), Connecting Spouse (in-laws), Head of Family toggle.
 * - Deceased Status: Checkbox & Date of Death.
 * - Pre-fills all existing member values from person and membership records.
 * - Preserves family Mukhi assignment without creating separate member Mukhi records.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  X,
  AlertCircle,
  Crown,
  Heart,
  User,
  Phone,
  Briefcase,
  MapPin,
  CheckCircle2,
} from 'lucide-react'
import type { FamilyMemberWithPerson } from '../services/family-members.service'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useUpdateFamilyMember } from '../hooks/useFamilyMemberMutations'
import type { FamilyRole } from '@/types'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import { toProperCaseName } from '@/utils/text-casing'
import { RelationshipSelector } from '@/components/forms/RelationshipSelector'
import { TwoLevelOccupationSelect } from '@/components/forms/TwoLevelOccupationSelect'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import { CountryCodeSelect } from '@/components/forms/CountryCodeSelect'
import { COUNTRY_DIALING_CODES, DEFAULT_DIALING_CODE } from '@/constants/countryDialingCodes'
import { OCCUPATION_CATEGORIES, getCategoryForOccupation } from '@/constants/occupations'
import { BLOOD_GROUP_OPTIONS } from '@/constants/bloodGroup'
import { BloodGroupConsentCheckbox } from '@/components/forms/BloodGroupConsentCheckbox'
import { ProfilePhotoUpload } from '@/components/forms/ProfilePhotoUpload'
import { uploadAvatar, deleteAvatar } from '@/features/media/services/avatar.service'
import { updatePerson } from '@/features/people/services/people.service'
import { supabase } from '@/lib/supabase'
import {
  mapRelationshipToFamilyRole,
  formatRelationshipDisplay,
} from '@/constants/familyRelationships'

export interface EditMemberModalProps {
  member: FamilyMemberWithPerson | null
  familyId: string
  isOpen: boolean
  onClose: () => void
}

export function EditMemberModal({
  member,
  familyId,
  isOpen,
  onClose,
}: EditMemberModalProps) {
  const queryClient = useQueryClient()
  const updateMutation = useUpdateFamilyMember(familyId)
  const { data: familyMembers = [] } = useFamilyMembers(familyId)

  // 1. Personal Identity State
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE')
  const [ageMode, setAgeMode] = useState<'dob' | 'age'>('dob')
  const [dob, setDob] = useState('')
  const [currentAge, setCurrentAge] = useState('')
  const [birthPlace, setBirthPlace] = useState('')
  const [city, setCity] = useState('')
  const [stateName, setStateName] = useState('')
  const [country, setCountry] = useState('India')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)

  // 2. Contact Details State (Optional)
  const [countryCallingCode, setCountryCallingCode] = useState(DEFAULT_DIALING_CODE)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // 3. Community Information State
  const [gotra, setGotra] = useState('')
  const [nukh, setNukh] = useState('')
  const [bloodGroup, setBloodGroup] = useState(() => member?.person?.blood_group || '')
  const [showBloodGroupInDirectory, setShowBloodGroupInDirectory] = useState(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (member?.person as any) || {}
    return Boolean(
      p.blood_group_consent === true ||
      p.show_in_blood_directory === true ||
      p.show_blood_group_in_directory === true
    )
  })

  // 4. Occupation State (Two-Level: Category & Specific Occupation)
  const [occupation, setOccupation] = useState(() => {
    const rawOcc = (member?.person?.occupation || '').trim()
    const isPlaceholderOcc =
      !rawOcc ||
      rawOcc === 'Occupation Pending' ||
      rawOcc === 'Occupation Not Provided' ||
      rawOcc === 'Occupation Not Available' ||
      rawOcc === 'Occupation Rejected'
    return isPlaceholderOcc ? '' : rawOcc
  })
  const [occupationCategory, setOccupationCategory] = useState(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (member?.person as any) || {}
    const rawOcc = (p.occupation || '').trim()
    const isPlaceholderOcc =
      !rawOcc ||
      rawOcc === 'Occupation Pending' ||
      rawOcc === 'Occupation Not Provided' ||
      rawOcc === 'Occupation Not Available' ||
      rawOcc === 'Occupation Rejected'
    return p.occupation_category || (isPlaceholderOcc ? '' : getCategoryForOccupation(rawOcc)) || ''
  })

  // 5. Family & Relationship State
  const [role, setRole] = useState<FamilyRole>(member?.role ?? 'EXTENDED')
  const [relationship, setRelationship] = useState<string>('')
  const [isHead, setIsHead] = useState<boolean>(member?.is_head ?? false)
  const [connectedPersonId, setConnectedPersonId] = useState<string>('')

  // 6. Deceased Status State
  const [isDeceased, setIsDeceased] = useState<boolean>(false)
  const [dateOfDeath, setDateOfDeath] = useState('')

  // UI State
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Identify reference person (Family Head)
  const headMember = familyMembers.find((m) => m.is_head && m.person_id !== member?.person_id)
  const referencePerson = headMember || familyMembers.find((m) => m.person_id !== member?.person_id)

  const referencePersonName = referencePerson?.person
    ? toProperCaseName(`${referencePerson.person.first_name} ${referencePerson.person.last_name}`)
    : 'Family Head'

  // Candidate connecting spouses (other active members in this family)
  const candidateSpouses = useMemo(
    () =>
      familyMembers.filter(
        (m) => m.person_id !== member?.person_id && m.person?.status !== 'DECEASED'
      ),
    [familyMembers, member?.person_id]
  )

  const isInLaw = /sister-in-law|brother-in-law|साली|ननद|भाभी|जेठानी|देवरानी|साला|बहनोई|देवर|जेठ/i.test(relationship)

  const memberId = member?.id
  const personId = member?.person_id || member?.person?.id

  // Initialize and pre-fill all values from the existing person & membership records
  useEffect(() => {
    if (member && isOpen) {
      const p = member.person
      setFirstName(p?.first_name || '')
      setMiddleName(p?.middle_name || '')
      setLastName(p?.last_name || '')
      setGender((p?.gender as 'MALE' | 'FEMALE' | 'OTHER') || 'MALE')
      const initialDob = p?.date_of_birth ? p.date_of_birth.substring(0, 10) : ''
      setDob(initialDob)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initialAge = (p as any)?.current_age != null ? String((p as any).current_age) : ''
      setCurrentAge(initialAge)
      setAgeMode(initialDob ? 'dob' : (initialAge ? 'age' : 'dob'))
      setCurrentAvatarUrl(p?.avatar_url || null)
      setAvatarFile(null)
      setAvatarPreview(null)
      setBirthPlace(p?.birth_place || '')
      setCity(p?.city || '')
      setStateName(p?.state || '')
      setCountry(p?.country || 'India')

      // Parse phone into country code and local number
      const rawPhone = (p?.phone || '').trim()
      if (rawPhone.startsWith('+')) {
        const matched = COUNTRY_DIALING_CODES.find((c) => rawPhone.startsWith(c.dialing_code))
        if (matched) {
          setCountryCallingCode(matched.dialing_code)
          setPhone(rawPhone.slice(matched.dialing_code.length).trim())
        } else {
          setCountryCallingCode(DEFAULT_DIALING_CODE)
          setPhone(rawPhone)
        }
      } else {
        setCountryCallingCode(DEFAULT_DIALING_CODE)
        setPhone(rawPhone)
      }

      setEmail(p?.email_contact || '')
      setGotra(p?.gotra || '')
      setNukh(p?.nukh || '')
      setBloodGroup(p?.blood_group || '')
      const pRecord = p as unknown as {
        show_in_blood_directory?: boolean
        blood_group_consent?: boolean
        show_blood_group_in_directory?: boolean
        occupation_category?: string
        custom_occupation?: string
      }
      const consentVal = Boolean(
        pRecord?.blood_group_consent === true ||
        pRecord?.show_in_blood_directory === true ||
        pRecord?.show_blood_group_in_directory === true
      )
      setShowBloodGroupInDirectory(consentVal)

      const rawOcc = (p?.occupation || '').trim()
      const rawCat = (pRecord?.occupation_category || '').trim()
      const rawCustom = (pRecord?.custom_occupation || '').trim()
      const isPlaceholderOcc =
        !rawOcc ||
        rawOcc === 'Occupation Pending' ||
        rawOcc === 'Occupation Not Provided' ||
        rawOcc === 'Occupation Not Available' ||
        rawOcc === 'Occupation Rejected'

      if (isPlaceholderOcc) {
        if (rawCat && rawCat !== 'Other') {
          setOccupation(rawCustom || rawCat)
          setOccupationCategory(rawCat)
        } else if (rawCustom) {
          setOccupation(rawCustom)
          setOccupationCategory(rawCat || 'Other')
        } else {
          setOccupation('')
          setOccupationCategory('')
        }
      } else {
        setOccupation(rawCustom || rawOcc)
        setOccupationCategory(rawCat || getCategoryForOccupation(rawOcc) || 'Other')
      }
      setIsHead(Boolean(member.is_head))
      setRole(member.role)

      const deceasedFlag = Boolean(p?.is_deceased || p?.status === 'DECEASED' || p?.date_of_death)
      setIsDeceased(deceasedFlag)
      setDateOfDeath(p?.date_of_death ? p.date_of_death.substring(0, 10) : '')

      // Compute initial relationship display
      let initialRel = ''
      if (member.relationship_to_head) {
        initialRel = formatRelationshipDisplay(member.relationship_to_head)
      } else if (member.role) {
        if (member.role === 'CHILD') {
          initialRel = p?.gender === 'MALE' ? 'Son (बेटा)' : p?.gender === 'FEMALE' ? 'Daughter (बेटी)' : 'Child (संतान)'
        } else if (member.role === 'PARENT') {
          initialRel = p?.gender === 'MALE' ? 'Father (पिता)' : p?.gender === 'FEMALE' ? 'Mother (माता)' : 'Parent (माता या पिता)'
        } else if (member.role === 'SPOUSE') {
          initialRel = p?.gender === 'MALE' ? 'Husband (पति)' : p?.gender === 'FEMALE' ? 'Wife (पत्नी)' : 'Spouse (जीवनसाथी)'
        } else if (member.role === 'SIBLING') {
          initialRel = p?.gender === 'MALE' ? 'Brother (भाई)' : p?.gender === 'FEMALE' ? 'Sister (बहन)' : 'Sibling (भाई या बहन)'
        } else if (member.role === 'HEAD') {
          initialRel = p?.gender === 'FEMALE' ? 'Mother (माता)' : 'Father (पिता)'
        } else {
          initialRel = formatRelationshipDisplay(member.role)
        }
      }
      setRelationship(initialRel)
      setErrorMessage(null)
      setSuccessMessage(null)

      // Auto-select candidate spouse for sister-in-law if appropriate
      const isSisterInLawRel = /sister-in-law|भाभी|जेठानी|देवरानी/i.test(initialRel)
      if (isSisterInLawRel) {
        const brother = candidateSpouses.find(
          (c) => c.role === 'SIBLING' || /brother|भाई/i.test(c.relationship_to_head || '')
        )
        if (brother) {
          setConnectedPersonId(brother.person_id)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, memberId, personId])

  function handleRelationshipChange(newRel: string) {
    setRelationship(newRel)
    const newRole = mapRelationshipToFamilyRole(newRel)
    setRole(newRole)

    if (/sister-in-law|भाभी|जेठानी|देवरानी/i.test(newRel) && !connectedPersonId) {
      const brother = candidateSpouses.find(
        (c) => c.role === 'SIBLING' || /brother|भाई/i.test(c.relationship_to_head || '')
      )
      if (brother) setConnectedPersonId(brother.person_id)
    }
  }

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isSaving) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSaving, onClose])

  if (!isOpen || !member) return null

  const personDisplayName = member.person
    ? toProperCaseName(`${firstName || member.person.first_name} ${lastName || member.person.last_name}`)
    : 'Family Member'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!member) return

    const targetPersonId = member.person?.id || member.person_id
    const targetMemberId = member.id || member.person_id || member.person?.id

    if (!targetPersonId || !targetMemberId) {
      setErrorMessage('Invalid member record. Please close and re-open the dialog.')
      return
    }

    if (!firstName.trim()) {
      setErrorMessage('First Name is required.')
      return
    }
    if (!lastName.trim()) {
      setErrorMessage('Last Name is required.')
      return
    }

    setIsSaving(true)

    try {
      // Build full phone number with country calling code (optional)
      const cleanPhone = phone.trim()
      const formattedPhone = cleanPhone
        ? cleanPhone.startsWith('+')
          ? cleanPhone
          : `${countryCallingCode} ${cleanPhone}`
        : null

      // Clean occupation value (prevent persisting placeholder strings)
      const cleanOcc = occupation.trim()
      const cleanCat = occupationCategory.trim()
      const isPlaceholderOcc =
        !cleanOcc ||
        cleanOcc === 'Occupation Pending' ||
        cleanOcc === 'Occupation Not Provided' ||
        cleanOcc === 'Occupation Not Available' ||
        cleanOcc === 'Occupation Rejected'

      let chosenCategory: string | null = cleanCat || null
      let chosenSpecific: string | null = isPlaceholderOcc ? null : cleanOcc

      // If specific occupation is entered but category is missing, derive it from sub-occupation catalog
      if (chosenSpecific && (!chosenCategory || chosenCategory === 'Other')) {
        const derived = getCategoryForOccupation(chosenSpecific)
        if (derived) {
          chosenCategory = derived
        }
      }

      // If category is provided but specific occupation is empty, default specific to category
      if (chosenCategory && chosenCategory !== 'Other' && !chosenSpecific) {
        chosenSpecific = chosenCategory
      }

      // Canonical 30 Category for DB table:
      // The database trigger `validate_person_mandatory_fields_guard` requires `persons.occupation`
      // to match one of the 30 official categories in `public.occupations` (or 'Occupation Pending').
      let dbOfficialOccupation: string | null = null
      let dbCustomOccupation: string | null = null

      if (chosenCategory && chosenCategory !== 'Other') {
        const matchedOfficial = OCCUPATION_CATEGORIES.find(
          (c) => c.toLowerCase() === chosenCategory!.toLowerCase()
        )
        if (matchedOfficial) {
          dbOfficialOccupation = matchedOfficial
          if (chosenSpecific && chosenSpecific.toLowerCase() !== matchedOfficial.toLowerCase()) {
            dbCustomOccupation = chosenSpecific
          }
        }
      } else if (chosenCategory === 'Other' && chosenSpecific) {
        const detected = getCategoryForOccupation(chosenSpecific)
        dbOfficialOccupation = detected || 'Business and Entrepreneurship'
        dbCustomOccupation = chosenSpecific
      } else if (chosenSpecific) {
        const detected = getCategoryForOccupation(chosenSpecific)
        if (detected) {
          dbOfficialOccupation = detected
          chosenCategory = detected
          dbCustomOccupation = chosenSpecific
        }
      }

      const parsedCurrentAge =
        ageMode === 'age' && currentAge.trim() ? parseInt(currentAge.trim(), 10) : null
      const parsedDob =
        ageMode === 'dob' && dob ? dob : null

      // Prepare Person updates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const personUpdates: Record<string, any> = {
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
        gender,
        date_of_birth: parsedDob,
        current_age: parsedCurrentAge,
        date_of_death: isDeceased && dateOfDeath ? dateOfDeath : null,
        is_deceased: isDeceased,
        birth_place: birthPlace.trim() || null,
        city: city.trim() || null,
        state: stateName.trim() || null,
        country: country.trim() || null,
        phone: formattedPhone,
        email_contact: email.trim() || null,
        gotra: gotra.trim() || null,
        nukh: nukh.trim() || null,
        blood_group: bloodGroup || null,
        show_blood_group_in_directory: showBloodGroupInDirectory,
        blood_group_consent: showBloodGroupInDirectory,
        show_in_blood_directory: showBloodGroupInDirectory,
        occupation: dbOfficialOccupation,
        occupation_category: chosenCategory,
        custom_occupation: dbCustomOccupation,
      }

      // Prepare Membership updates
      const membershipUpdates = {
        role,
        relationship_to_head: relationship || null,
        is_head: isHead,
        reference_person_id: referencePerson?.person_id || null,
        connected_person_id: connectedPersonId || null,
      }

      // 1. Attempt transactional RPC first
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcError } = await (supabase.rpc as any)('update_family_member_complete', {
        p_member_id: targetMemberId,
        p_person_id: targetPersonId,
        p_family_id: familyId,
        p_person_data: personUpdates,
        p_membership_data: membershipUpdates,
      })

      // 2. Direct DB update to persons table guarantees persistence of blood_group_consent and occupation
      // regardless of RPC version deployed on backend
      try {
        const directPayload: Record<string, unknown> = {
          blood_group_consent: showBloodGroupInDirectory,
          show_in_blood_directory: showBloodGroupInDirectory,
          show_blood_group_in_directory: showBloodGroupInDirectory,
          occupation: dbOfficialOccupation,
        }
        if (chosenCategory) {
          directPayload.occupation_category = chosenCategory
        }
        if (dbCustomOccupation) {
          directPayload.custom_occupation = dbCustomOccupation
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: directErr } = await (supabase.from('persons') as any)
          .update(directPayload)
          .eq('id', targetPersonId)

        if (directErr && (directErr.code === 'PGRST204' || directErr.code === '42703')) {
          // If custom columns do not exist on persons table, update core columns
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('persons') as any)
            .update({
              blood_group_consent: showBloodGroupInDirectory,
              show_in_blood_directory: showBloodGroupInDirectory,
              show_blood_group_in_directory: showBloodGroupInDirectory,
              occupation: dbOfficialOccupation,
            })
            .eq('id', targetPersonId)
        }
      } catch {
        // Non-blocking if RLS or RPC handled
      }

      // If custom occupation entered, record in custom_occupations if table is available
      if (dbCustomOccupation) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from as any)('custom_occupations').insert({
            occupation_name: dbCustomOccupation,
            normalized_name: dbCustomOccupation.toLowerCase().trim(),
            category_name: chosenCategory || 'Other',
            is_approved: true,
            is_active: true,
          })
        } catch {
          // Non-blocking
        }
      }

      // 3. If RPC fails or is missing, fallback to direct services
      if (rpcError) {
        const personRes = await updatePerson(targetPersonId, personUpdates)
        if (personRes.error) {
          throw new Error(personRes.error.message || 'Failed to update person details.')
        }

        await updateMutation.mutateAsync({
          memberId: targetMemberId,
          input: membershipUpdates,
        })
      }

      // Update avatar if a new photo was selected or removed
      if (avatarFile && targetPersonId) {
        try {
          await uploadAvatar(avatarFile, { type: 'person', id: targetPersonId }, {
            previousAvatarUrl: member?.person?.avatar_url,
          })
        } catch {
          // Non-blocking
        }
      } else if (!currentAvatarUrl && !avatarFile && member?.person?.avatar_url && targetPersonId) {
        try {
          await deleteAvatar({ type: 'person', id: targetPersonId }, member.person.avatar_url)
        } catch {
          await updatePerson(targetPersonId, { avatar_url: null })
        }
      }

      setSuccessMessage('Member details updated successfully!')

      // Invalidate queries to refresh UI immediately across all sections
      queryClient.invalidateQueries({ queryKey: ['public-occupation-directory'] })
      queryClient.invalidateQueries({ queryKey: ['public-occupations'] })
      queryClient.invalidateQueries({ queryKey: ['blood-directory'] })
      queryClient.invalidateQueries({ queryKey: ['blood-directory-members'] })
      queryClient.invalidateQueries({ queryKey: ['blood-group-directory'] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      queryClient.invalidateQueries({ queryKey: ['person', targetPersonId] })
      queryClient.invalidateQueries({ queryKey: ['community-persons'] })
      queryClient.invalidateQueries({ queryKey: ['family-members'] })
      queryClient.invalidateQueries({ queryKey: ['family-members', familyId] })
      queryClient.invalidateQueries({ queryKey: ['family', familyId] })
      queryClient.invalidateQueries({ queryKey: ['families'] })
      queryClient.invalidateQueries({ queryKey: ['export-data'] })

      setTimeout(() => {
        setIsSaving(false)
        onClose()
      }, 700)
    } catch (err) {
      setIsSaving(false)
      setErrorMessage(
        (err as { message?: string }).message ??
          'Could not update member record. Please verify permissions and try again.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-member-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-3 sm:p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-navy-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4 bg-navy-50/70">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-brand-300">
              <User className="h-5 w-5" />
            </span>
            <div>
              <h2 id="edit-member-title" className="text-base sm:text-lg font-bold text-navy-900">
                Edit Family Member Details
              </h2>
              <p className="text-xs text-navy-500 font-medium">{personDisplayName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-200 hover:text-navy-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Alerts */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <p>{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs sm:text-sm text-emerald-800"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <p>{successMessage}</p>
            </div>
          )}

          {/* SECTION 1: Personal Identity */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <User className="h-4 w-4 text-brand-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800">
                1. Personal Identity
              </h3>
            </div>

            {/* Profile Photo Upload */}
            <div className="rounded-lg border border-navy-100 bg-navy-50/30 p-3">
              <ProfilePhotoUpload
                id="edit-member-avatar"
                currentPhotoUrl={currentAvatarUrl}
                previewUrl={avatarPreview}
                onPhotoSelected={(file, preview) => {
                  setAvatarFile(file)
                  setAvatarPreview(preview)
                  if (!file && !preview) {
                    setCurrentAvatarUrl(null)
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                id="edit-first-name"
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isSaving}
                required
              />
              <Input
                id="edit-middle-name"
                label="Middle Name (Optional)"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                disabled={isSaving}
              />
              <Input
                id="edit-last-name"
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isSaving}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="edit-gender"
                  className="block text-[11px] font-bold uppercase tracking-wide text-navy-800 mb-1"
                >
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  id="edit-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs sm:text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="MALE">Male (पुरुष)</option>
                  <option value="FEMALE">Female (महिला)</option>
                  <option value="OTHER">Other (अन्य)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-navy-800">
                    Age / DOB <span className="text-navy-400 font-normal lowercase">(optional)</span>
                  </label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded text-[10px] font-medium">
                    <button
                      type="button"
                      onClick={() => setAgeMode('dob')}
                      className={`px-1.5 py-0.5 rounded transition-all ${
                        ageMode !== 'age'
                          ? 'bg-white text-navy-900 shadow-xs font-semibold'
                          : 'text-navy-600 hover:text-navy-900'
                      }`}
                    >
                      DOB
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgeMode('age')}
                      className={`px-1.5 py-0.5 rounded transition-all ${
                        ageMode === 'age'
                          ? 'bg-white text-navy-900 shadow-xs font-semibold'
                          : 'text-navy-600 hover:text-navy-900'
                      }`}
                    >
                      Age
                    </button>
                  </div>
                </div>

                {ageMode === 'age' ? (
                  <Input
                    id="edit-current-age"
                    type="number"
                    min={0}
                    max={125}
                    value={currentAge}
                    onChange={(e) => setCurrentAge(e.target.value)}
                    placeholder="Years (0 - 125)"
                    disabled={isSaving}
                  />
                ) : (
                  <input
                    type="date"
                    id="edit-dob"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    disabled={isSaving}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs sm:text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                )}
              </div>

              <Input
                id="edit-birth-place"
                label="Birthplace (Optional)"
                placeholder="e.g. Anand, Gujarat"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                id="edit-city"
                label="City / Town (Optional)"
                placeholder="e.g. Anand"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={isSaving}
              />
              <Input
                id="edit-state"
                label="State / Province (Optional)"
                placeholder="e.g. Gujarat"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                disabled={isSaving}
              />
              <Input
                id="edit-country"
                label="Country"
                placeholder="e.g. India"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* SECTION 2: Contact Information (Optional) */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <Phone className="h-4 w-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800">
                2. Contact Information (Optional)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-navy-800 mb-1">
                  Mobile Number (Optional)
                </label>
                <div className="flex gap-2">
                  <div className="w-36 shrink-0">
                    <CountryCodeSelect
                      id="edit-country-calling-code"
                      value={countryCallingCode}
                      onChange={setCountryCallingCode}
                      disabled={isSaving}
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="tel"
                      id="edit-phone"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={isSaving}
                      className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs sm:text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              <Input
                id="edit-member-email"
                label="Email Address (Optional)"
                type="email"
                placeholder="e.g. member@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* SECTION 3: Community Information */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <MapPin className="h-4 w-4 text-amber-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800">
                3. Community Heritage & Blood Group
              </h3>
            </div>

            <GotraNukhSelect
              selectedGotra={gotra}
              selectedNukh={nukh}
              onGotraChange={setGotra}
              onNukhChange={setNukh}
              disabled={isSaving}
              required={false}
            />

            <div>
              <label
                htmlFor="edit-blood-group"
                className="block text-[11px] font-bold uppercase tracking-wide text-navy-800 mb-1"
              >
                Blood Group (Optional)
              </label>
              <select
                id="edit-blood-group"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                disabled={isSaving}
                className="w-full sm:w-1/2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs sm:text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {BLOOD_GROUP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Blood Group Directory Consent Checkbox */}
              <BloodGroupConsentCheckbox
                id="edit-blood-group-consent"
                checked={showBloodGroupInDirectory}
                onChange={setShowBloodGroupInDirectory}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* SECTION 4: Occupation Information (Official 30 Categories) */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <Briefcase className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800">
                4. Occupation / Profession (30 Official Categories)
              </h3>
            </div>

            <TwoLevelOccupationSelect
              id="edit-member-occupation"
              label="Selected Occupation / Profession"
              categoryValue={occupationCategory}
              occupationValue={occupation}
              onChange={(occ, cat) => {
                setOccupation(occ)
                setOccupationCategory(cat)
              }}
              disabled={isSaving}
              required={false}
            />
          </div>

          {/* SECTION 5: Family Role & Relationship */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <Heart className="h-4 w-4 text-purple-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800">
                5. Family Relationship & Role
              </h3>
            </div>

            {/* Reference Relative Badge */}
            {!isHead && referencePerson && (
              <div className="rounded-xl bg-navy-50/80 p-3 border border-navy-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-600">
                    Reference Family Head
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                    <Crown className="h-3 w-3 text-amber-600 fill-amber-500" />
                    Family Head
                  </span>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-navy-900">{referencePersonName}</p>
              </div>
            )}

            <RelationshipSelector
              id="edit-member-relationship"
              label="Family Role / Relationship (English + Hindi)"
              value={relationship}
              onChange={handleRelationshipChange}
              disabled={isSaving}
              required
            />

            {/* Connecting Spouse for In-laws */}
            {isInLaw && candidateSpouses.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-purple-200 bg-purple-50/50 p-3">
                <label
                  htmlFor="edit-member-connected-spouse"
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-900"
                >
                  <Heart className="h-3.5 w-3.5 text-purple-600 fill-purple-400" />
                  Connecting Spouse in Family
                </label>
                <select
                  id="edit-member-connected-spouse"
                  value={connectedPersonId}
                  onChange={(e) => setConnectedPersonId(e.target.value)}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-purple-300 bg-white px-3 py-2 text-xs sm:text-sm text-navy-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">Select spouse in family...</option>
                  {candidateSpouses.map((cand) => (
                    <option key={cand.person_id} value={cand.person_id}>
                      {toProperCaseName(`${cand.person?.first_name || ''} ${cand.person?.last_name || ''}`)} (
                      {cand.relationship_to_head || cand.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Deceased Status Checkbox */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="edit-member-is-deceased"
                  checked={isDeceased}
                  onChange={(e) => setIsDeceased(e.target.checked)}
                  disabled={isSaving}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="text-xs sm:text-sm font-semibold text-navy-900">
                    This person is deceased (दिवंगत)
                  </span>
                  <p className="text-[11px] text-navy-500 mt-0.5">
                    Check if the person is deceased. Leave unchecked for a living person.
                  </p>
                </div>
              </label>

              {isDeceased && (
                <div className="pt-2 border-t border-slate-200/80">
                  <label
                    htmlFor="edit-dod"
                    className="block text-[11px] font-bold uppercase tracking-wide text-navy-800 mb-1"
                  >
                    Date of Death (Optional)
                  </label>
                  <input
                    type="date"
                    id="edit-dod"
                    value={dateOfDeath}
                    onChange={(e) => setDateOfDeath(e.target.value)}
                    disabled={isSaving}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full sm:w-1/2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs sm:text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              )}
            </div>

            {/* Head of Family designation */}
            <div className="rounded-xl border border-navy-200 bg-navy-50/50 p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHead}
                  onChange={(e) => setIsHead(e.target.checked)}
                  disabled={isSaving}
                  className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs sm:text-sm font-semibold text-navy-900">
                  Designate as Head of Family
                </span>
              </label>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-navy-100">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSaving}
              disabled={isSaving}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold"
            >
              Save Member Details
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
