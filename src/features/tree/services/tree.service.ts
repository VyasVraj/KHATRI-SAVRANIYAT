/**
 * Tree service — Bounded genealogical graph traversal on public.relationships,
 * public.family_members, and public.persons.
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
 * - Synchronizes with family_members to guarantee roster and tree alignment.
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
import { buildTreeGraph, type FamilyTreeContext } from '../utils/graph-builder'

/** Untyped table reference helper for relationships */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const relationshipsTable = () => (supabase.from as any)('relationships')

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(val: string): boolean {
  return UUID_REGEX.test(val)
}

const PERSON_SELECT_COLUMNS =
  'id, first_name, middle_name, last_name, gender, dob_year, date_of_birth, birth_place, city, state, gotra, nukh, status, is_same_family'

const PERSON_FALLBACK_COLUMNS =
  'id, first_name, middle_name, last_name, gender, dob_year, date_of_birth, birth_place, gotra, nukh, status'

/**
 * Validates whether the authenticated session is authorized to view a specific family tree
 * or person-anchored tree.
 *
 * Rules:
 * - Family Creator: only their created/authorized family.
 * - Approved Claimant: only the family associated with their approved claim.
 * - Admin, Super Admin, Active Mukhi: all families.
 * - Unrelated Normal User: false (access denied).
 */
export async function checkFamilyTreeAccess(
  familyId?: string,
  personId?: string
): Promise<boolean> {
  try {
    if (familyId && isValidUuid(familyId)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('can_view_family_tree', {
        p_family_id: familyId,
      })
      if (!error && typeof data === 'boolean') {
        return data
      }
    }

    if (personId && isValidUuid(personId)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('can_view_person_tree', {
        p_person_id: personId,
      })
      if (!error && typeof data === 'boolean') {
        return data
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Fetches the bounded family tree graph centered on rootPersonId and optional family context.
 *
 * @param rootPersonId - UUID of the root person
 * @param familyId - Optional family UUID to scope the complete family hierarchy
 */
export async function getPersonTreeGraph(
  rootPersonId: string,
  familyId?: string
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

  // Explicit Family Tree Authorization Gate
  if (familyId && isValidUuid(familyId)) {
    const hasFamilyAccess = await checkFamilyTreeAccess(familyId, undefined)
    if (!hasFamilyAccess) {
      return {
        data: null,
        error: {
          message: "You do not have permission to view this family's records.",
          code: 'FORBIDDEN',
        },
      }
    }
  } else if (rootPersonId && isValidUuid(rootPersonId)) {
    const hasPersonTreeAccess = await checkFamilyTreeAccess(undefined, rootPersonId)
    if (!hasPersonTreeAccess) {
      return {
        data: null,
        error: {
          message: "You do not have permission to view this family's records.",
          code: 'FORBIDDEN',
        },
      }
    }
  }

  // 1. Fetch root person census record via community_persons (primary) or persons (fallback)
  let { data: rootPersonRow, error: rootPersonError } = await supabase
    .from('community_persons')
    .select(PERSON_SELECT_COLUMNS)
    .eq('id', rootPersonId)
    .maybeSingle()

  if (
    rootPersonError &&
    (rootPersonError.code === 'PGRST205' ||
      rootPersonError.code === '42P01' ||
      rootPersonError.code === '42703')
  ) {
    const fallback = await supabase
      .from('persons')
      .select(PERSON_FALLBACK_COLUMNS)
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

  // 2. Discover Family Roster context to synchronize the tree with the family
  const familyContext: FamilyTreeContext = {}
  const discoveredPersonIds = new Set<string>([rootPersonId])
  const discoveredRelationships = new Map<string, RelationshipRow>()

  try {
    let resolvedFamilyId = familyId

    if (!resolvedFamilyId || !isValidUuid(resolvedFamilyId)) {
      const { data: memberships } = await supabase
        .from('family_members')
        .select('family_id, is_head')
        .eq('person_id', rootPersonId)
        .is('left_at', null)
        .order('is_head', { ascending: false })
        .limit(1)

      resolvedFamilyId = memberships?.[0]?.family_id
    }

    if (resolvedFamilyId && isValidUuid(resolvedFamilyId)) {
      const hasResolvedFamilyAccess = await checkFamilyTreeAccess(resolvedFamilyId, undefined)
      if (!hasResolvedFamilyAccess) {
        return {
          data: null,
          error: {
            message: "You do not have permission to view this family's records.",
            code: 'FORBIDDEN',
          },
        }
      }

      const { data: familyRow } = await supabase
        .from('families')
        .select('id, family_name')
        .eq('id', resolvedFamilyId)
        .maybeSingle()

      const { data: memberRows } = await supabase
        .from('family_members')
        .select('id, family_id, person_id, role, is_head, relationship_to_head')
        .eq('family_id', resolvedFamilyId)
        .is('left_at', null)

      familyContext.familyId = resolvedFamilyId
      familyContext.familyName = familyRow?.family_name || 'Family'
      familyContext.totalMemberCount = memberRows?.length || 1
      familyContext.members = (memberRows ?? []).map((m) => ({
        person_id: m.person_id,
        role: m.role,
        is_head: m.is_head,
        relationship_to_head: m.relationship_to_head,
      }))

      for (const m of memberRows ?? []) {
        discoveredPersonIds.add(m.person_id)
      }
    }
  } catch {
    // Non-blocking family synchronization fallback
  }

  // 3. Query verified relationships across discovered persons
  let frontier = Array.from(discoveredPersonIds)
  const expandedPersons = new Set<string>()
  const MAX_ROUNDS = 2
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

    const { data: edgeRows, error: edgesError } = await relationshipsTable()
      .select('*')
      .or(
        currentBatch
          .map((id) => `person_a_id.eq.${id},person_b_id.eq.${id}`)
          .join(',')
      )
      .is('deleted_at', null)

    if (!edgesError && edgeRows) {
      const fetchedEdges = edgeRows as RelationshipRow[]
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
    } else {
      break
    }
  }

  // 4. Batch-fetch all discovered person profiles
  const allPersonIds = Array.from(discoveredPersonIds)
  const personsMap = new Map<string, PersonSummary>()

  if (allPersonIds.length > 0) {
    const { data: personRows, error: personsError } = await supabase
      .from('community_persons')
      .select(PERSON_SELECT_COLUMNS)
      .in('id', allPersonIds)

    let rowsList = personRows as unknown as PersonSummary[] | null
    let fetchError = personsError

    if (
      personsError &&
      (personsError.code === 'PGRST205' ||
        personsError.code === '42P01' ||
        personsError.code === '42703')
    ) {
      const fallback = await supabase
        .from('persons')
        .select(PERSON_FALLBACK_COLUMNS)
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

  // 5. Build TreeGraph using pure graph builder with family roster integration
  const treeGraph = buildTreeGraph(
    rootPerson,
    Array.from(discoveredRelationships.values()),
    personsMap,
    familyContext
  )

  return {
    data: treeGraph,
    error: null,
  }
}

export interface TreeLayoutPosition {
  person_id: string
  x: number
  y: number
}

/**
 * Loads saved visual positions for a family tree from Supabase and localStorage.
 */
export async function getFamilyTreeLayout(
  familyId?: string
): Promise<Record<string, { x: number; y: number }>> {
  if (!familyId) return {}
  const localKey = `khatri_tree_layout_${familyId}`
  let localData: Record<string, { x: number; y: number }> = {}
  try {
    const raw = localStorage.getItem(localKey)
    if (raw) localData = JSON.parse(raw)
  } catch {
    // ignore
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)('family_tree_layouts')
      .select('person_id, pos_x, pos_y')
      .eq('family_id', familyId)

    if (!error && Array.isArray(data) && data.length > 0) {
      const dbMap: Record<string, { x: number; y: number }> = {}
      for (const row of data) {
        dbMap[row.person_id] = { x: Number(row.pos_x), y: Number(row.pos_y) }
      }
      try {
        localStorage.setItem(localKey, JSON.stringify(dbMap))
      } catch {
        // ignore
      }
      return dbMap
    }
  } catch {
    // Fall back to localData
  }

  return localData
}

/**
 * Persists manual drag-and-drop coordinates for family tree nodes.
 */
export async function saveFamilyTreeLayout(
  familyId: string,
  positions: TreeLayoutPosition[] | Record<string, { x: number; y: number }>
): Promise<ApiResponse<{ success: boolean }>> {
  const posArray: TreeLayoutPosition[] = Array.isArray(positions)
    ? positions
    : Object.entries(positions).map(([person_id, pos]) => ({
        person_id,
        x: pos.x,
        y: pos.y,
      }))

  if (!familyId || posArray.length === 0) {
    return { data: { success: true }, error: null }
  }

  // 1. Immediately persist to localStorage
  const localKey = `khatri_tree_layout_${familyId}`
  try {
    const map: Record<string, { x: number; y: number }> = {}
    posArray.forEach((p) => {
      map[p.person_id] = { x: p.x, y: p.y }
    })
    localStorage.setItem(localKey, JSON.stringify(map))
  } catch {
    // ignore
  }

  // 2. Persist to Supabase
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('save_family_tree_layout', {
      p_family_id: familyId,
      p_positions: posArray,
    })
    if (error) {
      // Fallback direct upsert
      const rows = posArray.map((p) => ({
        family_id: familyId,
        person_id: p.person_id,
        pos_x: p.x,
        pos_y: p.y,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from as any)('family_tree_layouts').upsert(rows, {
        onConflict: 'family_id,person_id',
      })
    }
  } catch {
    // local storage guarantees persistence
  }

  return { data: { success: true }, error: null }
}

/**
 * Resets family tree layout back to default automatic arrangement.
 */
export async function resetFamilyTreeLayout(
  familyId: string
): Promise<ApiResponse<{ success: boolean }>> {
  if (!familyId) return { data: { success: true }, error: null }

  const localKey = `khatri_tree_layout_${familyId}`
  try {
    localStorage.removeItem(localKey)
  } catch {
    // ignore
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)('family_tree_layouts')
      .delete()
      .eq('family_id', familyId)
  } catch {
    // ignore
  }

  return { data: { success: true }, error: null }
}

/**
 * Legacy/convenience wrapper that throws on error and returns TreeGraph directly.
 * Maintained for unit tests and direct callers.
 */
export async function fetchFamilyTreeGraph(
  rootPersonId: string,
  familyId?: string
): Promise<TreeGraph> {
  const result = await getPersonTreeGraph(rootPersonId, familyId)
  if (result.error) {
    throw new Error(result.error.message)
  }
  return result.data!
}

