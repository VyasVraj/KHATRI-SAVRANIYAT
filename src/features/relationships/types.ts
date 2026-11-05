/**
 * Feature Types: Relationships Domain
 *
 * Interpersonal relationships connecting public.persons records (PARENT, SPOUSE, SIBLING).
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. PERSON != USER:
 *    Relationships link human census entities (public.persons), not auth.users accounts.
 * 2. DIRECTIONAL SEMANTICS:
 *    - PARENT: person_a_id = Parent, person_b_id = Child. Reciprocal CHILD rows are never stored.
 *    - SPOUSE: Symmetric canonical edge enforcing person_a_id < person_b_id.
 *    - SIBLING: Explicit canonical edge directly asserted (person_a_id < person_b_id).
 * 3. SOFT DELETION:
 *    - deleted_at TIMESTAMPTZ indicates logically departed or ended relationships.
 */

import type { Database } from '@/types/database.types'

/** Valid canonical relationship types */
export type RelationshipType = 'PARENT' | 'SPOUSE' | 'SIBLING'

/** Array of valid relationship types for validation & iterators */
export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  'PARENT',
  'SPOUSE',
  'SIBLING',
] as const

/** Human-readable relationship labels */
export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  PARENT: 'Parent',
  SPOUSE: 'Spouse',
  SIBLING: 'Sibling',
} as const

/** Verification status from core platform enums */
export type VerificationStatus =
  Database['public']['Enums']['verification_status']

/** Base person row from database or community view */
export type PersonSummary = Pick<
  Database['public']['Tables']['persons']['Row'],
  | 'id'
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'gender'
  | 'status'
> & {
  date_of_birth?: string | null
  dob_year?: number | null
  profile_privacy?: Database['public']['Enums']['privacy_level']
}

/** Canonical relationship row representation matching public.relationships */
export interface RelationshipRow {
  id: string
  person_a_id: string
  person_b_id: string
  relationship_type: RelationshipType
  notes: string | null
  verification_status: VerificationStatus
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Relationship row joined with both endpoint person records */
export interface RelationshipWithEndpoints extends RelationshipRow {
  person_a: PersonSummary | null
  person_b: PersonSummary | null
}

/** Directional role relative to a specific target person */
export type PersonRelativeRole =
  | 'parent'   // target person is child, other person is parent
  | 'child'    // target person is parent, other person is child
  | 'spouse'   // target person is spouse, other person is spouse
  | 'sibling'  // target person is sibling, other person is sibling

/** Contextual relationship item resolved from the perspective of a specific person */
export interface PersonRelationshipItem {
  /** The underlying database relationship row */
  relationship: RelationshipRow
  /** The other person in the relationship */
  relatedPerson: PersonSummary | null
  /** Role of the related person from the target person's perspective */
  role: PersonRelativeRole
}

/** Structured interpersonal relationships grouped for a target person */
export interface PersonRelationshipsSummary {
  /** Target person ID */
  personId: string
  /** Parents of the target person (where other is person_a and type is PARENT) */
  parents: PersonRelationshipItem[]
  /** Children of the target person (where target is person_a and type is PARENT) */
  children: PersonRelationshipItem[]
  /** Spouses of the target person */
  spouses: PersonRelationshipItem[]
  /** Explicit siblings of the target person */
  siblings: PersonRelationshipItem[]
  /** All active relationships combined */
  all: PersonRelationshipItem[]
}

/** Options for listing person relationships */
export interface ListPersonRelationshipsOptions {
  /** If true, includes soft-deleted relationships (deleted_at IS NOT NULL) */
  includeSoftDeleted?: boolean
  /** Filter to a specific relationship type */
  type?: RelationshipType
}
