/**
 * Discovery domain Zod validation schemas
 *
 * Validates search and filtering parameters for People and Family directory queries.
 * Enforces strict typing, field boundaries, and pagination bounds.
 *
 * SECURITY & SCOPE CONSTRAINTS:
 * - `.strict()` prevents arbitrary column injection from client requests.
 * - Rejects non-existent columns (e.g. city/state/mukhi on persons; native_place/mukhi on families).
 * - Enforces hard pagination limits: pageSize <= 50.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes an optional string: trims whitespace, transforms empty string
 * to undefined, and caps length.
 */
const optionalTrimmedString = (max = 100) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((val) => (val === '' ? undefined : val))
    .optional()

// ---------------------------------------------------------------------------
// Pagination Schema
// ---------------------------------------------------------------------------

export const discoveryPaginationSchema = z
  .object({
    page: z
      .number({ invalid_type_error: 'Page must be a number' })
      .int('Page must be an integer')
      .min(1, 'Page must be at least 1')
      .default(1),
    pageSize: z
      .number({ invalid_type_error: 'Page size must be a number' })
      .int('Page size must be an integer')
      .min(1, 'Page size must be at least 1')
      .max(50, 'Page size cannot exceed 50')
      .default(20),
  })
  .strict()

export type DiscoveryPaginationInput = z.infer<typeof discoveryPaginationSchema>

// ---------------------------------------------------------------------------
// Person Discovery Filter Schema
// ---------------------------------------------------------------------------

export const personDiscoveryFilterSchema = z
  .object({
    search: optionalTrimmedString(100),
    query: optionalTrimmedString(100),
    gotra: optionalTrimmedString(100),
    kul: optionalTrimmedString(100),
    nukh: optionalTrimmedString(100),
    birth_place: optionalTrimmedString(100),
    status: z
      .enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'DECEASED'], {
        errorMap: () => ({ message: 'Invalid person status' }),
      })
      .optional(),
    verification_status: z
      .enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'], {
        errorMap: () => ({ message: 'Invalid verification status' }),
      })
      .optional(),
  })
  .strict()
  .transform((data) => ({
    search: data.search ?? data.query,
    gotra: data.gotra,
    kul: data.kul,
    nukh: data.nukh,
    birth_place: data.birth_place,
    status: data.status,
    verification_status: data.verification_status,
  }))

export type PersonDiscoveryFilterInput = z.input<typeof personDiscoveryFilterSchema>
export type PersonDiscoveryFilterOutput = z.output<typeof personDiscoveryFilterSchema>

// ---------------------------------------------------------------------------
// Family Discovery Filter Schema
// ---------------------------------------------------------------------------

export const familyDiscoveryFilterSchema = z
  .object({
    search: optionalTrimmedString(100),
    query: optionalTrimmedString(100),
    family_name: optionalTrimmedString(100),
    gotra: optionalTrimmedString(100),
    kul: optionalTrimmedString(100),
    nukh: optionalTrimmedString(100),
    city: optionalTrimmedString(100),
    state: optionalTrimmedString(100),
    country: optionalTrimmedString(100),
    status: z
      .enum(['DRAFT', 'ACTIVE', 'ARCHIVED'], {
        errorMap: () => ({ message: 'Invalid family status' }),
      })
      .optional(),
    verification_status: z
      .enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'], {
        errorMap: () => ({ message: 'Invalid verification status' }),
      })
      .optional(),
  })
  .strict()
  .transform((data) => ({
    search: data.search ?? data.query,
    family_name: data.family_name,
    gotra: data.gotra,
    kul: data.kul,
    nukh: data.nukh,
    city: data.city,
    state: data.state,
    country: data.country,
    status: data.status,
    verification_status: data.verification_status,
  }))

export type FamilyDiscoveryFilterInput = z.input<typeof familyDiscoveryFilterSchema>
export type FamilyDiscoveryFilterOutput = z.output<typeof familyDiscoveryFilterSchema>
