/**
 * AddMemberModal — Add member directly to family from Family Details.
 *
 * Implements KHATRI SARVANIYAT Family Management Specification:
 * - Knows the family context automatically.
 * - Relationship to Family Head:
 *     Spouse, Son, Daughter, Father, Mother, Grandfather, Grandmother,
 *     Brother, Sister, Other Relative.
 * - Gender is auto-selected based on the chosen relationship.
 * - Choice between "Create New Person" and "Select Existing Person".
 * - Standard name order: First, Middle, Last, Maiden.
 * - Live duplicate detection warning using findPersonDuplicateCandidates.
 * - Automatically creates canonical relationships row for SPOUSE, PARENT, SIBLING.
 * - Rapid succession: "+ Add Another Member" vs "Done".
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  X,
  AlertCircle,
  AlertTriangle,
  Search,
  UserPlus,
  CheckCircle2,
  Users,
  Plus,
} from 'lucide-react'

import { useQueryClient } from '@tanstack/react-query'
import { usePersonList } from '@/features/people/hooks/usePersonList'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useFamily } from '@/features/families/hooks/useFamily'
import { addFamilyMember, getFamilyHeadEmail } from '../services/family-members.service'
import { createPerson } from '@/features/people/services/people.service'
import type { CreatePersonInput } from '@/features/people/schemas/people.schemas'
import { createRelationship, canonicalizeRelationshipEndpoints } from '@/features/relationships/services/relationships.service'
import { findPersonDuplicateCandidates } from '@/features/verification/services/duplicateDetection.service'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import { CitySelector } from '@/components/forms/CitySelector'
import { RelationshipSelector } from '@/components/forms/RelationshipSelector'
import { TwoLevelOccupationSelect } from '@/components/forms/TwoLevelOccupationSelect'
import { PhoneInputWithCountryCode } from '@/components/forms/PhoneInputWithCountryCode'
import {
  mapRelationshipToFamilyRole,
  getRelationshipDefinition,
} from '@/constants/familyRelationships'
import { BLOOD_GROUP_OPTIONS } from '@/constants/bloodGroup'
import type { FamilyRole } from '@/types'
import type { Tables } from '@/types/database.types'
import { toProperCaseName } from '@/utils/text-casing'

type PersonRow = Tables<'persons'>

export type MemberRelationship = string

export interface AddMemberModalProps {
  familyId: string
  isOpen: boolean
  onClose: () => void
  hasActiveHead?: boolean
  headPersonId?: string
}

function sanitizeOptional(val: string | null | undefined): string | null {
  if (!val) return null
  const trimmed = val.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeDateInput(val: string | null | undefined): string | null {
  if (!val) return null
  const trimmed = val.trim()
  if (!trimmed) return null
  // Match DD-MM-YYYY or DD/MM/YYYY and normalize to ISO YYYY-MM-DD
  const dmyMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch
    return `${year}-${month}-${day}`
  }
  return trimmed
}

function getAutoGender(rel: string, headGender?: string | null): 'MALE' | 'FEMALE' | 'OTHER' {
  const def = getRelationshipDefinition(rel)
  if (def) {
    if (def.gender === 'MALE') return 'MALE'
    if (def.gender === 'FEMALE') return 'FEMALE'
    if (def.canonicalKey === 'spouse' || def.canonicalKey === 'partner') {
      return headGender === 'MALE' ? 'FEMALE' : 'MALE'
    }
  }
  const norm = (rel || '').trim().toLowerCase()
  if (
    norm.includes('father') ||
    norm.includes('son') ||
    norm.includes('brother') ||
    norm.includes('husband') ||
    norm.includes('uncle') ||
    norm.includes('nephew') ||
    norm.includes('widower') ||
    norm.includes('godson') ||
    norm.includes('godfather') ||
    norm === 'male first cousin' ||
    norm === 'paternal grandfather' ||
    norm === 'maternal grandfather' ||
    norm === 'grandfather' ||
    norm === 'great-grandfather' ||
    norm === 'grandson' ||
    norm === 'great-grandson'
  ) {
    return 'MALE'
  }
  if (
    norm.includes('mother') ||
    norm.includes('daughter') ||
    norm.includes('sister') ||
    norm.includes('wife') ||
    norm.includes('aunt') ||
    norm.includes('niece') ||
    norm.includes('widow') ||
    norm.includes('goddaughter') ||
    norm.includes('godmother') ||
    norm === 'female first cousin' ||
    norm === 'paternal grandmother' ||
    norm === 'maternal grandmother' ||
    norm === 'grandmother' ||
    norm === 'great-grandmother' ||
    norm === 'granddaughter' ||
    norm === 'great-granddaughter'
  ) {
    return 'FEMALE'
  }
  if (norm === 'spouse' || norm === 'partner') {
    return headGender === 'MALE' ? 'FEMALE' : 'MALE'
  }
  return 'MALE'
}

export function AddMemberModal({
  familyId,
  isOpen,
  onClose,
  hasActiveHead: _hasActiveHead = true,
  headPersonId: propHeadPersonId,
}: AddMemberModalProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()
  const { data: family } = useFamily(familyId)
  const { data: members = [], refetch: refetchMembers } = useFamilyMembers(familyId)
  const { data: persons = [], isLoading: isLoadingPersons, refetch: refetchPersons } = usePersonList({ limit: 100 })

  // Determine active head of the family
  const activeHead = useMemo(() => {
    if (propHeadPersonId) {
      return members.find((m) => m.person_id === propHeadPersonId) ?? members.find((m) => m.is_head && !m.left_at)
    }
    return members.find((m) => m.is_head && !m.left_at)
  }, [members, propHeadPersonId])

  const headId = activeHead?.person_id ?? propHeadPersonId

  // Modal mode: 'new' (Create New Person) | 'existing' (Select Existing)
  const [mode, setMode] = useState<'new' | 'existing'>('new')

  // Relationship selection
  const [relationship, setRelationship] = useState<MemberRelationship>('Son')
  const [referencePersonId, setReferencePersonId] = useState<string>('')
  const [connectedPersonId, setConnectedPersonId] = useState<string>('')

  // New Person Form Fields
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [maidenName, setMaidenName] = useState('')
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [birthPlace, setBirthPlace] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')
  const [showBloodGroupInDirectory, setShowBloodGroupInDirectory] = useState(false)
  const [gotra, setGotra] = useState('')
  const [nukh, setNukh] = useState('')
  const [occupation, setOccupation] = useState('')
  const [occupationCategory, setOccupationCategory] = useState('')
  const [email, setEmail] = useState('')
  const [headEmail, setHeadEmail] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneSecondary, setPhoneSecondary] = useState('')
  const [isDeceased, setIsDeceased] = useState(false)

  // Existing Person Selection
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [personSearch, setPersonSearch] = useState('')

  // Submission & UI States
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  // Fetch Family Head email whenever modal is opened
  useEffect(() => {
    if (isOpen && familyId) {
      getFamilyHeadEmail(familyId).then((em) => {
        if (em) {
          setHeadEmail(em)
          setEmail((prev) => (prev ? prev : em))
        }
      })
    }
  }, [isOpen, familyId])

  useEffect(() => {
    if (activeHead?.person && isOpen) {
      const contactEmail = activeHead.person.email_contact
      if (contactEmail) {
        setHeadEmail(contactEmail)
        setEmail((prev) => (prev ? prev : contactEmail))
      }
      const headPhone = activeHead.person?.phone
      if (headPhone) {
        setPhone((prev) => (prev ? prev : headPhone))
      }
      const headSecPhone = activeHead.person?.phone_secondary
      if (headSecPhone) {
        setPhoneSecondary((prev) => (prev ? prev : headSecPhone))
      }
    }
  }, [activeHead?.person, isOpen])

  // Reset form
  const resetForm = useCallback(() => {
    setFirstName('')
    setMiddleName('')
    // Default last name to head's last name or family surname if known
    setLastName(activeHead?.person?.last_name || family?.family_name || '')
    setMaidenName('')
    setGender(getAutoGender(relationship, activeHead?.person?.gender))
    setDateOfBirth('')
    const defaultLocation = [family?.city, family?.state].filter(Boolean).join(', ') || activeHead?.person?.birth_place || ''
    setBirthPlace(defaultLocation)
    setBloodGroup('')
    setShowBloodGroupInDirectory(false)
    setGotra(activeHead?.person?.gotra || family?.gotra || '')
    setNukh(activeHead?.person?.nukh || family?.nukh || '')
    setOccupation('')
    setOccupationCategory('')
    const defaultHeadEmail = activeHead?.person?.email_contact || headEmail || ''
    setEmail(defaultHeadEmail)
    setPhone(activeHead?.person?.phone || '')
    setPhoneSecondary(activeHead?.person?.phone_secondary || '')
    setIsDeceased(false)
    setSelectedPersonId('')
    setPersonSearch('')
    setReferencePersonId(activeHead?.person_id ?? propHeadPersonId ?? '')
    setConnectedPersonId('')
    setErrorMessage(null)
    setDuplicateWarning(null)
  }, [relationship, activeHead, family, propHeadPersonId, headEmail])

  // Auto-update gender when relationship changes and auto-detect connecting spouse
  const handleRelationshipChange = (newRel: MemberRelationship) => {
    setRelationship(newRel)
    setGender(getAutoGender(newRel, activeHead?.person?.gender))

    // Intelligent candidate connecting relative detection
    const isSisterInLawRel = /sister-in-law|भाभी|जेठानी|देवरानी/i.test(newRel)
    const isNephewsWifeRel = /nephew's wife|भतीजे की पत्नी|भांजे की पत्नी/i.test(newRel)
    const isNiecesHusbandRel = /niece's husband|भतीजी का पति|भांजी का पति/i.test(newRel)
    const isDaughterInLawRel = /daughter-in-law|बहू|पुत्रवधू/i.test(newRel)

    if (isNephewsWifeRel) {
      const nephew = members.find((m) => !m.left_at && /nephew|भतीजा|भांजा/i.test(m.relationship_to_head || ''))
      if (nephew) setConnectedPersonId(nephew.person_id)
    } else if (isSisterInLawRel) {
      const brother = members.find((m) => !m.left_at && (m.role === 'SIBLING' || /brother|भाई/i.test(m.relationship_to_head || '')))
      if (brother) setConnectedPersonId(brother.person_id)
    } else if (isNiecesHusbandRel) {
      const niece = members.find((m) => !m.left_at && /niece|भतीजी|भांजी/i.test(m.relationship_to_head || ''))
      if (niece) setConnectedPersonId(niece.person_id)
    } else if (isDaughterInLawRel) {
      const son = members.find((m) => !m.left_at && (m.role === 'CHILD' || /son|बेटा/i.test(m.relationship_to_head || '')))
      if (son) setConnectedPersonId(son.person_id)
    } else {
      setConnectedPersonId('')
    }
  }

  // Reset on open & handle Escape key
  useEffect(() => {
    if (isOpen) {
      resetForm()
      setSuccessBanner(null)
    }
  }, [isOpen, resetForm])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Live duplicate candidate check as user types
  useEffect(() => {
    if (mode !== 'new' || !firstName.trim() || !lastName.trim()) {
      setDuplicateWarning(null)
      return
    }

    const timer = setTimeout(() => {
      const draftTarget: Partial<PersonRow> = {
        id: 'draft-check',
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dateOfBirth || null,
        birth_place: birthPlace || null,
        gotra: gotra || null,
        nukh: nukh || null,
      }

      const candidates = findPersonDuplicateCandidates(draftTarget, persons)
      const strongMatch = candidates.find((c) => c.confidence === 'STRONG' || c.confidence === 'POSSIBLE')
      if (strongMatch) {
        const cand = strongMatch.candidate
        const dobStr = cand.date_of_birth ? ` (DOB: ${cand.date_of_birth.split('T')[0]})` : ''
        const placeStr = cand.birth_place ? ` in ${cand.birth_place}` : ''
        setDuplicateWarning(
          `Possible matching census person: "${cand.first_name} ${cand.last_name}"${dobStr}${placeStr}. You can switch to "Select Existing Person" or continue creating.`
        )
      } else {
        setDuplicateWarning(null)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [mode, firstName, lastName, dateOfBirth, birthPlace, gotra, nukh, persons])

  // Active member IDs in current family to exclude from selection (Section 3.9)
  const currentMemberPersonIds = useMemo(() => {
    return new Set(members.filter((m) => !m.left_at).map((m) => m.person_id))
  }, [members])

  // Filter persons for existing selection (excluding current active members)
  const filteredPersons = useMemo(() => {
    const candidatePool = persons.filter((p) => !currentMemberPersonIds.has(p.id))
    if (!personSearch.trim()) return candidatePool
    const q = personSearch.toLowerCase().trim()
    return candidatePool.filter((p) => {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
      const gotraMatch = p.gotra?.toLowerCase().includes(q) ?? false
      const placeMatch = p.birth_place?.toLowerCase().includes(q) ?? false
      return fullName.includes(q) || gotraMatch || placeMatch
    })
  }, [persons, currentMemberPersonIds, personSearch])

  // Save logic
  async function handleSave(andAddAnother = false) {
    setErrorMessage(null)
    setSuccessBanner(null)

    if (!user?.id) {
      setErrorMessage('You must be authenticated to add family members.')
      return
    }

    // Validation
    if (mode === 'new') {
      if (!firstName.trim()) {
        setErrorMessage('First name is required.')
        return
      }
      if (!lastName.trim()) {
        setErrorMessage('Last name / Surname is required.')
        return
      }
      if (!gender) {
        setErrorMessage('Gender is required.')
        return
      }
      if (!dateOfBirth) {
        setErrorMessage('Date of Birth is required.')
        return
      }
      const dobNormalized = normalizeDateInput(dateOfBirth)
      if (!dobNormalized) {
        setErrorMessage('Date of Birth is required.')
        return
      }
      const dobDate = new Date(dobNormalized)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (dobDate > today) {
        setErrorMessage('Date of birth cannot be in the future.')
        return
      }

      if (!bloodGroup || bloodGroup === 'UNKNOWN') {
        setErrorMessage('Please select Blood Group.')
        return
      }

      const finalBirthPlace =
        sanitizeOptional(birthPlace) ||
        ([family?.city, family?.state].filter(Boolean).join(', ') || null)

      if (!finalBirthPlace) {
        setErrorMessage('Birthplace is required.')
        return
      }

      const finalGotra =
        sanitizeOptional(gotra) ||
        sanitizeOptional(activeHead?.person?.gotra) ||
        sanitizeOptional(family?.gotra)
      if (!finalGotra) {
        setErrorMessage('Gotra is required.')
        return
      }

      const finalNukh =
        sanitizeOptional(nukh) ||
        sanitizeOptional(activeHead?.person?.nukh) ||
        sanitizeOptional(family?.nukh)
      if (!finalNukh) {
        setErrorMessage('Nukh is required.')
        return
      }

      if (phone.trim() && !/^[0-9+\s\-()]{7,25}$/.test(phone.trim())) {
        setErrorMessage('Please enter a valid primary phone number (digits, +, -).')
        return
      }

      if (phoneSecondary.trim() && !/^[0-9+\s\-()]{7,25}$/.test(phoneSecondary.trim())) {
        setErrorMessage('Please enter a valid secondary phone number (digits, +, -).')
        return
      }

      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setErrorMessage('Please enter a valid email address.')
        return
      }
    } else {
      if (!selectedPersonId) {
        setErrorMessage('Please select an existing person to add.')
        return
      }
      const existingPerson = persons.find((p) => p.id === selectedPersonId)
      const expectedGender = getAutoGender(relationship, activeHead?.person?.gender)
      if (
        existingPerson &&
        existingPerson.gender !== expectedGender &&
        relationship !== 'Spouse' &&
        relationship !== 'Other Relative'
      ) {
        setErrorMessage(
          `Gender conflict: The selected person "${existingPerson.first_name} ${existingPerson.last_name}" has recorded gender (${existingPerson.gender}), which contradicts the selected relationship (${relationship}). Please verify the relationship.`
        )
        return
      }
    }

    setIsSubmitting(true)

    try {
      let memberPersonId: string
      let memberName = ''

      // 1. Create person if new
      if (mode === 'new') {
        const finalGotra =
          sanitizeOptional(gotra) ||
          sanitizeOptional(activeHead?.person?.gotra) ||
          sanitizeOptional(family?.gotra)
        const finalNukh =
          sanitizeOptional(nukh) ||
          sanitizeOptional(activeHead?.person?.nukh) ||
          sanitizeOptional(family?.nukh)
        const finalBirthPlace =
          sanitizeOptional(birthPlace) ||
          ([family?.city, family?.state].filter(Boolean).join(', ') || null)

        const createRes = await createPerson(
          {
            first_name: toProperCaseName(firstName.trim()),
            middle_name: middleName.trim() ? toProperCaseName(middleName.trim()) : null,
            last_name: toProperCaseName(lastName.trim()),
            maiden_name: maidenName.trim() ? toProperCaseName(maidenName.trim()) : null,
            gender,
            date_of_birth: normalizeDateInput(dateOfBirth)!,
            birth_place: finalBirthPlace ? toProperCaseName(finalBirthPlace) : finalBirthPlace!,
            blood_group: bloodGroup as CreatePersonInput['blood_group'],
            show_blood_group_in_directory: showBloodGroupInDirectory,
            blood_group_consent: showBloodGroupInDirectory,
            is_deceased: isDeceased,
            gotra: finalGotra ? toProperCaseName(finalGotra) : finalGotra!,
            nukh: finalNukh ? toProperCaseName(finalNukh) : finalNukh!,
            occupation: sanitizeOptional(occupation),
            occupation_category: sanitizeOptional(occupationCategory),
            email_contact: sanitizeOptional(email),
            phone: sanitizeOptional(phone),
            phone_secondary: sanitizeOptional(phoneSecondary),
            profile_privacy: 'PRIVATE',
            contact_privacy: 'PRIVATE',
            dob_privacy: 'PRIVATE',
          },
          user.id
        )

        if (createRes.error || !createRes.data) {
          throw new Error(createRes.error?.message || 'Failed to create person.')
        }

        memberPersonId = createRes.data.id
        memberName = `${createRes.data.first_name} ${createRes.data.last_name}`
      } else {
        memberPersonId = selectedPersonId
        const found = persons.find((p) => p.id === selectedPersonId)
        memberName = found ? toProperCaseName(`${found.first_name} ${found.last_name}`) : 'Member'
      }

      // 2. Map relationship to family_members role
      const role: FamilyRole = mapRelationshipToFamilyRole(relationship)

      // 3. Add to family_members
      const addRes = await addFamilyMember(
        {
          family_id: familyId,
          person_id: memberPersonId,
          role,
          relationship_to_head: relationship,
          is_head: false,
          reference_person_id: referencePersonId || headId || null,
          connected_person_id: connectedPersonId || null,
        },
        user.id
      )

      if (addRes.error) {
        throw new Error(addRes.error.message || 'Failed to add member to family.')
      }

      // 4. Create canonical relationships row if connecting spouse/relative chosen
      if (connectedPersonId && connectedPersonId !== memberPersonId) {
        try {
          const endpoints = canonicalizeRelationshipEndpoints(connectedPersonId, memberPersonId, 'SPOUSE')
          await createRelationship(
            { ...endpoints, relationship_type: 'SPOUSE' },
            user.id
          )
        } catch {
          // Non-blocking
        }
      }

      // 5. Create canonical relationships row if Head is known
      if (headId && headId !== memberPersonId) {
        try {
          if (role === 'SPOUSE') {
            const endpoints = canonicalizeRelationshipEndpoints(headId, memberPersonId, 'SPOUSE')
            const relRes = await createRelationship(
              { ...endpoints, relationship_type: 'SPOUSE' },
              user.id
            )
            if (relRes.error && relRes.error.code !== 'DUPLICATE_RELATIONSHIP') {
              // Surface non-duplicate relationship issues
              setErrorMessage(`Member was added to family, but relationship linking reported: ${relRes.error.message}`)
            }
          } else if (role === 'CHILD') {
            // Head is PARENT of Child
            const relRes = await createRelationship(
              { person_a_id: headId, person_b_id: memberPersonId, relationship_type: 'PARENT' },
              user.id
            )
            if (relRes.error && relRes.error.code !== 'DUPLICATE_RELATIONSHIP') {
              setErrorMessage(`Member was added to family, but relationship linking reported: ${relRes.error.message}`)
            }
          } else if (role === 'PARENT') {
            // Member is PARENT of Head
            const relRes = await createRelationship(
              { person_a_id: memberPersonId, person_b_id: headId, relationship_type: 'PARENT' },
              user.id
            )
            if (relRes.error && relRes.error.code !== 'DUPLICATE_RELATIONSHIP') {
              setErrorMessage(`Member was added to family, but relationship linking reported: ${relRes.error.message}`)
            }
          } else if (role === 'SIBLING') {
            // SIBLING between Head and Member (canonical UUID order enforced)
            const endpoints = canonicalizeRelationshipEndpoints(headId, memberPersonId, 'SIBLING')
            const relRes = await createRelationship(
              { ...endpoints, relationship_type: 'SIBLING' },
              user.id
            )
            if (relRes.error && relRes.error.code !== 'DUPLICATE_RELATIONSHIP') {
              setErrorMessage(`Member was added to family, but relationship linking reported: ${relRes.error.message}`)
            }
          }
          // Note: Grandparent role is stored in family_members.role = 'GRANDPARENT'
          // avoiding non-canonical direct grandparent relationship rows.
        } catch {
          // Non-blocking: family membership already secured
        }
      }

      // Refresh cache across members, persons, relationships, and families (Section 3.12)
      await refetchMembers()
      await refetchPersons()
      void queryClient.invalidateQueries({ queryKey: ['relationships'] })
      void queryClient.invalidateQueries({ queryKey: ['family-members'] })
      void queryClient.invalidateQueries({ queryKey: ['families'] })

      if (andAddAnother) {
        setSuccessBanner(`✓ "${memberName}" was successfully added as ${relationship}! Ready to add another member.`)
        resetForm()
      } else {
        onClose()
      }
    } catch (err) {
      setErrorMessage((err as { message?: string }).message || 'Failed to add member. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h2 id="add-member-dialog-title" className="text-base font-bold text-navy-900">
                Add Family Member
              </h2>
              <p className="text-xs text-slate-500">
                {activeHead ? `Adding relative to Head: ${activeHead.person?.first_name} ${activeHead.person?.last_name}` : 'Add a member to this household'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-navy-900 focus:outline-none"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success Banner (when rapidly adding another member) */}
        {successBanner && (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Relationship Dropdown */}
        <div className="space-y-3">
          <RelationshipSelector
            id="member-relationship"
            label="Relationship to Family Head"
            value={relationship}
            onChange={(newRel) => handleRelationshipChange(newRel)}
            required
          />

          {/* Connecting Relative in Family (for in-laws, nephew's spouse, etc.) */}
          {/sister-in-law|brother-in-law|nephew's wife|niece's husband|daughter-in-law|son-in-law|भाभी|साली|जेठानी|देवरानी|जीजा|बहनोई|साला|भतीजे की पत्नी|भांजे की पत्नी|भतीजी का पति|बहू|दामाद/i.test(
            relationship
          ) && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-3 space-y-1.5 animate-in fade-in duration-150">
              <label
                htmlFor="connecting-relative"
                className="block text-xs font-semibold text-purple-900"
              >
                Connecting Relative / Spouse in Family
              </label>
              <select
                id="connecting-relative"
                value={connectedPersonId}
                onChange={(e) => setConnectedPersonId(e.target.value)}
                className="w-full rounded-md border border-purple-200 bg-white px-3 py-1.5 text-xs text-navy-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">Select connecting spouse in family...</option>
                {members
                  .filter((m) => !m.left_at && m.person?.status !== 'DECEASED')
                  .map((m) => (
                    <option key={m.person_id} value={m.person_id}>
                      {toProperCaseName(`${m.person?.first_name} ${m.person?.last_name}`)} (
                      {m.relationship_to_head || m.role})
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-purple-700">
                Links this member as a spouse to an existing family relative (e.g. Harsh for Nephew&apos;s Wife).
              </p>
            </div>
          )}
        </div>

        {/* 2. Mode Toggle: Create New vs Select Existing */}
        <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-50">
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-semibold transition-all ${
              mode === 'new'
                ? 'bg-white text-navy-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create New Person
          </button>
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-semibold transition-all ${
              mode === 'existing'
                ? 'bg-white text-navy-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Select Existing Person
          </button>
        </div>

        {/* 3. Form Content */}
        {mode === 'new' ? (
          <div className="space-y-3.5 max-h-[50vh] overflow-y-auto pr-1">
            {/* Live Duplicate Warning */}
            {duplicateWarning && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{duplicateWarning}</span>
              </div>
            )}

            {/* Standard Name Order: First, Middle, Last, Maiden */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="1. First Name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <Input
                label="2. Middle Name"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
              <Input
                label="3. Last Name / Surname"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <Input
                label="4. Maiden Name (if applicable)"
                placeholder="Birth surname"
                value={maidenName}
                onChange={(e) => setMaidenName(e.target.value)}
              />
            </div>

            {/* Identity: Gender, DOB, Blood Group, Birthplace, Date of Death */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="member-gender" className="block text-sm font-medium text-navy-700">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  id="member-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                  className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <Input
                label="Date of Birth"
                required
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />

              <div className="space-y-1">
                <label htmlFor="member-blood-group" className="block text-sm font-medium text-navy-700">
                  Blood Group <span className="text-red-500">*</span>
                </label>
                <select
                  id="member-blood-group"
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {BLOOD_GROUP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Blood Group Directory Consent Checkbox */}
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-2.5">
                  <input
                    type="checkbox"
                    id="member-blood-group-consent"
                    checked={showBloodGroupInDirectory}
                    onChange={(e) => setShowBloodGroupInDirectory(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div className="space-y-0.5">
                    <label
                      htmlFor="member-blood-group-consent"
                      className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer block"
                    >
                      Show my blood group details in the Blood Group Directory.
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      If enabled, your name, selected blood group, family name, and permitted location details may appear in the community Blood Group Directory. Your personal phone number and email address will remain private.
                    </p>
                  </div>
                </div>
              </div>

              <CitySelector
                label="Birthplace"
                required
                placeholder="Search birthplace worldwide..."
                value={birthPlace}
                onSelectCity={(selected) => {
                  const formatted = selected.city
                    ? selected.state
                      ? `${selected.city}, ${selected.state}${selected.country ? `, ${selected.country}` : ''}`
                      : selected.city
                    : ''
                  setBirthPlace(formatted)
                }}
              />

              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4 transition-colors hover:bg-slate-50">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="member-is-deceased"
                    checked={isDeceased}
                    onChange={(e) => setIsDeceased(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-navy-900">This person is deceased</span>
                    <p className="text-xs text-navy-500 mt-0.5">
                      Check if the person is deceased. Leave unchecked for a living person.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Cultural Lineage: Gotra & Nukh */}
            <div className="pt-1">
              <GotraNukhSelect
                selectedGotra={gotra}
                selectedNukh={nukh}
                onGotraChange={(val) => {
                  setGotra(val)
                  setNukh('')
                }}
                onNukhChange={(val) => setNukh(val)}
                required
              />
            </div>

            {/* Occupation: Two-Level Categories & Specific Occupations */}
            <div className="pt-1">
              <TwoLevelOccupationSelect
                categoryValue={occupationCategory}
                occupationValue={occupation}
                onChange={(occ, cat) => {
                  setOccupation(occ)
                  setOccupationCategory(cat)
                }}
                required={false}
              />
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1 border-t border-navy-100">
              <PhoneInputWithCountryCode
                id="member-primary-phone"
                label="Primary Phone Number"
                value={phone}
                onChange={setPhone}
                placeholder="Enter mobile number"
              />

              <PhoneInputWithCountryCode
                id="member-secondary-phone"
                label="Secondary Phone"
                value={phoneSecondary}
                onChange={setPhoneSecondary}
                placeholder="Enter secondary mobile number"
              />

              <div className="sm:col-span-2">
                <Input
                  label="Email Address (Optional)"
                  type="email"
                  placeholder="e.g. member@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  hint={
                    (activeHead?.person?.email_contact || headEmail)
                      ? 'Default email copied from the Family Head. You can change it if this member has a different email address.'
                      : 'Family members may share email address'
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          /* Select Existing Person */
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, birthplace, or gotra..."
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                className="w-full rounded border border-navy-300 pl-9 pr-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 rounded border border-navy-100 p-1">
              {isLoadingPersons ? (
                <p className="p-3 text-center text-xs text-slate-400">Loading census records...</p>
              ) : filteredPersons.length === 0 ? (
                <p className="p-3 text-center text-xs text-slate-400">No matching persons found.</p>
              ) : (
                filteredPersons.map((p) => {
                  const isSelected = selectedPersonId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPersonId(p.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-brand-50 border border-brand-300 text-brand-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-navy-900">
                          {p.first_name} {p.middle_name ? `${p.middle_name} ` : ''}{p.last_name}
                          {p.gender && <span className="ml-1 text-[11px] font-normal text-slate-500">({p.gender})</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {p.gotra && `Gotra: ${p.gotra}`} {p.nukh && `· Nukh: ${p.nukh}`} {p.birth_place && `· Place: ${p.birth_place}`}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-4 border-t border-navy-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Done
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSave(true)}
              isLoading={isSubmitting}
              className="text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Save &amp; Add Another
            </Button>

            <Button
              type="button"
              onClick={() => handleSave(false)}
              isLoading={isSubmitting}
            >
              Save Member
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
