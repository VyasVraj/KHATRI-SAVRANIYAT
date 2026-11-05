/**
 * Unit Tests: Connections Zod Schemas (Phase 7 Subtask 1)
 * (src/features/connections/schemas/connections.schemas.ts)
 */

import { describe, it, expect } from 'vitest'
import {
  sendConnectionRequestSchema,
  updateConnectionStatusSchema,
  connectionStatusEnum,
  connectionIdSchema,
} from '@/features/connections/schemas/connections.schemas'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'
const INVALID_UUID = 'invalid-uuid-format'

describe('Connections Schemas', () => {
  describe('connectionStatusEnum', () => {
    it('accepts valid statuses', () => {
      expect(connectionStatusEnum.parse('PENDING')).toBe('PENDING')
      expect(connectionStatusEnum.parse('ACCEPTED')).toBe('ACCEPTED')
      expect(connectionStatusEnum.parse('REJECTED')).toBe('REJECTED')
      expect(connectionStatusEnum.parse('BLOCKED')).toBe('BLOCKED')
    })

    it('rejects invalid statuses', () => {
      expect(() => connectionStatusEnum.parse('ACTIVE')).toThrow()
      expect(() => connectionStatusEnum.parse('FRIENDS')).toThrow()
      expect(() => connectionStatusEnum.parse('')).toThrow()
    })
  })

  describe('sendConnectionRequestSchema', () => {
    it('validates correct input payload', () => {
      const result = sendConnectionRequestSchema.parse({
        addressee_id: VALID_UUID,
      })
      expect(result.addressee_id).toBe(VALID_UUID)
    })

    it('rejects invalid UUID format for addressee_id', () => {
      expect(() =>
        sendConnectionRequestSchema.parse({
          addressee_id: INVALID_UUID,
        })
      ).toThrow(/valid UUID/)
    })

    it('strictly rejects unrecognized keys', () => {
      expect(() =>
        sendConnectionRequestSchema.parse({
          addressee_id: VALID_UUID,
          status: 'ACCEPTED', // Protected field
        })
      ).toThrow()
    })
  })

  describe('updateConnectionStatusSchema', () => {
    it('accepts valid target status transitions', () => {
      expect(updateConnectionStatusSchema.parse({ status: 'ACCEPTED' })).toEqual({
        status: 'ACCEPTED',
      })
      expect(updateConnectionStatusSchema.parse({ status: 'REJECTED' })).toEqual({
        status: 'REJECTED',
      })
      expect(updateConnectionStatusSchema.parse({ status: 'BLOCKED' })).toEqual({
        status: 'BLOCKED',
      })
    })

    it('rejects PENDING as an update transition', () => {
      expect(() => updateConnectionStatusSchema.parse({ status: 'PENDING' })).toThrow()
    })

    it('rejects unknown fields', () => {
      expect(() =>
        updateConnectionStatusSchema.parse({
          status: 'ACCEPTED',
          requester_id: VALID_UUID,
        })
      ).toThrow()
    })
  })

  describe('connectionIdSchema', () => {
    it('validates valid UUID string', () => {
      expect(connectionIdSchema.parse(VALID_UUID)).toBe(VALID_UUID)
    })

    it('rejects non-UUID string', () => {
      expect(() => connectionIdSchema.parse('not-a-uuid')).toThrow()
    })
  })
})
