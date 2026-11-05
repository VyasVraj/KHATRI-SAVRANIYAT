/**
 * Families feature — Zod validation schemas
 *
 * Derived exclusively from the deployed `families` table schema
 * (src/types/database.types.ts — generated, do not hand-edit).
 *
 * SECURITY NOTE:
 * These schemas define what a regular authenticated user may supply as input.
 * Protected system fields are intentionally ABSENT from all schemas:
 *   - id                  (DB generated)
 *   - created_at          (DB generated)
 *   - updated_at          (DB managed via trigger)
 *   - created_by          (set from auth.uid() inside the service, never user input)
 *   - status              (system managed: DRAFT → ACTIVE via admin/moderation)
 *   - verification_status (system managed)
 *   - deleted_at          (set only by softDeleteFamily service function)
 */

import { z } from 'zod'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'
import { isValidGotra, isValidNukhForGotra } from '@/constants/gotraNukh'

// ---------------------------------------------------------------------------
// Shared field validators — derived from deployed schema constraints
// ---------------------------------------------------------------------------

/**
 * Deployed: family_name VARCHAR NOT NULL
 * The only required field for a family record.
 */
const familyNameField = z
  .string({ required_error: 'Family name is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Family name is required')
      .max(200, 'Family name must not exceed 200 characters')
  )

/** Deployed: description TEXT nullable */
const descriptionField = z
  .string()
  .transform(sanitizeMultilineText)
  .pipe(z.string().max(2000, 'Description must not exceed 2000 characters'))
  .nullable()
  .optional()

/** Deployed: city VARCHAR nullable */
const cityField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'City must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: state VARCHAR nullable */
const stateField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'State must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: country VARCHAR nullable */
const countryField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Country must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: gotra VARCHAR nullable — community identity field */
const gotraField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Gotra must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: kul VARCHAR nullable — community identity field */
const kulField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Kul must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: nukh VARCHAR nullable — community identity field */
const nukhField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Nukh must not exceed 100 characters'))
  .nullable()
  .optional()

/**
 * Deployed: privacy_level enum
 * ('PRIVATE' | 'FAMILY' | 'CONNECTIONS' | 'COMMUNITY' | 'PUBLIC')
 */
const privacyLevelField = z.enum([
  'PRIVATE',
  'FAMILY',
  'CONNECTIONS',
  'COMMUNITY',
  'PUBLIC',
])

// ---------------------------------------------------------------------------
// createFamilySchema
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new family record.
 *
 * Required: family_name.
 * Optional: all other user-editable fields.
 *
 * Two independent privacy fields control visibility:
 *   - profile_privacy:  who can see the family record itself.
 *   - members_privacy:  who can see the member list for this family.
 * Both default to COMMUNITY per the project privacy model.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * status, verification_status, deleted_at.
 */
export const createFamilySchema = z
  .object({
    family_name: familyNameField,
    description: descriptionField,
    city: cityField,
    state: stateField,
    country: countryField,
    gotra: gotraField,
    kul: kulField,
    nukh: nukhField,
    // Privacy fields — both default to PRIVATE per project privacy model & ANDROID-2 lock
    // Optional in input: if omitted, the database default (PRIVATE) applies.
    profile_privacy: privacyLevelField.optional().default('PRIVATE'),
    members_privacy: privacyLevelField.optional().default('PRIVATE'),
    selected_mukhi_id: z.string().uuid('Invalid Mukhi ID').nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const trimmedGotra = data.gotra?.trim()
    const trimmedNukh = data.nukh?.trim()

    if (trimmedGotra && !isValidGotra(trimmedGotra)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid Gotra. Must be one of the authoritative 29 Gotras.',
        path: ['gotra'],
      })
    }

    if (trimmedNukh) {
      if (!trimmedGotra) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Nukh cannot be specified without a corresponding Gotra.',
          path: ['nukh'],
        })
      } else if (isValidGotra(trimmedGotra) && !isValidNukhForGotra(trimmedGotra, trimmedNukh)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Nukh "${trimmedNukh}" does not belong to Gotra "${trimmedGotra}".`,
          path: ['nukh'],
        })
      }
    }
  })

/** Input type — fields with defaults are optional. */
export type CreateFamilyInput = z.input<typeof createFamilySchema>
/** Parsed/output type — all defaults have been applied. */
export type CreateFamilyParsed = z.infer<typeof createFamilySchema>

// ---------------------------------------------------------------------------
// updateFamilySchema
// ---------------------------------------------------------------------------

/**
 * Schema for updating an existing family record.
 *
 * All fields are optional (partial update pattern).
 * Same user-editable field set as createFamilySchema.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * status, verification_status, deleted_at.
 */
export const updateFamilySchema = z
  .object({
    family_name: familyNameField.optional(),
    description: descriptionField,
    city: cityField,
    state: stateField,
    country: countryField,
    gotra: gotraField,
    kul: kulField,
    nukh: nukhField,
    profile_privacy: privacyLevelField.optional(),
    members_privacy: privacyLevelField.optional(),
    selected_mukhi_id: z.string().uuid('Invalid Mukhi ID').nullable().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  )
  .superRefine((data, ctx) => {
    const trimmedGotra = data.gotra?.trim()
    const trimmedNukh = data.nukh?.trim()

    if (trimmedGotra && !isValidGotra(trimmedGotra)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid Gotra. Must be one of the authoritative 29 Gotras.',
        path: ['gotra'],
      })
    }

    if (trimmedNukh) {
      if (!trimmedGotra) {
        if (data.gotra !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Nukh cannot be specified without a corresponding Gotra.',
            path: ['nukh'],
          })
        }
      } else if (isValidGotra(trimmedGotra) && !isValidNukhForGotra(trimmedGotra, trimmedNukh)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Nukh "${trimmedNukh}" does not belong to Gotra "${trimmedGotra}".`,
          path: ['nukh'],
        })
      }
    }
  })

export type UpdateFamilyInput = z.infer<typeof updateFamilySchema>
