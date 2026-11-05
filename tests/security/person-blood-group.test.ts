import { describe, it, expect } from 'vitest'
import {
  BLOOD_GROUPS,
  BLOOD_GROUP_OPTIONS,
  isValidBloodGroup,
  formatBloodGroup,
} from '@/constants/bloodGroup'
import { createPersonSchema, updatePersonSchema } from '@/features/people/schemas/people.schemas'
import fs from 'node:fs'
import path from 'node:path'

describe('Person Blood Group Feature Tests', () => {
  describe('Blood Group Constants & Helper Functions', () => {
    it('defines exactly 9 valid options (8 standard types + UNKNOWN)', () => {
      expect(BLOOD_GROUPS).toEqual([
        'A+',
        'A-',
        'B+',
        'B-',
        'AB+',
        'AB-',
        'O+',
        'O-',
        'UNKNOWN',
      ])
      expect(BLOOD_GROUP_OPTIONS).toHaveLength(10) // 1 placeholder ('Select Blood Group') + 9 options
    })

    it('validates blood group correctly via isValidBloodGroup', () => {
      BLOOD_GROUPS.forEach((bg) => {
        expect(isValidBloodGroup(bg)).toBe(true)
      })

      expect(isValidBloodGroup('C+')).toBe(false)
      expect(isValidBloodGroup('A')).toBe(false)
      expect(isValidBloodGroup('Random')).toBe(false)
      expect(isValidBloodGroup('')).toBe(false)
      expect(isValidBloodGroup(null)).toBe(false)
    })

    it('formats blood group correctly for display', () => {
      expect(formatBloodGroup('A+')).toBe('A+')
      expect(formatBloodGroup('O-')).toBe('O-')
      expect(formatBloodGroup('UNKNOWN')).toBe('Unknown / Not Known')
      expect(formatBloodGroup(null)).toBe('Not provided')
      expect(formatBloodGroup(undefined)).toBe('Not provided')
      expect(formatBloodGroup('')).toBe('Not provided')
    })
  })

  describe('Zod Validation in createPersonSchema & updatePersonSchema', () => {
    const baseValidPerson = {
      first_name: 'Vraj',
      last_name: 'Vyas',
      gender: 'MALE' as const,
    }

    it('allows all 9 supported blood groups in createPersonSchema', () => {
      for (const bg of BLOOD_GROUPS) {
        const result = createPersonSchema.safeParse({
          ...baseValidPerson,
          blood_group: bg,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.blood_group).toBe(bg)
        }
      }
    })

    it('allows null, undefined, and empty string in createPersonSchema', () => {
      const withNull = createPersonSchema.safeParse({
        ...baseValidPerson,
        blood_group: null,
      })
      expect(withNull.success).toBe(true)

      const withUndefined = createPersonSchema.safeParse({
        ...baseValidPerson,
      })
      expect(withUndefined.success).toBe(true)

      const withEmpty = createPersonSchema.safeParse({
        ...baseValidPerson,
        blood_group: '',
      })
      expect(withEmpty.success).toBe(true)
    })

    it('rejects invalid blood group values in createPersonSchema', () => {
      const invalidValues = ['C+', 'AB', 'XYZ', 'POSITIVE', 'O++']
      for (const invalid of invalidValues) {
        const result = createPersonSchema.safeParse({
          ...baseValidPerson,
          blood_group: invalid,
        })
        expect(result.success).toBe(false)
      }
    })

    it('allows updating blood group in updatePersonSchema', () => {
      const result = updatePersonSchema.safeParse({
        blood_group: 'B+',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.blood_group).toBe('B+')
      }

      const invalid = updatePersonSchema.safeParse({
        blood_group: 'INVALID',
      })
      expect(invalid.success).toBe(false)
    })
  })

  describe('Database Migration & Security Invariants', () => {
    it('migration file exists and enforces CHECK constraint and security barrier privacy', () => {
      const migrationFile = path.resolve(
        process.cwd(),
        'supabase/migrations/20261105210000_add_blood_group_to_persons.sql'
      )
      expect(fs.existsSync(migrationFile)).toBe(true)

      const sql = fs.readFileSync(migrationFile, 'utf-8')

      // Check column addition
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS blood_group TEXT NULL')

      // Check CHECK constraint
      expect(sql).toContain('chk_persons_blood_group')
      expect(sql).toContain("'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'")

      // Check community_persons view security barrier privacy
      expect(sql).toContain('CREATE OR REPLACE VIEW public.community_persons')
      expect(sql).toContain('CASE')
      expect(sql).toContain('public.is_admin() OR public.is_same_family_member(p.id)')
      expect(sql).toContain('THEN p.blood_group')
      expect(sql).toContain('ELSE NULL')
      expect(sql).toContain('END AS blood_group')

      // Check create_family_with_head RPC supports p_new_person_blood_group
      expect(sql).toContain('p_new_person_blood_group TEXT DEFAULT NULL')

      // Check get_person_protected_details RPC returns blood_group
      expect(sql).toContain('p.blood_group')
    })
  })
})
