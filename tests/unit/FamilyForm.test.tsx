/**
 * Unit tests for FamilyForm validation logic and schema contracts.
 *
 * Consistent with tests/unit/PersonForm.test.tsx, this suite tests:
 *   1. createFamilySchema / updateFamilySchema validation logic (schema-level)
 *   2. Independent privacy behavior (profile_privacy, members_privacy)
 *   3. Rejection of protected system fields (id, created_by, status, etc.)
 *   4. Zero references to family_members table
 */

import { describe, it, expect } from 'vitest'
import {
  createFamilySchema,
  updateFamilySchema,
} from '@/features/families/schemas/families.schemas'

// ---------------------------------------------------------------------------
// createFamilySchema — validation logic
// ---------------------------------------------------------------------------

describe('createFamilySchema — validation logic', () => {
  it('passes with only required family_name', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Sharma Family',
    })
    expect(result.success).toBe(true)
  })

  it('fails when family_name is missing', () => {
    const result = createFamilySchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('family_name')
    }
  })

  it('fails when family_name is empty string', () => {
    const result = createFamilySchema.safeParse({
      family_name: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails when family_name is whitespace only', () => {
    const result = createFamilySchema.safeParse({
      family_name: '    ',
    })
    expect(result.success).toBe(false)
  })

  it('trims family_name on success', () => {
    const result = createFamilySchema.safeParse({
      family_name: '  Patel Household  ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.family_name).toBe('Patel Household')
    }
  })

  it('accepts optional location fields', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Desai Family',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.city).toBe('Surat')
      expect(result.data.state).toBe('Gujarat')
      expect(result.data.country).toBe('India')
    }
  })

  it('accepts optional community identity fields', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Desai Family',
      gotra: 'Kashyap',
      kul: 'DesaiKul',
      nukh: 'Varun',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gotra).toBe('Kashyap')
      expect(result.data.kul).toBe('DesaiKul')
      expect(result.data.nukh).toBe('Varun')
    }
  })

  it('accepts description up to 2000 characters', () => {
    const description = 'A'.repeat(2000)
    const result = createFamilySchema.safeParse({
      family_name: 'Desai Family',
      description,
    })
    expect(result.success).toBe(true)
  })

  it('rejects description exceeding 2000 characters', () => {
    const description = 'A'.repeat(2001)
    const result = createFamilySchema.safeParse({
      family_name: 'Desai Family',
      description,
    })
    expect(result.success).toBe(false)
  })

  it('applies PRIVATE default to both privacy fields when omitted per ANDROID-2 lock', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Sharma Family',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.profile_privacy).toBe('PRIVATE')
      expect(result.data.members_privacy).toBe('PRIVATE')
    }
  })

  it('supports independent privacy values for profile_privacy and members_privacy', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Sharma Family',
      profile_privacy: 'PUBLIC',
      members_privacy: 'PRIVATE',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.profile_privacy).toBe('PUBLIC')
      expect(result.data.members_privacy).toBe('PRIVATE')
    }
  })

  it('accepts all 5 valid privacy enum values for both privacy fields', () => {
    const levels = ['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'] as const
    for (const level of levels) {
      const result = createFamilySchema.safeParse({
        family_name: 'Family',
        profile_privacy: level,
        members_privacy: level,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid privacy enum values', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      profile_privacy: 'EVERYONE',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid members_privacy enum values', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      members_privacy: 'INVALID',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Security: protected system fields stripped from create output
// ---------------------------------------------------------------------------

describe('createFamilySchema — protected field security', () => {
  it('schema output does not include id when injected', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      id: 'injected-id',
    })
    if (result.success) {
      expect(result.data).not.toHaveProperty('id')
    }
  })

  it('schema output does not include created_by when injected', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      created_by: 'injected-user-id',
    })
    if (result.success) {
      expect(result.data).not.toHaveProperty('created_by')
    }
  })

  it('schema output does not include status when injected', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      status: 'ACTIVE',
    })
    if (result.success) {
      expect(result.data).not.toHaveProperty('status')
    }
  })

  it('schema output does not include verification_status when injected', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      verification_status: 'VERIFIED',
    })
    if (result.success) {
      expect(result.data).not.toHaveProperty('verification_status')
    }
  })

  it('schema output does not include deleted_at when injected', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      deleted_at: '2026-10-01T00:00:00Z',
    })
    if (result.success) {
      expect(result.data).not.toHaveProperty('deleted_at')
    }
  })

  it('schema output contains zero family_members references', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Family',
      family_members: [{ person_id: 'p1' }],
    })
    if (result.success) {
      expect(result.data).not.toHaveProperty('family_members')
    }
  })
})

// ---------------------------------------------------------------------------
// updateFamilySchema — validation logic
// ---------------------------------------------------------------------------

describe('updateFamilySchema — validation logic', () => {
  it('fails when no fields are provided (empty object)', () => {
    const result = updateFamilySchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('passes with only family_name provided', () => {
    const result = updateFamilySchema.safeParse({ family_name: 'New Family Name' })
    expect(result.success).toBe(true)
  })

  it('passes with only a privacy field provided', () => {
    const result = updateFamilySchema.safeParse({ profile_privacy: 'PRIVATE' })
    expect(result.success).toBe(true)
  })

  it('passes with only members_privacy provided', () => {
    const result = updateFamilySchema.safeParse({ members_privacy: 'FAMILY' })
    expect(result.success).toBe(true)
  })

  it('trims family_name on update', () => {
    const result = updateFamilySchema.safeParse({ family_name: '  Updated Name  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.family_name).toBe('Updated Name')
    }
  })

  it('rejects invalid privacy level on update', () => {
    const result = updateFamilySchema.safeParse({ profile_privacy: 'INVALID' as never })
    expect(result.success).toBe(false)
  })
})
