/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
/**
 * Unit tests for Gotra and Nukh validation rules in Zod schemas
 * (src/features/people/schemas/people.schemas.ts)
 * (src/features/families/schemas/families.schemas.ts)
 */

import { describe, it, expect } from 'vitest'
import { createPersonSchema, updatePersonSchema } from '@/features/people/schemas/people.schemas'
import { createFamilySchema, updateFamilySchema } from '@/features/families/schemas/families.schemas'

describe('Gotra and Nukh Zod Schema Validations', () => {
  describe('createPersonSchema', () => {
    const basePerson = {
      first_name: 'Aarav',
      last_name: 'Kashyap',
      gender: 'MALE' as const,
      blood_group: 'B+' as const,
      birth_place: 'Vadodara, Gujarat',
      date_of_birth: '1990-01-01',
      gotra: 'Agastya',
      nukh: 'Arora (Aroda)',
      email_contact: 'aarav@example.com',
      phone: '+919876543210',
    }

    it('fails when gotra or nukh are omitted or null', () => {
      const { gotra: _g, nukh: _n, ...withoutGotraNukh } = basePerson
      const result1 = createPersonSchema.safeParse(withoutGotraNukh)
      expect(result1.success).toBe(false)

      const result2 = createPersonSchema.safeParse({ ...basePerson, gotra: null as any, nukh: null as any })
      expect(result2.success).toBe(false)
    })

    it('fails when Gotra is provided without Nukh', () => {
      const { nukh: _n, ...withoutNukh } = basePerson
      const result = createPersonSchema.safeParse(withoutNukh)
      expect(result.success).toBe(false)
    })

    it('succeeds when valid Gotra and matching Nukh are provided', () => {
      const result = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'Agastya',
        nukh: 'Arora (Aroda)',
      })
      expect(result.success).toBe(true)
    })

    it('fails when gotra is not one of the authoritative 29 Gotras', () => {
      const result = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'InvalidGotraName',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('gotra')
        expect(result.error.errors[0].message).toContain('Must be one of the authoritative 29 Gotras')
      }
    })

    it('fails when Nukh is provided without a Gotra', () => {
      const { gotra: _g, ...withoutGotra } = basePerson
      const result = createPersonSchema.safeParse({
        ...withoutGotra,
        nukh: 'Varun',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes('gotra'))).toBe(true)
      }
    })

    it('fails when Nukh does not belong to the selected Gotra', () => {
      // Jani belongs to Garg, NOT Kashyap
      const result = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'Kashyap',
        nukh: 'Jani',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('nukh')
        expect(result.error.errors[0].message).toContain('Nukh "Jani" does not belong to Gotra "Kashyap"')
      }
    })

    it('distinguishes between Garg (#9) and Garga (#10)', () => {
      // Garg #9: Jani is valid, Gargeya is invalid
      const gargValid = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'Garg',
        nukh: 'Jani',
      })
      expect(gargValid.success).toBe(true)

      const gargInvalid = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'Garg',
        nukh: 'Gargeya',
      })
      expect(gargInvalid.success).toBe(false)

      // Garga #10: Gargeya is valid, Jani is invalid
      const gargaValid = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'Garga',
        nukh: 'Gargeya',
      })
      expect(gargaValid.success).toBe(true)

      const gargaInvalid = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'Garga',
        nukh: 'Jani',
      })
      expect(gargaInvalid.success).toBe(false)
    })
  })

  describe('updatePersonSchema', () => {
    it('succeeds for partial update without gotra or nukh', () => {
      const result = updatePersonSchema.safeParse({ first_name: 'Rohan' })
      expect(result.success).toBe(true)
    })

    it('fails when updated gotra is invalid', () => {
      const result = updatePersonSchema.safeParse({ gotra: 'UnknownGotra' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('gotra')
      }
    })

    it('fails when both gotra and nukh are supplied and do not match', () => {
      const result = updatePersonSchema.safeParse({
        gotra: 'Bharadwaj',
        nukh: 'Solanki', // Solanki belongs to Gautam or Kashyap or Vashistha
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('nukh')
      }
    })
  })

  describe('createFamilySchema', () => {
    const baseFamily = {
      family_name: 'Palanpur Parivar',
    }

    it('succeeds with valid Gotra and valid Nukh', () => {
      const result = createFamilySchema.safeParse({
        ...baseFamily,
        gotra: 'Sudarshan',
        nukh: 'Vaswani',
      })
      expect(result.success).toBe(true)
    })

    it('fails with invalid Gotra', () => {
      const result = createFamilySchema.safeParse({
        ...baseFamily,
        gotra: 'BogusGotra',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('gotra')
      }
    })

    it('fails with Nukh without Gotra', () => {
      const result = createFamilySchema.safeParse({
        ...baseFamily,
        nukh: 'Vaswani',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('nukh')
      }
    })

    it('fails when Nukh does not match Gotra', () => {
      const result = createFamilySchema.safeParse({
        ...baseFamily,
        gotra: 'Sudarshan',
        nukh: 'Bhatt',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('nukh')
      }
    })
  })

  describe('updateFamilySchema', () => {
    it('succeeds for partial update of city', () => {
      const result = updateFamilySchema.safeParse({ city: 'Palanpur' })
      expect(result.success).toBe(true)
    })

    it('fails when updated Gotra is invalid', () => {
      const result = updateFamilySchema.safeParse({ gotra: 'FakeGotra' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('gotra')
      }
    })
  })
})
