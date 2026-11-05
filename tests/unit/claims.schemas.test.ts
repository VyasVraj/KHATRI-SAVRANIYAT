/**
 * Unit Tests: Claims Schemas (Phase 8 Subtask 2)
 * (src/features/claims/schemas/claims.schemas.ts)
 */

import { describe, it, expect } from 'vitest'
import {
  submitClaimSchema,
  cancelClaimSchema,
} from '@/features/claims/schemas/claims.schemas'

const VALID_PERSON_ID = '11111111-1111-4111-8111-111111111111'
const VALID_CLAIM_ID = '22222222-2222-4222-8222-222222222222'

describe('Claims Schemas', () => {
  describe('submitClaimSchema', () => {
    it('passes for valid person ID without evidence notes', () => {
      const result = submitClaimSchema.safeParse({
        personId: VALID_PERSON_ID,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.personId).toBe(VALID_PERSON_ID)
        expect(result.data.evidenceNotes).toBeUndefined()
      }
    })

    it('passes for valid person ID with evidence notes under 1000 characters', () => {
      const notes = 'I am the eldest child of this individual.'
      const result = submitClaimSchema.safeParse({
        personId: VALID_PERSON_ID,
        evidenceNotes: notes,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.evidenceNotes).toBe(notes)
      }
    })

    it('passes for exactly 1000 characters in evidence notes', () => {
      const notes = 'a'.repeat(1000)
      const result = submitClaimSchema.safeParse({
        personId: VALID_PERSON_ID,
        evidenceNotes: notes,
      })
      expect(result.success).toBe(true)
    })

    it('fails for evidence notes exceeding 1000 characters', () => {
      const notes = 'a'.repeat(1001)
      const result = submitClaimSchema.safeParse({
        personId: VALID_PERSON_ID,
        evidenceNotes: notes,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('cannot exceed 1000 characters')
      }
    })

    it('fails for invalid person ID format', () => {
      const result = submitClaimSchema.safeParse({
        personId: 'not-a-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('valid person ID')
      }
    })

    it('fails for missing person ID', () => {
      const result = submitClaimSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('cancelClaimSchema', () => {
    it('passes for valid claim ID and person ID', () => {
      const result = cancelClaimSchema.safeParse({
        claimId: VALID_CLAIM_ID,
        personId: VALID_PERSON_ID,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.claimId).toBe(VALID_CLAIM_ID)
        expect(result.data.personId).toBe(VALID_PERSON_ID)
      }
    })

    it('fails for invalid claim ID format', () => {
      const result = cancelClaimSchema.safeParse({
        claimId: 'bad-uuid',
        personId: VALID_PERSON_ID,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('valid claim ID')
      }
    })

    it('fails for invalid person ID format in cancellation', () => {
      const result = cancelClaimSchema.safeParse({
        claimId: VALID_CLAIM_ID,
        personId: 'invalid-person-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('valid person ID')
      }
    })
  })
})
