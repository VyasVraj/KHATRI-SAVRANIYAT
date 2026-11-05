/**
 * Discovery domain types
 *
 * Defines directory-safe projections and pagination structures for the
 * Community Discovery feature (Phase 6).
 *
 * SECURITY & PRIVACY INVARIANTS:
 * - Contact fields (phone, email_contact, phone_secondary) are strictly excluded from directory summaries.
 * - Internal identifiers and timestamps (user_id, created_by, created_at, updated_at, deleted_at) are excluded.
 * - PERSON != USER: Exposes human census profiles, never authentication identities.
 * - FAMILY != HOUSEHOLD: Exposes social family units, not physical residence addresses.
 */

import type { Database } from '@/types/database.types'

export type Gender = Database['public']['Enums']['gender']
export type PersonStatus = Database['public']['Enums']['person_status']
export type FamilyStatus = Database['public']['Enums']['family_status']
export type VerificationStatus = Database['public']['Enums']['verification_status']
export type PrivacyLevel = Database['public']['Enums']['privacy_level']

// ---------------------------------------------------------------------------
// Pagination Contract (Fetch N+1)
// ---------------------------------------------------------------------------

/** Pagination request parameters */
export interface DiscoveryPagination {
  page: number
  pageSize: number
}

/** Paginated directory page result (Fetch N+1 contract) */
export interface DiscoveryPage<T> {
  items: T[]
  page: number
  pageSize: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// ---------------------------------------------------------------------------
// Person Discovery Types
// ---------------------------------------------------------------------------

/** Validated filter parameters for person discovery */
export interface PersonDiscoveryFilters {
  search?: string
  gotra?: string
  kul?: string
  nukh?: string
  birth_place?: string
  status?: PersonStatus
  verification_status?: VerificationStatus
}

/** Directory-safe projection for a person census record */
export interface PersonDiscoveryResult {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string
  maiden_name: string | null
  gender: Gender | null
  date_of_birth: string | null
  dob_year?: number | null
  age?: number | null
  city?: string | null
  state?: string | null
  date_of_death: string | null
  birth_place: string | null
  gotra: string | null
  kul: string | null
  nukh: string | null
  status: PersonStatus
  verification_status: VerificationStatus
  profile_privacy?: PrivacyLevel
}

// ---------------------------------------------------------------------------
// Family Discovery Types
// ---------------------------------------------------------------------------

/** Validated filter parameters for family discovery */
export interface FamilyDiscoveryFilters {
  search?: string
  family_name?: string
  gotra?: string
  kul?: string
  nukh?: string
  city?: string
  state?: string
  country?: string
  status?: FamilyStatus
  verification_status?: VerificationStatus
}

/** Directory-safe projection for a family social unit */
export interface FamilyDiscoveryResult {
  id: string
  family_name: string
  description: string | null
  gotra: string | null
  kul: string | null
  nukh: string | null
  city: string | null
  state: string | null
  country: string | null
  status: FamilyStatus
  verification_status: VerificationStatus
  profile_privacy: PrivacyLevel
  members_privacy: PrivacyLevel
}

// ---------------------------------------------------------------------------
// Discovery Filter Options
// ---------------------------------------------------------------------------

/** Distinct filter options for directory dropdowns */
export interface DiscoveryFilterOptions {
  gotras: string[]
  nukhs: string[]
  kuls: string[]
  cities: string[]
  states: string[]
}
