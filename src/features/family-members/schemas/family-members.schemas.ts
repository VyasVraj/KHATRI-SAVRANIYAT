/**
 * Family members feature — Zod validation schemas
 *
 * Derived exclusively from the deployed `family_members` table schema
 * (src/types/database.types.ts — generated, do not hand-edit).
 *
 * SECURITY NOTE:
 * These schemas define what a regular authenticated user may supply as input.
 * Protected system fields are intentionally ABSENT from all schemas:
 *   - id         (DB generated UUID)
 *   - created_at (DB generated timestamp)
 *   - added_by   (injected from auth.uid() inside service, never user input)
 *   - left_at    (managed via dedicated update/remove APIs, not set on insert)
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enums & shared validators
// ---------------------------------------------------------------------------

/**
 * Deployed: family_role enum
 * ('HEAD' | 'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'GRANDPARENT' | 'GRANDCHILD' | 'EXTENDED')
 */
export const familyRoleEnum = z.enum([
  'HEAD',
  'SPOUSE',
  'CHILD',
  'PARENT',
  'SIBLING',
  'GRANDPARENT',
  'GRANDCHILD',
  'EXTENDED',
])

export type FamilyRoleInput = z.infer<typeof familyRoleEnum>

// ---------------------------------------------------------------------------
// addFamilyMemberSchema
// ---------------------------------------------------------------------------

/**
 * Schema for adding a person to a family.
 *
 * Required:
 *   - family_id: UUID of an existing family record
 *   - person_id: UUID of an existing person record
 *
 * Optional:
 *   - role: defaults to 'EXTENDED'
 *   - is_head: defaults to false
 *   - joined_at: ISO date string, defaults to DB NOW() if omitted
 *
 * Protected fields NOT present:
 *   - id, created_at, added_by, left_at
 */
export const addFamilyMemberSchema = z.object({
  family_id: z.string({ required_error: 'Family ID is required' }).uuid('Invalid family ID format'),
  person_id: z.string({ required_error: 'Person ID is required' }).uuid('Invalid person ID format'),
  role: familyRoleEnum.default('EXTENDED'),
  is_head: z.boolean().default(false),
  joined_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'joined_at must be a valid date format (YYYY-MM-DD)')
    .optional(),
})

export type AddFamilyMemberInput = z.input<typeof addFamilyMemberSchema>
export type AddFamilyMemberParsed = z.infer<typeof addFamilyMemberSchema>

// ---------------------------------------------------------------------------
// updateFamilyMemberSchema
// ---------------------------------------------------------------------------

/**
 * Schema for updating an existing family membership.
 *
 * All fields are optional (partial update pattern).
 * At least one field must be provided.
 *
 * Allowed fields:
 *   - role
 *   - is_head
 *   - left_at (nullable ISO timestamp for recording departure/re-entry)
 *
 * Protected fields NOT present:
 *   - id, family_id, person_id, added_by, created_at
 */
export const updateFamilyMemberSchema = z
  .object({
    role: familyRoleEnum.optional(),
    is_head: z.boolean().optional(),
    left_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, 'left_at must be a valid date format (YYYY-MM-DD)')
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  )

export type UpdateFamilyMemberInput = z.infer<typeof updateFamilyMemberSchema>
