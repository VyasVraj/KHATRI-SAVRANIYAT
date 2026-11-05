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
    }

    it('succeeds when gotra and nukh are omitted or null', () => {
      const result1 = createPersonSchema.safeParse({ ...basePerson })
      expect(result1.success).toBe(true)

      const result2 = createPersonSchema.safeParse({ ...basePerson, gotra: null, nukh: null })
      expect(result2.success).toBe(true)
    })

    it('succeeds when valid Gotra is provided without Nukh', () => {
      const result = createPersonSchema.safeParse({ ...basePerson, gotra: 'Kashyap' })
      expect(result.success).toBe(true)
    })

    it('succeeds when valid Gotra and matching Nukh are provided', () => {
      const result = createPersonSchema.safeParse({
        ...basePerson,
        gotra: 'Kashyap',
        nukh: 'Varun',
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
      const result = createPersonSchema.safeParse({
        ...basePerson,
        nukh: 'Varun',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('nukh')
        expect(result.error.errors[0].message).toContain('Nukh cannot be specified without a corresponding Gotra')
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
