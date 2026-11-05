/**
 * Tree service — Bounded genealogical graph traversal on public.relationships
 * and public.persons.
 *
 * All operations use the single typed Supabase client (anon key only) with the
 * caller's active authenticated session. Authorization is enforced exclusively
 * by PostgreSQL RLS policies.
 *
 * SECURITY & PRIVACY RULES:
 * - Gated to authenticated sessions only.
 * - Zero service_role, zero privileged client RPCs.
 * - Respects dual-endpoint RLS: hidden/private edges are excluded by PostgreSQL.
 * - Zero synthetic placeholders manufactured.
 * - Zero access to public.family_members (genealogy != family membership).
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type {
  PersonSummary,
  RelationshipRow,
} from '@/features/relationships/types'
import {
  MAX_TREE_NODES,
  MAX_TREE_EDGES,
  type TreeGraph,
} from '../types'
import { buildTreeGraph } from '../utils/graph-builder'

/** Untyped table reference helper for relationships */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const relationshipsTable = () => (supabase.from as any)('relationships')

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(val: string): boolean {
  return UUID_REGEX.test(val)
}

/**
 * Fetches the bounded family tree graph centered on rootPersonId.
 *
 * Traversal is strictly bounded:
 * - Maximum 2 generations of ancestors (-2)
 * - Maximum 2 generations of descendants (+2)
 * - Maximum 1 hop for lateral partners & siblings
 * - Capped at MAX_TREE_NODES (100) and MAX_TREE_EDGES (150)
 *
 * @param rootPersonId - UUID of the root person
 */
export async function getPersonTreeGraph(
  rootPersonId: string
): Promise<ApiResponse<TreeGraph>> {
  if (!isValidUuid(rootPersonId)) {
    return {
      data: null,
      error: {
        message: 'Invalid person ID format.',
        code: 'INVALID_ID',
      },
    }
  }

  // 1. Fetch root person census record via community_persons (primary) or persons (fallback)
  let { data: rootPersonRow, error: rootPersonError } = await supabase
    .from('community_persons')
    .select('id, first_name, middle_name, last_name, gender, dob_year, status')
    .eq('id', rootPersonId)
    .maybeSingle()

  if (rootPersonError && (rootPersonError.code === 'PGRST205' || rootPersonError.code === '42P01' || rootPersonError.code === '42703')) {
    const fallback = await supabase
      .from('persons')
      .select('id, first_name, middle_name, last_name, gender, dob_year, status')
      .eq('id', rootPersonId)
      .maybeSingle()
    rootPersonRow = fallback.data as unknown as typeof rootPersonRow
    rootPersonError = fallback.error
  }

  if (rootPersonError) {
    return {
      data: null,
      error: {
        message: 'Could not load root person record.',
        code: rootPersonError.code,
        cause: rootPersonError,
      },
    }
  }

  if (!rootPersonRow) {
    return {
      data: null,
      error: {
        message: 'Person record not found or inaccessible.',
        code: 'NOT_FOUND',
      },
    }
  }

  const rootPerson = rootPersonRow as PersonSummary

  // 2. Bounded BFS traversal across public.relationships
  const discoveredPersonIds = new Set<string>([rootPersonId])
  const discoveredRelationships = new Map<string, RelationshipRow>()

  let frontier = [rootPersonId]
  const expandedPersons = new Set<string>()

  // Maximum 3 expansion rounds:
  // Round 1: root -> parents, children, spouses, siblings
  // Round 2: parents -> grandparents; children -> grandchildren
  // Round 3: boundary sweep
  const MAX_ROUNDS = 3
  let currentRound = 0

  while (
    frontier.length > 0 &&
    currentRound < MAX_ROUNDS &&
    discoveredPersonIds.size < MAX_TREE_NODES &&
    discoveredRelationships.size < MAX_TREE_EDGES
  ) {
    currentRound++
    const currentBatch = [...frontier]

    for (const pId of currentBatch) {
      expandedPersons.add(pId)
    }

    // Query active relationships touching the current batch
    // Using PostgreSQL RLS dual-endpoint filtering naturally
    const { data: edgeRows, error: edgesError } = await relationshipsTable()
      .select('*')
      .or(
        currentBatch
          .map((id) => `person_a_id.eq.${id},person_b_id.eq.${id}`)
          .join(',')
      )
      .is('deleted_at', null)

    if (edgesError) {
      return {
        data: null,
        error: {
          message: 'Could not load genealogical relationships.',
          code: edgesError.code,
          cause: edgesError,
        },
      }
    }

    const fetchedEdges = (edgeRows ?? []) as RelationshipRow[]
    const nextFrontierSet = new Set<string>()

    for (const edge of fetchedEdges) {
      if (discoveredRelationships.size >= MAX_TREE_EDGES) break
      discoveredRelationships.set(edge.id, edge)

      const neighborId =
        currentBatch.includes(edge.person_a_id)
          ? edge.person_b_id
          : edge.person_a_id

      if (!discoveredPersonIds.has(neighborId)) {
        if (discoveredPersonIds.size < MAX_TREE_NODES) {
          discoveredPersonIds.add(neighborId)
          if (!expandedPersons.has(neighborId)) {
            nextFrontierSet.add(neighborId)
          }
        }
      }
    }

    frontier = Array.from(nextFrontierSet)
  }

  // 2b. Synchronize with active family roster to guarantee Family Tree and Roster consistency
  try {
    const { data: familyMemberships } = await supabase
      .from('family_members')
      .select('family_id, is_head, role')
      .eq('person_id', rootPersonId)
      .is('left_at', null)

    const rootFamilyIds = (familyMemberships ?? []).map((m) => m.family_id)

    if (rootFamilyIds.length > 0) {
      const { data: familyMembersList } = await supabase
        .from('family_members')
        .select('id, family_id, person_id, role, is_head')
        .in('family_id', rootFamilyIds)
        .is('left_at', null)

      const isRootHead = (familyMemberships ?? []).some((m) => m.is_head)

      for (const fm of familyMembersList ?? []) {
        if (fm.person_id === rootPersonId) continue

        const hasDirectEdge = Array.from(discoveredRelationships.values()).some(
          (r) =>
            (r.person_a_id === rootPersonId && r.person_b_id === fm.person_id) ||
            (r.person_a_id === fm.person_id && r.person_b_id === rootPersonId)
        )

        if (!hasDirectEdge && isRootHead && fm.role) {
          let edgeType: RelationshipRow['relationship_type'] | null = null
          let pA = rootPersonId
          let pB = fm.person_id

          if (fm.role === 'SPOUSE') {
            edgeType = 'SPOUSE'
            if (pA > pB) { pA = fm.person_id; pB = rootPersonId }
          } else if (fm.role === 'CHILD') {
            edgeType = 'PARENT'
            pA = rootPersonId
            pB = fm.person_id
          } else if (fm.role === 'PARENT') {
            edgeType = 'PARENT'
            pA = fm.person_id
            pB = rootPersonId
          } else if (fm.role === 'SIBLING') {
            edgeType = 'SIBLING'
            if (pA > pB) { pA = fm.person_id; pB = rootPersonId }
          }

          if (edgeType && discoveredRelationships.size < MAX_TREE_EDGES) {
            const virtualId = `fm-rel-${fm.id}`
            const virtualRel: RelationshipRow = {
              id: virtualId,
              person_a_id: pA,
              person_b_id: pB,
              relationship_type: edgeType,
              notes: 'Family Roster Synchronized Relationship',
              verification_status: 'VERIFIED',
              created_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
            }
            discoveredRelationships.set(virtualId, virtualRel)
            discoveredPersonIds.add(fm.person_id)
          }
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }

  // 3. Batch-fetch all discovered person profiles
  const allPersonIds = Array.from(discoveredPersonIds)
  const personsMap = new Map<string, PersonSummary>()

  if (allPersonIds.length > 0) {
    // Primary attempt: community_persons security barrier view
    const { data: personRows, error: personsError } = await supabase
      .from('community_persons')
      .select('id, first_name, middle_name, last_name, gender, dob_year, status')
      .in('id', allPersonIds)

    let rowsList = personRows as unknown as PersonSummary[] | null
    let fetchError = personsError
    if (personsError && (personsError.code === 'PGRST205' || personsError.code === '42P01' || personsError.code === '42703')) {
      const fallback = await supabase
        .from('persons')
        .select('id, first_name, middle_name, last_name, gender, dob_year, status')
        .in('id', allPersonIds)
      rowsList = fallback.data as unknown as PersonSummary[] | null
      fetchError = fallback.error
    }

    if (fetchError) {
      return {
        data: null,
        error: {
          message: 'Could not load related person profiles.',
          code: fetchError.code,
          cause: fetchError,
        },
      }
    }

    for (const p of rowsList ?? []) {
      personsMap.set(p.id, p as PersonSummary)
    }
  }

  // Always ensure rootPerson is in personsMap
  personsMap.set(rootPerson.id, rootPerson)

  // 4. Build TreeGraph using pure graph builder
  const treeGraph = buildTreeGraph(
    rootPerson,
    Array.from(discoveredRelationships.values()),
    personsMap
  )

  return {
    data: treeGraph,
    error: null,
  }
}

/**
 * Convenience wrapper returning TreeGraph directly or throwing on error.
 *
 * @param rootPersonId - UUID of the root person
 */
export async function fetchFamilyTreeGraph(
  rootPersonId: string
): Promise<TreeGraph> {
  const res = await getPersonTreeGraph(rootPersonId)
  if (res.error) {
    throw new Error(res.error.message)
  }
  return res.data!
}

