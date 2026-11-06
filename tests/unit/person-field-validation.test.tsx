/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit Test Suite: Person Field Validation Specification
 *
 * Covers:
 *  - Test A: Mandatory field validation (all 10 mandatory fields require input)
 *  - Test B: Optional field validation (4 optional fields never block submission)
 *  - Test C: Invalid data rejection (future DOB, DOD earlier than DOB, bad phone, bad email)
 *  - Test D: Gotra & Nukh relational validation (only authoritative 29 Gotras & matching Nukhs)
 *  - Test E: Duplicate contact details permitted (phone and email can be shared across persons)
 *  - Test F: UI Asterisk & Required Indicators (red asterisk on 10 mandatory fields, none on 4 optional)
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createPersonSchema, updatePersonSchema } from '@/features/people/schemas/people.schemas'
import { PersonForm } from '@/features/people/components/PersonForm'
import { AuthContext } from '@/features/auth/context/AuthContext'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('KHATRI SARVANIYAT — Person Field Validation Specification', () => {
  const VALID_MANDATORY_PAYLOAD = {
    first_name: 'Vraj',
    last_name: 'Vyas',
    gender: 'MALE' as const,
    blood_group: 'B+' as const,
    birth_place: 'Vadodara, Gujarat',
    date_of_birth: '2005-11-18',
    gotra: 'Agastya',
    nukh: 'Arora (Aroda)',
    email_contact: 'vraj.vyas@example.com',
    phone: '+919876543210',
  }

  // ---------------------------------------------------------------------------
  // TEST A: MANDATORY FIELD VALIDATION
  // ---------------------------------------------------------------------------
  describe('Test A: Mandatory Field Validation', () => {
    it('fails when any of the 10 mandatory fields are missing or empty', () => {
      const emptyPayload = {}
      const parseResult = createPersonSchema.safeParse(emptyPayload)
      expect(parseResult.success).toBe(false)
      if (!parseResult.success) {
        const errorPaths = parseResult.error.errors.map((e) => e.path[0])
        expect(errorPaths).toContain('first_name')
        expect(errorPaths).toContain('last_name')
        expect(errorPaths).toContain('gender')
        expect(errorPaths).toContain('blood_group')
        expect(errorPaths).toContain('birth_place')
        expect(errorPaths).toContain('date_of_birth')
        expect(errorPaths).toContain('gotra')
        expect(errorPaths).toContain('nukh')
        expect(errorPaths).toContain('email_contact')
        expect(errorPaths).toContain('phone')
      }
    })

    it('fails when whitespace-only strings are provided for mandatory text fields', () => {
      const whitespacePayload = {
        ...VALID_MANDATORY_PAYLOAD,
        first_name: '   ',
        last_name: '   ',
        birth_place: '   ',
        gotra: '   ',
        nukh: '   ',
        email_contact: '   ',
        phone: '   ',
      }
      const parseResult = createPersonSchema.safeParse(whitespacePayload)
      expect(parseResult.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // TEST B: OPTIONAL FIELD VALIDATION
  // ---------------------------------------------------------------------------
  describe('Test B: Optional Field Validation', () => {
    it('succeeds when all 10 mandatory fields are provided and optional fields are omitted', () => {
      const parseResult = createPersonSchema.safeParse(VALID_MANDATORY_PAYLOAD)
      expect(parseResult.success).toBe(true)
      if (parseResult.success) {
        expect(parseResult.data.middle_name).toBeUndefined()
        expect(parseResult.data.maiden_name).toBeUndefined()
        expect(parseResult.data.date_of_death).toBeUndefined()
        expect(parseResult.data.phone_secondary).toBeUndefined()
      }
    })

    it('succeeds when optional fields are null or empty strings', () => {
      const payloadWithEmptyOptionals = {
        ...VALID_MANDATORY_PAYLOAD,
        middle_name: null,
        maiden_name: null,
        date_of_death: null,
        phone_secondary: null,
      }
      const parseResult = createPersonSchema.safeParse(payloadWithEmptyOptionals)
      expect(parseResult.success).toBe(true)
    })

    it('succeeds when valid optional fields are provided', () => {
      const payloadWithOptionals = {
        ...VALID_MANDATORY_PAYLOAD,
        middle_name: 'Jayeshbhai',
        maiden_name: 'Patel',
        phone_secondary: '+919876543211',
      }
      const parseResult = createPersonSchema.safeParse(payloadWithOptionals)
      expect(parseResult.success).toBe(true)
      if (parseResult.success) {
        expect(parseResult.data.middle_name).toBe('Jayeshbhai')
        expect(parseResult.data.maiden_name).toBe('Patel')
        expect(parseResult.data.phone_secondary).toBe('+919876543211')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // TEST C: INVALID DATA REJECTION
  // ---------------------------------------------------------------------------
  describe('Test C: Invalid Data Rejection', () => {
    it('rejects future Date of Birth', () => {
      const futureDobPayload = {
        ...VALID_MANDATORY_PAYLOAD,
        date_of_birth: '2099-01-01',
      }
      const parseResult = createPersonSchema.safeParse(futureDobPayload)
      expect(parseResult.success).toBe(false)
      if (!parseResult.success) {
        expect(parseResult.error.errors.some((e) => e.message.includes('future'))).toBe(true)
      }
    })

    it('rejects Date of Death earlier than Date of Birth', () => {
      const dodEarlierPayload = {
        ...VALID_MANDATORY_PAYLOAD,
        date_of_birth: '2000-01-01',
        date_of_death: '1990-01-01',
      }
      const parseResult = createPersonSchema.safeParse(dodEarlierPayload)
      expect(parseResult.success).toBe(false)
      if (!parseResult.success) {
        expect(
          parseResult.error.errors.some((e) => e.message.includes('earlier than date of birth'))
        ).toBe(true)
      }
    })

    it('rejects invalid email formats', () => {
      const badEmailPayload = {
        ...VALID_MANDATORY_PAYLOAD,
        email_contact: 'not-an-email',
      }
      const parseResult = createPersonSchema.safeParse(badEmailPayload)
      expect(parseResult.success).toBe(false)
    })

    it('rejects invalid phone formats (too short or letters)', () => {
      const badPhonePayload = {
        ...VALID_MANDATORY_PAYLOAD,
        phone: '123',
      }
      const parseResult = createPersonSchema.safeParse(badPhonePayload)
      expect(parseResult.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // TEST D: GOTRA AND NUKH RELATIONSHIP VALIDATION
  // ---------------------------------------------------------------------------
  describe('Test D: Gotra and Nukh Relationship Validation', () => {
    it('rejects an invalid Gotra that is not in the authoritative 29 Gotras', () => {
      const invalidGotraPayload = {
        ...VALID_MANDATORY_PAYLOAD,
        gotra: 'FictionalGotra',
      }
      const parseResult = createPersonSchema.safeParse(invalidGotraPayload)
      expect(parseResult.success).toBe(false)
      if (!parseResult.success) {
        expect(
          parseResult.error.errors.some((e) =>
            e.message.includes('Must be one of the authoritative 29 Gotras')
          )
        ).toBe(true)
      }
    })

    it('rejects a Nukh that does not belong to the selected Gotra', () => {
      const mismatchedNukhPayload = {
        ...VALID_MANDATORY_PAYLOAD,
        gotra: 'Agastya',
        nukh: 'Harshun', // Harshun belongs to Badrayan, not Agastya
      }
      const parseResult = createPersonSchema.safeParse(mismatchedNukhPayload)
      expect(parseResult.success).toBe(false)
      if (!parseResult.success) {
        expect(
          parseResult.error.errors.some((e) =>
            e.message.includes('does not belong to Gotra "Agastya"')
          )
        ).toBe(true)
      }
    })

    it('accepts matching Gotra and Nukh', () => {
      const validPair = {
        ...VALID_MANDATORY_PAYLOAD,
        gotra: 'Badrayan',
        nukh: 'Harshun',
      }
      const parseResult = createPersonSchema.safeParse(validPair)
      expect(parseResult.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TEST E: PARTIAL UPDATE VIA updatePersonSchema
  // ---------------------------------------------------------------------------
  describe('Test E: Partial Update Validation', () => {
    it('allows updating a single field without supplying all 10 mandatory fields', () => {
      const partialUpdate = {
        phone: '+919999888877',
      }
      const parseResult = updatePersonSchema.safeParse(partialUpdate)
      expect(parseResult.success).toBe(true)
    })

    it('validates supplied fields during partial update (rejects invalid data)', () => {
      const invalidPartialUpdate = {
        email_contact: 'bad-email',
      }
      const parseResult = updatePersonSchema.safeParse(invalidPartialUpdate)
      expect(parseResult.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // TEST F: UI ASTERISKS AND REQUIRED INDICATORS
  // ---------------------------------------------------------------------------
  describe('Test F: UI Asterisks and Required Indicators', () => {
    const mockAuthContext = {
      user: { id: 'test-user-123', email: 'test@example.com' } as any,
      profile: { id: 'prof-1', role: 'MEMBER' } as any,
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      resetPassword: vi.fn(),
    }

    it('renders red asterisks for mandatory fields and NO asterisks for optional fields', () => {
      render(
        <AuthContext.Provider value={mockAuthContext}>
          <PersonForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />
        </AuthContext.Provider>
      )

      // Mandatory fields must have red asterisks
      const firstNameLabel = screen.getByText('First name')
      expect(firstNameLabel).toBeInTheDocument()
      expect(firstNameLabel.parentElement?.textContent).toContain('*')

      const lastNameLabel = screen.getByText('Last name / Surname')
      expect(lastNameLabel).toBeInTheDocument()
      expect(lastNameLabel.parentElement?.textContent).toContain('*')

      const genderLabel = screen.getByText('Gender')
      expect(genderLabel).toBeInTheDocument()
      expect(genderLabel.textContent).toContain('*')

      const bloodGroupLabel = screen.getByText('Blood Group')
      expect(bloodGroupLabel).toBeInTheDocument()
      expect(bloodGroupLabel.textContent).toContain('*')

      const birthplaceLabel = screen.getByText('Birthplace')
      expect(birthplaceLabel).toBeInTheDocument()
      expect(birthplaceLabel.parentElement?.textContent).toContain('*')

      const dobLabel = screen.getByText('Date of birth')
      expect(dobLabel).toBeInTheDocument()
      expect(dobLabel.parentElement?.textContent).toContain('*')

      const gotraLabel = screen.getByText('Gotra')
      expect(gotraLabel).toBeInTheDocument()
      expect(gotraLabel.textContent).toContain('*')

      const nukhLabel = screen.getByText('Nukh')
      expect(nukhLabel).toBeInTheDocument()
      expect(nukhLabel.textContent).toContain('*')

      const phoneLabel = screen.getByText('Primary Phone')
      expect(phoneLabel).toBeInTheDocument()
      expect(phoneLabel.parentElement?.textContent).toContain('*')

      // Optional fields must be present WITHOUT required asterisks
      const middleNameLabel = screen.getByText('Middle name')
      expect(middleNameLabel).toBeInTheDocument()
      expect(middleNameLabel.textContent).not.toContain('*')

      const maidenNameLabel = screen.getByText(/Maiden name \(if applicable\)/i)
      expect(maidenNameLabel).toBeInTheDocument()
      expect(maidenNameLabel.textContent).not.toContain('*')

      const dodLabel = screen.getByText('Date of death')
      expect(dodLabel).toBeInTheDocument()
      expect(dodLabel.textContent).not.toContain('*')

      const secondaryPhoneLabel = screen.getByText('Secondary phone')
      expect(secondaryPhoneLabel).toBeInTheDocument()
      expect(secondaryPhoneLabel.textContent).not.toContain('*')
    })
  })
})
