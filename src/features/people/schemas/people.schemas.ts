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

/** Deployed: gender enum ('MALE' | 'FEMALE' | 'OTHER') - MANDATORY */
const genderField = z
  .enum(['MALE', 'FEMALE', 'OTHER'], {
    errorMap: () => ({ message: 'Please select Gender' }),
  })

/** Deployed: blood_group ('A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-', 'O+', 'O-') - MANDATORY */
const bloodGroupField = z
  .enum(BLOOD_GROUPS, {
    errorMap: () => ({ message: 'Please select Blood Group' }),
  })
  .refine((bg) => bg !== 'UNKNOWN', 'Please select Blood Group')

function getTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Deployed: date_of_birth DATE - MANDATORY */
const dateOfBirthField = z
  .string({ required_error: 'Date of Birth is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
  .refine((val) => val <= getTodayIso(), 'Date of birth cannot be in the future')

/** Deployed: date_of_death DATE nullable — stored as ISO string */
const dateOfDeathField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of death must be in YYYY-MM-DD format')
  .refine((val) => val <= getTodayIso(), 'Date of death cannot be in the future')
  .nullable()
  .optional()

/** Deployed: birth_place VARCHAR - MANDATORY */
const birthPlaceField = z
  .string({ required_error: 'Birthplace is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Birthplace is required')
      .max(200, 'Birthplace must not exceed 200 characters')
  )

/** Deployed: gotra VARCHAR - MANDATORY */
const gotraField = z
  .string({ required_error: 'Please select Gotra' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Please select Gotra')
      .max(100, 'Gotra must not exceed 100 characters')
  )

/** Deployed: kul VARCHAR nullable — community identity field */
const kulField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Kul must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: nukh VARCHAR - MANDATORY */
const nukhField = z
  .string({ required_error: 'Please select Nukh' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Please select Nukh')
      .max(100, 'Nukh must not exceed 100 characters')
  )

/** Deployed: email_contact VARCHAR - MANDATORY */
const emailContactField = z
  .string({ required_error: 'Valid Email Address is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Valid Email Address is required')
      .email('Valid Email Address is required')
      .max(254, 'Email must not exceed 254 characters')
  )

/** Deployed: phone VARCHAR - MANDATORY */
const phoneField = z
  .string({ required_error: 'Valid Primary Phone Number is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Valid Primary Phone Number is required')
      .max(30, 'Phone number must not exceed 30 characters')
      .refine(
        (val) => /^[0-9+\s\-()]{7,25}$/.test(val),
        'Valid Primary Phone Number is required'
      )
  )

/** Deployed: phone_secondary VARCHAR nullable */
const phoneSecondaryField = z
  .string()
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .max(30, 'Secondary phone must not exceed 30 characters')
      .refine(
        (val) => !val || /^[0-9+\s\-()]{7,25}$/.test(val),
        'Please enter a valid secondary phone number'
      )
  )
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
    gender: genderField.optional(),
    blood_group: bloodGroupField.optional(),
    date_of_birth: dateOfBirthField.optional(),
    date_of_death: dateOfDeathField,
    birth_place: birthPlaceField.optional(),
    gotra: gotraField.optional(),
    kul: kulField,
    nukh: nukhField.optional(),
    email_contact: emailContactField.optional(),
    phone: phoneField.optional(),
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
