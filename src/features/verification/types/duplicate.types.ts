/**
 * Duplicate Detection & Review Types (Phase 9 — Subtask 4)
 *
 * CRITICAL ARCHITECTURAL PRINCIPLE:
 * DETECT != MERGE
 * - Duplicate detection identifies and flags potential duplicate records.
 * - Under NO circumstances does the system automatically merge, overwrite, delete,
 *   reassign ownership, or transfer claims.
 * - Flags are non-destructive and reviewed manually by authorized moderators.
 */

import type { PersonRow, FamilyRow } from '@/types'

export type DuplicateEntityType = 'PERSON' | 'FAMILY'

export type DuplicateConfidence = 'STRONG' | 'POSSIBLE' | 'WEAK'

export type DuplicateFlagStatus = 'OPEN' | 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'

/**
 * Result of client-side or candidate matching analysis.
 */
export interface DuplicateCandidate<T = PersonRow | FamilyRow> {
  targetRecordId: string
  candidate: T
  confidence: DuplicateConfidence
  score: number // 0 - 100
  matchSignals: string[]
  differingSignals: string[]
}

/**
 * Database representation of public.duplicate_flags row.
 * Guarantees record_a_id < record_b_id canonical ordering.
 */
export interface DuplicateFlagRow {
  id: string
  entity_type: DuplicateEntityType
  record_a_id: string
  record_b_id: string
  confidence: DuplicateConfidence
  status: DuplicateFlagStatus
  match_reasons: string[]
  flagged_by: string
  flagged_at: string
  resolved_by: string | null
  resolved_at: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Enriched flag with populated records for side-by-side moderator review.
 */
export interface EnrichedDuplicateFlag extends DuplicateFlagRow {
  recordA?: PersonRow | FamilyRow | null
  recordB?: PersonRow | FamilyRow | null
}

export interface FlagDuplicateInput {
  entityType: DuplicateEntityType
  recordAId: string
  recordBId: string
  confidence: DuplicateConfidence
  matchReasons: string[]
}

export interface ResolveDuplicateInput {
  flagId: string
  resolution: 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'
  resolutionNotes?: string
}

export interface DuplicateFlagsFilter {
  status?: DuplicateFlagStatus | 'ALL'
  entityType?: DuplicateEntityType | 'ALL'
}
