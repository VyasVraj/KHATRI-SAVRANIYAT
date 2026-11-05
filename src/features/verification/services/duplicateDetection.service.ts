/**
 * Duplicate Detection Service (Phase 9 — Subtask 4)
 *
 * CRITICAL ARCHITECTURAL PRINCIPLES:
 * 1. DETECT != MERGE:
 *    - Identifying potential duplicates NEVER mutates, merges, reassigns, or deletes records.
 * 2. PERSON != USER:
 *    - Duplicate detection inspects person census attributes, never modifying auth or user links.
 * 3. EXPLAINABILITY:
 *    - Every candidate must clearly list both match signals and differing signals.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse, PersonRow, FamilyRow } from '@/types'
import type {
  DuplicateCandidate,
  DuplicateConfidence,
  DuplicateFlagRow,
  EnrichedDuplicateFlag,
  FlagDuplicateInput,
  ResolveDuplicateInput,
  DuplicateFlagsFilter,
} from '../types/duplicate.types'

/**
 * Normalizes string for fuzzy/case-insensitive comparison.
 */
function normalize(str: string | null | undefined): string {
  return (str ?? '').trim().toLowerCase()
}

/**
 * Calculates candidate duplicate matches for a census Person record.
 * Pure deterministic comparison against a candidate pool.
 */
export function findPersonDuplicateCandidates(
  target: Partial<PersonRow>,
  pool: PersonRow[]
): DuplicateCandidate<PersonRow>[] {
  if (!target || !target.id) return []

  const targetFirstName = normalize(target.first_name)
  const targetLastName = normalize(target.last_name)
  const targetFullName = `${targetFirstName} ${targetLastName}`.trim()
  const targetDob = target.date_of_birth ? target.date_of_birth.split('T')[0] : null
  const targetGender = target.gender
  const targetGotra = normalize(target.gotra)
  const targetNukh = normalize(target.nukh)
  const targetBirthPlace = normalize(target.birth_place)
  const targetPhone = normalize(target.phone)

  const candidates: DuplicateCandidate<PersonRow>[] = []

  for (const candidate of pool) {
    // 1. Same record exclusion
    if (candidate.id === target.id) continue

    // 2. Exclude soft-deleted or inactive records
    if (candidate.deleted_at || candidate.status === 'ARCHIVED') continue

    const candFirstName = normalize(candidate.first_name)
    const candLastName = normalize(candidate.last_name)
    const candFullName = `${candFirstName} ${candLastName}`.trim()
    const candDob = candidate.date_of_birth ? candidate.date_of_birth.split('T')[0] : null
    const candGender = candidate.gender
    const candGotra = normalize(candidate.gotra)
    const candNukh = normalize(candidate.nukh)
    const candBirthPlace = normalize(candidate.birth_place)
    const candPhone = normalize(candidate.phone)

    const matchSignals: string[] = []
    const differingSignals: string[] = []
    let score = 0

    // Compare Names
    if (targetFullName && candFullName && targetFullName === candFullName) {
      score += 40
      matchSignals.push('Identical full name')
    } else if (
      targetFirstName &&
      candFirstName &&
      targetFirstName === candFirstName &&
      targetLastName &&
      candLastName &&
      targetLastName === candLastName
    ) {
      score += 40
      matchSignals.push('Matching first and last names')
    } else if (targetLastName && candLastName && targetLastName === candLastName) {
      score += 10
      matchSignals.push('Matching surname / last name')
    } else {
      differingSignals.push('Different names')
    }

    // Compare Date of Birth
    if (targetDob && candDob) {
      if (targetDob === candDob) {
        score += 35
        matchSignals.push(`Identical birth date (${targetDob})`)
      } else {
        const targetYear = parseInt(targetDob.split('-')[0], 10)
        const candYear = parseInt(candDob.split('-')[0], 10)
        if (Math.abs(targetYear - candYear) <= 1) {
          score += 15
          matchSignals.push('Birth year within 1 year')
        } else {
          differingSignals.push(`Conflicting birth dates (${targetDob} vs ${candDob})`)
          score = Math.max(0, score - 20)
        }
      }
    }

    // Compare Gender
    if (targetGender && candGender) {
      if (targetGender === candGender) {
        score += 10
        matchSignals.push(`Matching gender (${targetGender})`)
      } else {
        differingSignals.push(`Conflicting gender (${targetGender} vs ${candGender})`)
        score = Math.max(0, score - 30)
      }
    }

    // Compare Cultural Identity (Gotra & Nukh)
    if (targetGotra && candGotra && targetGotra === candGotra) {
      score += 15
      matchSignals.push(`Matching Gotra (${target.gotra})`)
    } else if (targetGotra && candGotra && targetGotra !== candGotra) {
      differingSignals.push('Different Gotra')
      score = Math.max(0, score - 15)
    }

    if (targetNukh && candNukh && targetNukh === candNukh) {
      score += 15
      matchSignals.push(`Matching Nukh (${target.nukh})`)
    }

    // Compare Birth Place
    if (targetBirthPlace && candBirthPlace && targetBirthPlace === candBirthPlace) {
      score += 15
      matchSignals.push(`Matching birth place (${candidate.birth_place})`)
    }

    // Compare Phone
    if (targetPhone && candPhone && targetPhone === candPhone) {
      score += 30
      matchSignals.push('Identical contact phone number')
    }

    // Cap score at 100
    const finalScore = Math.min(100, Math.max(0, score))

    // Determine confidence tier
    let confidence: DuplicateConfidence | null = null
    if (finalScore >= 75) {
      confidence = 'STRONG'
    } else if (finalScore >= 45) {
      confidence = 'POSSIBLE'
    } else if (finalScore >= 25 && matchSignals.length >= 2) {
      confidence = 'WEAK'
    }

    if (confidence) {
      candidates.push({
        targetRecordId: target.id,
        candidate,
        confidence,
        score: finalScore,
        matchSignals,
        differingSignals,
      })
    }
  }

  // Sort by score descending
  return candidates.sort((a, b) => b.score - a.score)
}

/**
 * Calculates candidate duplicate matches for a Family record.
 * Pure deterministic comparison against a candidate pool.
 */
export function findFamilyDuplicateCandidates(
  target: Partial<FamilyRow>,
  pool: FamilyRow[]
): DuplicateCandidate<FamilyRow>[] {
  if (!target || !target.id) return []

  const targetName = normalize(target.family_name)
  const targetGotra = normalize(target.gotra)
  const targetNukh = normalize(target.nukh)
  const targetCity = normalize(target.city)
  const targetState = normalize(target.state)

  const candidates: DuplicateCandidate<FamilyRow>[] = []

  for (const candidate of pool) {
    if (candidate.id === target.id || candidate.deleted_at) continue

    const candName = normalize(candidate.family_name)
    const candGotra = normalize(candidate.gotra)
    const candNukh = normalize(candidate.nukh)
    const candCity = normalize(candidate.city)
    const candState = normalize(candidate.state)

    const matchSignals: string[] = []
    const differingSignals: string[] = []
    let score = 0

    if (targetName && candName && targetName === candName) {
      score += 40
      matchSignals.push('Identical family name')
    } else {
      differingSignals.push('Different family names')
    }

    if (targetGotra && candGotra && targetGotra === candGotra) {
      score += 25
      matchSignals.push(`Matching Gotra (${target.gotra})`)
    } else if (targetGotra && candGotra && targetGotra !== candGotra) {
      differingSignals.push('Different Gotra')
      score = Math.max(0, score - 15)
    }

    if (targetNukh && candNukh && targetNukh === candNukh) {
      score += 20
      matchSignals.push(`Matching Nukh (${target.nukh})`)
    }

    if (targetCity && candCity && targetCity === candCity) {
      score += 15
      matchSignals.push(`Matching city (${candidate.city})`)
    }

    if (targetState && candState && targetState === candState) {
      score += 10
      matchSignals.push(`Matching state (${candidate.state})`)
    }

    const finalScore = Math.min(100, Math.max(0, score))

    let confidence: DuplicateConfidence | null = null
    if (finalScore >= 75) {
      confidence = 'STRONG'
    } else if (finalScore >= 45) {
      confidence = 'POSSIBLE'
    } else if (finalScore >= 25 && matchSignals.length >= 1) {
      confidence = 'WEAK'
    }

    if (confidence) {
      candidates.push({
        targetRecordId: target.id,
        candidate,
        confidence,
        score: finalScore,
        matchSignals,
        differingSignals,
      })
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

/**
 * Creates a persistent non-destructive duplicate flag via secure RPC flag_duplicate_record.
 */
export async function flagDuplicateRecord(
  input: FlagDuplicateInput
): Promise<ApiResponse<string>> {
  try {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return {
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You must be signed in to flag duplicate records.',
        },
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: flagId, error } = await (supabase.rpc as any)('flag_duplicate_record', {
      p_entity_type: input.entityType,
      p_record_a_id: input.recordAId,
      p_record_b_id: input.recordBId,
      p_confidence: input.confidence,
      p_match_signals: input.matchReasons ?? [],
    })

    if (error) {
      return {
        data: null,
        error: {
          code: 'RPC_ERROR',
          message: error.message || 'Failed to flag duplicate record.',
        },
      }
    }

    return {
      data: flagId as string,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: (err as Error)?.message ?? 'An unexpected error occurred.',
      },
    }
  }
}

/**
 * Resolves an existing duplicate flag via secure RPC resolve_duplicate_flag.
 * Strictly one-way terminal lifecycle: only OPEN flags can be resolved
 * to CONFIRMED_DUPLICATE or NOT_DUPLICATE. Already-resolved flags cannot be modified.
 * Non-destructive: never triggers merges or record deletions.
 */
export async function resolveDuplicateFlag(
  input: ResolveDuplicateInput
): Promise<ApiResponse<boolean>> {
  try {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return {
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You must be signed in to resolve duplicate flags.',
        },
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (supabase.rpc as any)('resolve_duplicate_flag', {
      p_flag_id: input.flagId,
      p_resolution: input.resolution,
      p_resolution_notes: input.resolutionNotes || null,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: 'RPC_ERROR',
          message: error.message || 'Failed to resolve duplicate flag.',
        },
      }
    }

    return {
      data: Boolean(result),
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: (err as Error)?.message ?? 'An unexpected error occurred.',
      },
    }
  }
}

/**
 * Lists duplicate flags with optional filtering and enrichment for moderator review.
 */
export async function listDuplicateFlags(
  filter?: DuplicateFlagsFilter
): Promise<ApiResponse<EnrichedDuplicateFlag[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (supabase.from as any)('duplicate_flags')
      .select('*')
      .order('flagged_at', { ascending: false })

    if (filter?.status && filter.status !== 'ALL') {
      query = query.eq('status', filter.status)
    }

    if (filter?.entityType && filter.entityType !== 'ALL') {
      query = query.eq('entity_type', filter.entityType)
    }

    const { data: flags, error } = await query

    if (error) {
      return {
        data: null,
        error: {
          code: 'QUERY_ERROR',
          message: error.message || 'Failed to retrieve duplicate flags.',
        },
      }
    }

    const flagRows = (flags ?? []) as unknown as DuplicateFlagRow[]

    if (flagRows.length === 0) {
      return { data: [], error: null }
    }

    // Gather IDs for enrichment
    const personIds = new Set<string>()
    const familyIds = new Set<string>()

    for (const flag of flagRows) {
      if (flag.entity_type === 'PERSON') {
        personIds.add(flag.record_a_id)
        personIds.add(flag.record_b_id)
      } else {
        familyIds.add(flag.record_a_id)
        familyIds.add(flag.record_b_id)
      }
    }

    const personMap = new Map<string, PersonRow>()
    const familyMap = new Map<string, FamilyRow>()

    if (personIds.size > 0) {
      // Primary: community_persons security barrier view
      const { data: persons, error: pErr } = await supabase
        .from('community_persons')
        .select('*')
        .in('id', Array.from(personIds))

      let personRows = persons as unknown as PersonRow[] | null
      if (pErr && (pErr.code === 'PGRST205' || pErr.code === '42P01')) {
        const fallback = await supabase
          .from('persons')
          .select('*')
          .in('id', Array.from(personIds))
        personRows = fallback.data as unknown as PersonRow[] | null
      }

      if (personRows) {
        for (const p of personRows) {
          personMap.set(p.id, p)
        }
      }
    }

    if (familyIds.size > 0) {
      const { data: families } = await supabase
        .from('families')
        .select('*')
        .in('id', Array.from(familyIds))
      if (families) {
        for (const f of families as FamilyRow[]) {
          familyMap.set(f.id, f)
        }
      }
    }

    const enriched: EnrichedDuplicateFlag[] = flagRows.map((flag) => {
      if (flag.entity_type === 'PERSON') {
        return {
          ...flag,
          recordA: personMap.get(flag.record_a_id) || null,
          recordB: personMap.get(flag.record_b_id) || null,
        }
      } else {
        return {
          ...flag,
          recordA: familyMap.get(flag.record_a_id) || null,
          recordB: familyMap.get(flag.record_b_id) || null,
        }
      }
    })

    return {
      data: enriched,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: (err as Error)?.message ?? 'An unexpected error occurred.',
      },
    }
  }
}
