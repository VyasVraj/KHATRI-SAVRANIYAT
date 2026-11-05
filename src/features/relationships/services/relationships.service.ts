/**
 * Relationships service — CRUD and graph traversal on public.relationships
 *
 * All operations use the single typed Supabase client (anon key only).
 * Authorization is enforced exclusively by PostgreSQL RLS policies.
 *
 * SECURITY & INTEGRITY RULES:
 * - Never accept `created_by` from client input; injected from authenticated session.
 * - PERSON != USER: `person_a_id` and `person_b_id` refer to public.persons records.
 * - Directional PARENT: person_a_id = parent, person_b_id = child.
 * - Canonical Symmetric: SPOUSE and SIBLING enforce person_a_id < person_b_id.
 * - Soft deletion only: `softDeleteRelationship` sets `deleted_at = NOW()`.
 * - Ancestry cycle prevention: prevents obvious ancestry loops (A -> B -> ... -> A).
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import {
  createRelationshipSchema,
  updateRelationshipSchema,
  type CreateRelationshipInput,
  type UpdateRelationshipInput,
} from '../schemas/relationships.schema'
import type {
  RelationshipRow,
  RelationshipType,
  RelationshipWithEndpoints,
  PersonRelationshipsSummary,
  PersonRelationshipItem,
  PersonSummary,
  ListPersonRelationshipsOptions,
} from '../types'
import { ZodError } from 'zod'

/** Untyped table reference helper until remote codegen incorporates relationships */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const relationshipsTable = () => (supabase.from as any)('relationships')

/**
 * Canonicalizes relationship endpoints according to database and schema invariants:
 * - Symmetric relationships (SPOUSE, SIBLING) enforce alphabetical ordering: person_a_id < person_b_id.
 * - Directional relationships (PARENT) preserve exact direction: person_a_id = Parent, person_b_id = Child.
 */
export function canonicalizeRelationshipEndpoints(
  personAId: string,
  personBId: string,
  relationshipType: RelationshipType
): { person_a_id: string; person_b_id: string } {
  if (relationshipType === 'SPOUSE' || relationshipType === 'SIBLING') {
    return personAId < personBId
      ? { person_a_id: personAId, person_b_id: personBId }
      : { person_a_id: personBId, person_b_id: personAId }
  }
  return { person_a_id: personAId, person_b_id: personBId }
}

// ---------------------------------------------------------------------------
// createRelationship
// ---------------------------------------------------------------------------

/**
 * Creates an interpersonal relationship between two census persons.
 *
 * Enforces:
 * - Input validation & strict protected-field rejection
 * - Disallow self-referential relationships
 * - Canonical ordering for SPOUSE and SIBLING (person_a_id < person_b_id)
 * - Ancestry cycle detection for PARENT relationships
 * - Provenance tracking via authenticated caller userId
 *
 * @param input - Validated relationship data (person_a_id, person_b_id, relationship_type, notes)
 * @param callerUserId - The authenticated user's UUID (from auth.uid())
 */
export async function createRelationship(
  input: CreateRelationshipInput,
  callerUserId: string
): Promise<ApiResponse<RelationshipRow>> {
  if (!isValidUuid(callerUserId)) {
    return {
      data: null,
      error: {
        message: 'A valid authenticated session is required to record a relationship.',
        code: 'UNAUTHENTICATED',
      },
    }
  }

  const parseResult = createRelationshipSchema.safeParse(input)
  if (!parseResult.success) {
    return {
      data: null,
      error: {
        message: formatZodError(parseResult.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const validated = parseResult.data

  // Prevent ancestry cycles when creating PARENT relationships (A is parent of B)
  if (validated.relationship_type === 'PARENT') {
    const hasCycle = await detectAncestryCycle(
      validated.person_a_id,
      validated.person_b_id
    )
    if (hasCycle) {
      return {
        data: null,
        error: {
          message:
            'Cannot create relationship: this would create an ancestry cycle (descendant cannot be ancestor of their parent).',
          code: 'ANCESTRY_CYCLE_DETECTED',
        },
      }
    }
  }

  // Pre-check for duplicate active relationship
  const { data: existingActive } = await relationshipsTable()
    .select('id')
    .eq('person_a_id', validated.person_a_id)
    .eq('person_b_id', validated.person_b_id)
    .eq('relationship_type', validated.relationship_type)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingActive) {
    return {
      data: null,
      error: {
        message: 'An active relationship of this type already exists between these persons.',
        code: 'DUPLICATE_RELATIONSHIP',
      },
    }
  }

  const { data, error } = await relationshipsTable()
    .insert({
      person_a_id: validated.person_a_id,
      person_b_id: validated.person_b_id,
      relationship_type: validated.relationship_type,
      notes: validated.notes ?? null,
      created_by: callerUserId,
    })
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapRelationshipError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: data as RelationshipRow, error: null }
}

// ---------------------------------------------------------------------------
// listPersonRelationships
// ---------------------------------------------------------------------------

/**
 * Retrieves all relationships connected to a specific person and resolves
 * directional roles relative to that person (e.g., Parent A -> Child B).
 *
 * @param personId - Target person UUID
 * @param options - Optional query filters (includeSoftDeleted, type)
 */
export async function listPersonRelationships(
  personId: string,
  options?: ListPersonRelationshipsOptions
): Promise<ApiResponse<PersonRelationshipsSummary>> {
  if (!isValidUuid(personId)) {
    return {
      data: null,
      error: {
        message: 'Invalid person ID format.',
        code: 'INVALID_ID',
      },
    }
  }

  let query = relationshipsTable()
    .select('*')
    .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`)

  if (!options?.includeSoftDeleted) {
    query = query.is('deleted_at', null)
  }

  if (options?.type) {
    query = query.eq('relationship_type', options.type)
  }

  const { data: rows, error } = await query

  if (error) {
    return {
      data: null,
      error: {
        message: mapRelationshipError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  const relationships = (rows ?? []) as RelationshipRow[]

  // Collect unique endpoint IDs for person metadata lookup
  const relatedPersonIds = Array.from(
    new Set(
      relationships.map((r) =>
        r.person_a_id === personId ? r.person_b_id : r.person_a_id
      )
    )
  )

  let personsMap = new Map<string, PersonSummary>()
  if (relatedPersonIds.length > 0) {
    // Primary attempt: community_persons security barrier view
    const { data: personRows, error: viewError } = await supabase
      .from('community_persons')
      .select('id, first_name, middle_name, last_name, gender, dob_year, status')
      .in('id', relatedPersonIds)

    let rowsList = personRows as unknown as PersonSummary[] | null
    // Fallback to persons if view not yet deployed
    if (viewError && (viewError.code === 'PGRST205' || viewError.code === '42P01' || viewError.code === '42703')) {
      const fallback = await supabase
        .from('persons')
        .select('id, first_name, middle_name, last_name, gender, dob_year, status')
        .in('id', relatedPersonIds)
      rowsList = fallback.data as unknown as PersonSummary[] | null
    }

    if (rowsList) {
      personsMap = new Map(rowsList.map((p) => [p.id, p as PersonSummary]))
    }
  }

  // Project and categorize relationships from the perspective of target person
  const parents: PersonRelationshipItem[] = []
  const children: PersonRelationshipItem[] = []
  const spouses: PersonRelationshipItem[] = []
  const siblings: PersonRelationshipItem[] = []
  const all: PersonRelationshipItem[] = []

  for (const rel of relationships) {
    const isPersonA = rel.person_a_id === personId
    const otherPersonId = isPersonA ? rel.person_b_id : rel.person_a_id
    const relatedPerson = personsMap.get(otherPersonId) ?? null

    let role: PersonRelationshipItem['role']

    if (rel.relationship_type === 'PARENT') {
      // If personId is person_a_id, they are the parent, so other person is their child
      // If personId is person_b_id, they are the child, so other person is their parent
      role = isPersonA ? 'child' : 'parent'
    } else if (rel.relationship_type === 'SPOUSE') {
      role = 'spouse'
    } else {
      role = 'sibling'
    }

    const item: PersonRelationshipItem = {
      relationship: rel,
      relatedPerson,
      role,
    }

    all.push(item)

    if (role === 'parent') parents.push(item)
    else if (role === 'child') children.push(item)
    else if (role === 'spouse') spouses.push(item)
    else if (role === 'sibling') siblings.push(item)
  }

  return {
    data: {
      personId,
      parents,
      children,
      spouses,
      siblings,
      all,
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// getRelationship
// ---------------------------------------------------------------------------

/**
 * Retrieves a single relationship row by ID with both endpoint person details.
 *
 * @param id - Relationship UUID
 */
export async function getRelationship(
  id: string
): Promise<ApiResponse<RelationshipWithEndpoints>> {
  if (!isValidUuid(id)) {
    return {
      data: null,
      error: {
        message: 'Invalid relationship ID format.',
        code: 'INVALID_ID',
      },
    }
  }

  const { data: row, error } = await relationshipsTable()
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapRelationshipError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  const relationship = row as RelationshipRow

  // Fetch endpoint persons via community_persons (primary) or persons (fallback)
  const { data: persons, error: personsError } = await supabase
    .from('community_persons')
    .select('id, first_name, middle_name, last_name, gender, dob_year, status')
    .in('id', [relationship.person_a_id, relationship.person_b_id])

  let personsList = persons as unknown as PersonSummary[] | null
  if (personsError && (personsError.code === 'PGRST205' || personsError.code === '42P01' || personsError.code === '42703')) {
    const fallback = await supabase
      .from('persons')
      .select('id, first_name, middle_name, last_name, gender, dob_year, status')
      .in('id', [relationship.person_a_id, relationship.person_b_id])
    personsList = fallback.data as unknown as PersonSummary[] | null
  }

  const personMap = new Map((personsList ?? []).map((p) => [p.id, p as PersonSummary]))

  return {
    data: {
      ...relationship,
      person_a: personMap.get(relationship.person_a_id) ?? null,
      person_b: personMap.get(relationship.person_b_id) ?? null,
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// updateRelationship
// ---------------------------------------------------------------------------

/**
 * Updates mutable fields (notes) of an existing relationship record.
 * Protects endpoints, type, created_by, and deleted_at from arbitrary client tampering.
 *
 * @param id - Relationship UUID
 * @param input - Mutable attributes to update
 * @param callerUserId - Authenticated user ID
 */
export async function updateRelationship(
  id: string,
  input: UpdateRelationshipInput,
  callerUserId: string
): Promise<ApiResponse<RelationshipRow>> {
  if (!isValidUuid(id)) {
    return {
      data: null,
      error: {
        message: 'Invalid relationship ID format.',
        code: 'INVALID_ID',
      },
    }
  }

  if (!isValidUuid(callerUserId)) {
    return {
      data: null,
      error: {
        message: 'A valid authenticated session is required to update a relationship.',
        code: 'UNAUTHENTICATED',
      },
    }
  }

  const parseResult = updateRelationshipSchema.safeParse(input)
  if (!parseResult.success) {
    return {
      data: null,
      error: {
        message: formatZodError(parseResult.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const validated = parseResult.data

  const { data, error } = await relationshipsTable()
    .update({
      notes: validated.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapRelationshipError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: data as RelationshipRow, error: null }
}

// ---------------------------------------------------------------------------
// softDeleteRelationship
// ---------------------------------------------------------------------------

/**
 * Logically soft-deletes a relationship record by setting `deleted_at = NOW()`.
 * Preserves historical continuity without permanent physical deletion.
 *
 * Enforced at database level by:
 * - `relationships_soft_delete_creator`: permits UPDATE of `deleted_at` by creator.
 * - `relationships_delete_admin`: blocks physical DELETE for non-moderators.
 *
 * NOTE: Does not request `.select().single()` on the update because active
 * RLS SELECT policies exclude soft-deleted records (deleted_at IS NULL).
 *
 * @param id - Relationship UUID
 * @param callerUserId - Authenticated user ID
 */
export async function softDeleteRelationship(
  id: string,
  callerUserId: string
): Promise<ApiResponse<void>> {
  if (!isValidUuid(id)) {
    return {
      data: null,
      error: {
        message: 'Invalid relationship ID format.',
        code: 'INVALID_ID',
      },
    }
  }

  if (!isValidUuid(callerUserId)) {
    return {
      data: null,
      error: {
        message: 'A valid authenticated session is required to delete a relationship.',
        code: 'UNAUTHENTICATED',
      },
    }
  }

  const { error } = await relationshipsTable()
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    return {
      data: null,
      error: {
        message: mapRelationshipError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: undefined, error: null }
}

// ---------------------------------------------------------------------------
// Helpers: Ancestry Cycle Detection
// ---------------------------------------------------------------------------

/**
 * Traverses parentage upwards from `parentId` to verify that `childId` is not
 * already an ancestor of `parentId`.
 *
 * Limits traversal depth to 10 generations to guarantee finite execution.
 *
 * Known limitation: Detects cycles within accessible graph nodes. If intermediate
 * ancestor nodes are hidden by RLS policies from the current caller, cycles
 * across hidden private nodes cannot be detected client-side.
 */
async function detectAncestryCycle(
  parentId: string,
  childId: string,
  maxDepth = 10
): Promise<boolean> {
  const visited = new Set<string>()
  const queue: Array<{ id: string; depth: number }> = [{ id: parentId, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.id === childId) {
      return true // Cycle detected: childId is an ancestor of parentId
    }

    if (current.depth >= maxDepth || visited.has(current.id)) {
      continue
    }

    visited.add(current.id)

    // Find all parents of current person (where current person is person_b_id and type is PARENT)
    const { data: parentEdges } = await relationshipsTable()
      .select('person_a_id')
      .eq('person_b_id', current.id)
      .eq('relationship_type', 'PARENT')
      .is('deleted_at', null)

    if (parentEdges && parentEdges.length > 0) {
      for (const edge of parentEdges) {
        queue.push({
          id: (edge as { person_a_id: string }).person_a_id,
          depth: current.depth + 1,
        })
      }
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Helpers: Error Mapping & Validation
// ---------------------------------------------------------------------------

/**
 * Maps raw Supabase / PostgreSQL error codes and messages to user-friendly text.
 */
function mapRelationshipError(message: string, code?: string): string {
  if (code === '42501') {
    return 'Permission denied: you do not have permission to view or manage this relationship.'
  }
  if (code === '23505') {
    return 'An active relationship of this type already exists between these persons.'
  }
  if (code === '23503') {
    return 'One or both specified persons do not exist.'
  }
  if (code === '23514') {
    const lower = message.toLowerCase()
    if (lower.includes('no_self_reference')) {
      return 'A person cannot have a relationship with themselves.'
    }
    if (lower.includes('symmetric_ordering')) {
      return 'Symmetric relationships (SPOUSE, SIBLING) must be ordered canonically.'
    }
    return 'The relationship violates database integrity constraints.'
  }
  if (code === 'PGRST116') {
    return 'Relationship record not found.'
  }
  const lower = message.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  return 'Something went wrong while managing the relationship. Please try again.'
}

/** Formats Zod validation issues into a single descriptive string */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => issue.message)
    .filter((msg, idx, arr) => arr.indexOf(msg) === idx)
    .join('; ')
}

/** Checks for standard UUID format */
function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  )
}
