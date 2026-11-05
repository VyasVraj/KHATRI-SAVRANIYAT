/**
 * Unit Tests: Verification Schemas (Phase 9 Subtask 2)
 * (src/features/verification/schemas/verification.schemas.ts)
 */

import { describe, it, expect } from 'vitest'
import { submitVerificationRequestSchema } from '@/features/verification/schemas/verification.schemas'

const VALID_PERSON_ID = '11111111-1111-4111-8111-111111111111'
const VALID_FAMILY_ID = '22222222-2222-4222-8222-222222222222'

describe('Verification Schemas', () => {
  describe('submitVerificationRequestSchema', () => {
    it('passes for valid PERSON entity without supporting notes', () => {
      const result = submitVerificationRequestSchema.safeParse({
        entityType: 'PERSON',
        entityId: VALID_PERSON_ID,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.entityType).toBe('PERSON')
        expect(result.data.entityId).toBe(VALID_PERSON_ID)
        expect(result.data.supportingNotes).toBeUndefined()
      }
    })

    it('passes for valid FAMILY entity with supporting notes under 1000 characters', () => {
      const notes = 'Official family records verified via community registry.'
      const result = submitVerificationRequestSchema.safeParse({
        entityType: 'FAMILY',
        entityId: VALID_FAMILY_ID,
        supportingNotes: notes,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.entityType).toBe('FAMILY')
        expect(result.data.entityId).toBe(VALID_FAMILY_ID)
        expect(result.data.supportingNotes).toBe(notes)
      }
    })

    it('passes for exactly 1000 characters in supporting notes', () => {
      const notes = 'x'.repeat(1000)
      const result = submitVerificationRequestSchema.safeParse({
        entityType: 'PERSON',
        entityId: VALID_PERSON_ID,
        supportingNotes: notes,
      })
      expect(result.success).toBe(true)
    })

    it('fails for supporting notes exceeding 1000 characters', () => {
      const notes = 'x'.repeat(1001)
      const result = submitVerificationRequestSchema.safeParse({
        entityType: 'PERSON',
        entityId: VALID_PERSON_ID,
        supportingNotes: notes,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('cannot exceed 1000 characters')
      }
    })

    it('fails for invalid entity type', () => {
      const result = submitVerificationRequestSchema.safeParse({
        entityType: 'TREE',
        entityId: VALID_PERSON_ID,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('PERSON or FAMILY')
      }
    })

    it('fails for missing or empty entityId', () => {
      const result = submitVerificationRequestSchema.safeParse({
        entityType: 'PERSON',
        entityId: '',
      })
      expect(result.success).toBe(false)
    })

    it('fails for malformed entityId UUID', () => {
      const result = submitVerificationRequestSchema.safeParse({
        entityType: 'PERSON',
        entityId: 'not-a-valid-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('entity ID (UUID)')
      }
    })
  })
})
