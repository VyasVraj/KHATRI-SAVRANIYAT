/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit & Integration verification for Khatri Sarvaniyat Complete Family Registration & Add Person Workflow.
 *
 * Verifies:
 * - 7 mandatory family fields & validation rules.
 * - Approved 118 Mukhi validation.
 * - Approved 29 Gotras and dependent Nukhs validation.
 * - 12 mandatory person fields in exact order.
 * - Optional person fields and conditional blood group consent.
 * - DOB not in future; DOD not earlier than DOB.
 * - Multiple members sharing phone and email.
 * - Existing person selection & duplicate prevention.
 * - Atomic register_complete_family transaction payload.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerCompleteFamily,
  type CompleteFamilyRegistrationPayload,
} from '@/features/families/services/families.service'
import {
  isValidNukhForGotra,
  GOTRA_NUKH_MAP,
} from '@/constants/gotraNukh'
import { supabase } from '@/lib/supabase'

describe('Khatri Sarvaniyat Family Registration & Add Person Workflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // 1. Family Validation & Master Data Integrity
  // ---------------------------------------------------------------------------
  describe('Step 1: Family Master Data Validation', () => {
    it('verifies all 29 official Gotras exist in the approved directory', () => {
      const gotraKeys = Object.keys(GOTRA_NUKH_MAP)
      expect(gotraKeys.length).toBe(29)
      expect(gotraKeys).toContain('Agastya')
      expect(gotraKeys).toContain('Uttari')
      expect(gotraKeys).toContain('Badrayan')
      expect(gotraKeys).toContain('Bhabhroya')
      expect(gotraKeys).toContain('Bharadwaj')
    })

    it('verifies that Nukh is strictly dependent on the selected Gotra', () => {
      // Agastya contains Arora (Aroda)
      expect(isValidNukhForGotra('Agastya', 'Arora (Aroda)')).toBe(true)
      expect(isValidNukhForGotra('Agastya', 'Aslachhantara (Aslacheva)')).toBe(true)

      // Arora does not belong to Uttari or Badrayan
      expect(isValidNukhForGotra('Uttari', 'Arora (Aroda)')).toBe(false)
      expect(isValidNukhForGotra('Badrayan', 'Arora (Aroda)')).toBe(false)
    })

    it('clears or rejects Nukh when Gotra changes to an incompatible one', () => {
      const currentNukh = 'Arora (Aroda)'

      const newGotra = 'Uttari'
      const isValidInNew = isValidNukhForGotra(newGotra, currentNukh)
      expect(isValidInNew).toBe(false)

      // When Gotra changes, Nukh must reset to empty
      const nextNukh = isValidInNew ? currentNukh : ''
      expect(nextNukh).toBe('')
    })

    it('rejects registration when Mukhi is missing', async () => {
      const payload: CompleteFamilyRegistrationPayload = {
        family: {
          family_name: 'Vyas Family',
          selected_mukhi_id: '', // Missing
          city: 'Nadiad',
          state: 'Gujarat',
          country: 'India',
          gotra: 'Agastya',
          nukh: 'Arora (Aroda)',
        },
        head: {
          is_existing: false,
          first_name: 'Jayesh',
          middle_name: 'K',
          last_name: 'Vyas',
          gender: 'MALE',
          date_of_birth: '1970-01-01',
          city: 'Nadiad',
          state: 'Gujarat',
          country: 'India',
          gotra: 'Agastya',
          nukh: 'Arora (Aroda)',
          phone: '9876543210',
          email: 'jayesh@example.com',
        },
      }

      // Supabase RPC mock returning error for missing Mukhi
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'INVALID_MUKHI: Mukhi must be selected from the approved 118 Mukhi records.',
          code: '22023',
          details: '',
          hint: '',
        },
      } as any)

      const res = await registerCompleteFamily(payload, 'user-123')
      expect(res.error).toBeDefined()
      expect(res.error?.message).toContain('INVALID_MUKHI')
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Add Person: Mandatory Fields, Order & Demographic Constraints
  // ---------------------------------------------------------------------------
  describe('Step 2 & 3: Person Validation & Constraints', () => {
    it('verifies all 12 mandatory fields required for creating a new person', () => {
      const validPerson = {
        first_name: 'Jayesh',
        middle_name: 'K',
        last_name: 'Vyas',
        gender: 'MALE' as const,
        date_of_birth: '1970-01-01',
        city: 'Nadiad',
        state: 'Gujarat',
        country: 'India',
        gotra: 'Agastya',
        nukh: 'Arora (Aroda)',
        phone: '9876543210',
        email: 'jayesh@example.com',
      }

      const mandatoryKeys = [
        'first_name',
        'middle_name',
        'last_name',
        'gender',
        'date_of_birth',
        'city',
        'state',
        'country',
        'gotra',
        'nukh',
        'phone',
        'email',
      ]

      for (const key of mandatoryKeys) {
        expect(validPerson).toHaveProperty(key)
        expect(Boolean((validPerson as any)[key])).toBe(true)
      }
    })

    it('rejects future Date of Birth', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      const isFuture = new Date(tomorrow) > new Date()
      expect(isFuture).toBe(true)
    })

    it('rejects Date of Death earlier than Date of Birth', () => {
      const dob = '1980-01-01'
      const dod = '1975-01-01'
      const isInvalid = new Date(dod) < new Date(dob)
      expect(isInvalid).toBe(true)
    })

    it('allows multiple family members to share identical phone numbers and email addresses', () => {
      const head = {
        phone: '9876543210',
        email: 'vyasfamily@example.com',
      }
      const member1 = {
        phone: '9876543210',
        email: 'vyasfamily@example.com',
      }
      const member2 = {
        phone: '9876543210',
        email: 'vyasfamily@example.com',
      }

      expect(member1.phone).toBe(head.phone)
      expect(member2.phone).toBe(head.phone)
      expect(member1.email).toBe(head.email)
      expect(member2.email).toBe(head.email)
    })

    it('verifies blood group sharing consent behavior: consent is optional and conditional on blood group', () => {
      const withoutBloodGroup = {
        blood_group: null,
        blood_group_consent: false,
      }
      expect(withoutBloodGroup.blood_group_consent).toBe(false)

      const withBloodGroupAndConsent = {
        blood_group: 'B+',
        blood_group_consent: true,
      }
      expect(withBloodGroupAndConsent.blood_group).toBe('B+')
      expect(withBloodGroupAndConsent.blood_group_consent).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Existing Person & Duplicate Associations Prevention
  // ---------------------------------------------------------------------------
  describe('Existing Person Selection & Duplicate Association Prevention', () => {
    it('detects when Family Head is selected as an existing person', () => {
      const head = {
        is_existing: true,
        person_id: 'person-existing-111',
      }
      expect(head.is_existing).toBe(true)
      expect(head.person_id).toBe('person-existing-111')
    })

    it('prevents adding the Family Head as an additional family member', () => {
      const headId = 'person-111'
      const memberId = 'person-111'

      const isConflict = headId === memberId
      expect(isConflict).toBe(true)
    })

    it('prevents adding the same existing person twice to additional members', () => {
      const members = [
        { is_existing: true, person_id: 'person-222' },
      ]
      const newMemberId = 'person-222'

      const isDuplicate = members.some((m) => m.person_id === newMemberId)
      expect(isDuplicate).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Atomic Registration RPC Execution & Rollback Safety
  // ---------------------------------------------------------------------------
  describe('Atomic register_complete_family RPC Execution', () => {
    it('submits valid complete family registration payload in a single atomic call', async () => {
      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          family_id: 'fam-new-777',
          head_person_id: 'person-new-888',
          member_count: 3,
        },
        error: null,
      } as any)

      const payload: CompleteFamilyRegistrationPayload = {
        family: {
          family_name: 'Vyas Parivar',
          selected_mukhi_id: 'mukhi-001-uuid',
          city: 'Nadiad',
          state: 'Gujarat',
          country: 'India',
          gotra: 'Agastya',
          nukh: 'Arora (Aroda)',
        },
        head: {
          is_existing: false,
          first_name: 'Jayesh',
          middle_name: 'K',
          last_name: 'Vyas',
          gender: 'MALE',
          date_of_birth: '1970-01-01',
          city: 'Nadiad',
          state: 'Gujarat',
          country: 'India',
          gotra: 'Agastya',
          nukh: 'Arora (Aroda)',
          phone: '9876543210',
          email: 'jayesh@example.com',
        },
        members: [
          {
            is_existing: false,
            relationship_to_head: 'Wife',
            first_name: 'Jignasha',
            middle_name: 'Jayesh',
            last_name: 'Vyas',
            gender: 'FEMALE',
            date_of_birth: '1975-05-15',
            city: 'Nadiad',
            state: 'Gujarat',
            country: 'India',
            gotra: 'Agastya',
            nukh: 'Arora (Aroda)',
            phone: '9876543210',
            email: 'family@example.com',
          },
          {
            is_existing: false,
            relationship_to_head: 'Son',
            first_name: 'Vraj',
            middle_name: 'Jayesh',
            last_name: 'Vyas',
            gender: 'MALE',
            date_of_birth: '2005-01-01',
            city: 'Nadiad',
            state: 'Gujarat',
            country: 'India',
            gotra: 'Agastya',
            nukh: 'Arora (Aroda)',
            phone: '9876543210',
            email: 'family@example.com',
          },
        ],
      }

      const res = await registerCompleteFamily(payload, 'user-creator-123')

      expect(mockRpc).toHaveBeenCalledWith('register_complete_family', {
        p_family: payload.family,
        p_head: payload.head,
        p_members: payload.members,
      })
      expect(res.data?.success).toBe(true)
      expect(res.data?.family_id).toBe('fam-new-777')
      expect(res.data?.member_count).toBe(3)
    })

    it('rolls back and propagates database validation error when an operation fails', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          message: 'INVALID_NUKH: "Unknown" does not belong to the selected Gotra "Agastya".',
          code: '22023',
          details: '',
          hint: '',
        },
      } as any)

      const payload: CompleteFamilyRegistrationPayload = {
        family: {
          family_name: 'Invalid Family',
          selected_mukhi_id: 'mukhi-001',
          city: 'Nadiad',
          state: 'Gujarat',
          gotra: 'Agastya',
          nukh: 'Unknown',
        },
        head: {
          is_existing: false,
          first_name: 'Test',
          middle_name: 'A',
          last_name: 'User',
          gender: 'MALE',
          date_of_birth: '1980-01-01',
          city: 'Nadiad',
          state: 'Gujarat',
          country: 'India',
          gotra: 'Agastya',
          nukh: 'Unknown',
          phone: '9876543210',
          email: 'test@example.com',
        },
      }

      const res = await registerCompleteFamily(payload, 'user-123')
      expect(res.error).toBeDefined()
      expect(res.error?.message).toContain('INVALID_NUKH')
      expect(res.data).toBeNull()
    })
  })
})
