/**
 * Zod validation schemas for interpersonal relationships
 *
 * Enforces field validations, input sanitization, and canonical relationship rules.
 *
 * PROTECTED FIELDS REJECTED FROM CLIENT INPUT:
 * - id (system generated)
 * - created_by (injected from verified auth session)
 * - created_at (system generated)
 * - updated_at (system generated)
 * - deleted_at (managed exclusively via soft-deletion operation)
 * - verification_status (managed exclusively via moderation workflow)
 */

import { z } from 'zod'
import { RELATIONSHIP_TYPES } from '../types'
import { sanitizeMultilineText } from '@/lib/sanitization'

/** Zod schema for canonical relationship type enum */
export const relationshipTypeSchema = z.enum(
  RELATIONSHIP_TYPES as [string, ...string[]]
)

/** Zod schema for creating a new relationship edge */
export const createRelationshipSchema = z
  .object({
    person_a_id: z
      .string({ required_error: 'First person ID is required' })
      .uuid('First person ID must be a valid UUID'),
    person_b_id: z
      .string({ required_error: 'Second person ID is required' })
      .uuid('Second person ID must be a valid UUID'),
    relationship_type: relationshipTypeSchema,
    notes: z
      .string()
      .transform(sanitizeMultilineText)
      .pipe(z.string().max(1000, 'Notes cannot exceed 1000 characters'))
      .optional()
      .nullable(),
  })
  .strict()
  .refine(
    (data) => data.person_a_id !== data.person_b_id,
    {
      message: 'A person cannot have a relationship with themselves',
      path: ['person_b_id'],
    }
  )
  .refine(
    (data) => {
      if (data.relationship_type === 'SPOUSE' || data.relationship_type === 'SIBLING') {
        return data.person_a_id < data.person_b_id
      }
      return true
    },
    {
      message:
        'Symmetric relationships (SPOUSE, SIBLING) must be ordered with person_a_id < person_b_id',
      path: ['person_a_id'],
    }
  )

export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>

/** Zod schema for updating an existing relationship edge */
export const updateRelationshipSchema = z
  .object({
    notes: z
      .string()
      .transform(sanitizeMultilineText)
      .pipe(z.string().max(1000, 'Notes cannot exceed 1000 characters'))
      .optional()
      .nullable(),
  })
  .strict()

export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>
