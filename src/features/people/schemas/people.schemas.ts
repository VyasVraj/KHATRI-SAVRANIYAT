/**
 * People feature — Zod validation schemas
 *
 * Derived exclusively from the deployed `persons` table schema
 * (src/types/database.types.ts — generated, do not hand-edit).
 *
 * SECURITY NOTE:
 * These schemas define what a regular authenticated user may supply as input.
 * Protected system fields are intentionally ABSENT from all schemas:
 *   - id            (DB generated)
 *   - created_at    (DB generated)
 *   - updated_at    (DB managed via trigger)
 *   - created_by    (set from auth.uid() inside the service, never user input)
 *   - user_id       (NULL until Phase 8 claim flow — PERSON != USER boundary)
 *   - status        (system managed: DRAFT → ACTIVE via admin/moderation)
 *   - verification_status (system managed)
 *   - deleted_at    (set only by softDeletePerson service function)
 */

import { z } from 'zod'
import { sanitizeText } from '@/lib/sanitization'
import { isValidGotra, isValidNukhForGotra } from '@/constants/gotraNukh'
import { BLOOD_GROUPS } from '@/constants/bloodGroup'

// ---------------------------------------------------------------------------
// Shared field validators — derived from deployed schema constraints
// ---------------------------------------------------------------------------

/** Deployed: char_length(first_name) BETWEEN 1 AND 100, NOT NULL */
const firstNameField = z
  .string({ required_error: 'First name is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'First name is required')
      .max(100, 'First name must not exceed 100 characters')
  )

/** Deployed: char_length(last_name) BETWEEN 1 AND 100, NOT NULL */
const lastNameField = z
  .string({ required_error: 'Last name is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Last name is required')
      .max(100, 'Last name must not exceed 100 characters')
  )

/** Deployed: middle_name VARCHAR nullable */
const middleNameField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Middle name must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: maiden_name VARCHAR nullable */
const maidenNameField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Maiden name must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: gender enum ('MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY') nullable */
const genderField = z
  .enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  .nullable()
  .optional()

/** Deployed: blood_group ('A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'UNKNOWN') nullable */
const bloodGroupField = z
  .enum(BLOOD_GROUPS)
  .or(z.literal(''))
  .nullable()
  .optional()

function getTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Deployed: date_of_birth DATE nullable — stored as ISO string */
const dateOfBirthField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
  .refine((val) => val <= getTodayIso(), 'Date of birth cannot be in the future')
  .nullable()
  .optional()

/** Deployed: date_of_death DATE nullable — stored as ISO string */
const dateOfDeathField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of death must be in YYYY-MM-DD format')
  .refine((val) => val <= getTodayIso(), 'Date of death cannot be in the future')
  .nullable()
  .optional()

/** Deployed: birth_place VARCHAR nullable */
const birthPlaceField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(200, 'Birth place must not exceed 200 characters'))
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

/** Deployed: email_contact VARCHAR nullable */
const emailContactField = z
  .string()
  .email('Please enter a valid email address')
  .max(254, 'Email must not exceed 254 characters')
  .nullable()
  .optional()

/** Deployed: phone VARCHAR nullable */
const phoneField = z
  .string()
  .max(30, 'Phone number must not exceed 30 characters')
  .nullable()
  .optional()

/** Deployed: phone_secondary VARCHAR nullable */
const phoneSecondaryField = z
  .string()
  .max(30, 'Secondary phone must not exceed 30 characters')
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
// createPersonSchema
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new person record.
 *
 * Required: first_name, last_name.
 * Optional: all other user-editable fields.
 *
 * Privacy defaults: the database defaults all privacy fields to COMMUNITY.
 * If not provided here, the database default applies.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * user_id, status, verification_status, deleted_at.
 */
export const createPersonSchema = z
  .object({
    first_name: firstNameField,
    last_name: lastNameField,
    middle_name: middleNameField,
    maiden_name: maidenNameField,
    gender: genderField,
    blood_group: bloodGroupField,
    date_of_birth: dateOfBirthField,
    date_of_death: dateOfDeathField,
    birth_place: birthPlaceField,
    gotra: gotraField,
    kul: kulField,
    nukh: nukhField,
    email_contact: emailContactField,
    phone: phoneField,
    phone_secondary: phoneSecondaryField,
    // Privacy fields — default to PRIVATE per project privacy model & ANDROID-2 lock
    // Optional in input: if omitted by caller, the database default (PRIVATE) applies.
    profile_privacy: privacyLevelField.optional().default('PRIVATE'),
    contact_privacy: privacyLevelField.optional().default('PRIVATE'),
    dob_privacy: privacyLevelField.optional().default('PRIVATE'),
  })
  .superRefine((data, ctx) => {
    if (data.date_of_birth && data.date_of_death) {
      if (data.date_of_death < data.date_of_birth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date of death cannot be earlier than date of birth.',
          path: ['date_of_death'],
        })
      }
    }

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
export type CreatePersonInput = z.input<typeof createPersonSchema>
/** Parsed/output type — all defaults have been applied. */
export type CreatePersonParsed = z.infer<typeof createPersonSchema>

// ---------------------------------------------------------------------------
// updatePersonSchema
// ---------------------------------------------------------------------------

/**
 * Schema for updating an existing person record.
 *
 * All fields are optional (partial update pattern).
 * Same user-editable field set as createPersonSchema.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * user_id, status, verification_status, deleted_at.
 */
export const updatePersonSchema = z
  .object({
    first_name: firstNameField.optional(),
    last_name: lastNameField.optional(),
    middle_name: middleNameField,
    maiden_name: maidenNameField,
    gender: genderField,
    blood_group: bloodGroupField,
    date_of_birth: dateOfBirthField,
    date_of_death: dateOfDeathField,
    birth_place: birthPlaceField,
    gotra: gotraField,
    kul: kulField,
    nukh: nukhField,
    email_contact: emailContactField,
    phone: phoneField,
    phone_secondary: phoneSecondaryField,
    profile_privacy: privacyLevelField.optional(),
    contact_privacy: privacyLevelField.optional(),
    dob_privacy: privacyLevelField.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  )
  .superRefine((data, ctx) => {
    if (data.date_of_birth && data.date_of_death) {
      if (data.date_of_death < data.date_of_birth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date of death cannot be earlier than date of birth.',
          path: ['date_of_death'],
        })
      }
    }

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

export type UpdatePersonInput = z.input<typeof updatePersonSchema>
export type UpdatePersonParsed = z.infer<typeof updatePersonSchema>
