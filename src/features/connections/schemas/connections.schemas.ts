/**
 * Zod validation schemas for Connections domain operations (Phase 7 Subtask 1)
 *
 * Enforces strict input validation and protected field omission.
 */

import { z } from 'zod'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const connectionStatusEnum = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'BLOCKED',
])

export const sendConnectionRequestSchema = z
  .object({
    addressee_id: z.string().regex(UUID_REGEX, 'addressee_id must be a valid UUID'),
  })
  .strict()

export const updateConnectionStatusSchema = z
  .object({
    status: z.enum(['ACCEPTED', 'REJECTED', 'BLOCKED']),
  })
  .strict()

export const connectionIdSchema = z.string().regex(UUID_REGEX, 'connection_id must be a valid UUID')

export type SendConnectionRequestInput = z.infer<typeof sendConnectionRequestSchema>
export type UpdateConnectionStatusInput = z.infer<typeof updateConnectionStatusSchema>
