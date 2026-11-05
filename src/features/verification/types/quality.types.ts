/**
 * Data Quality Types (Phase 9 — Subtask 4)
 *
 * CRITICAL ARCHITECTURAL DISTINCTION:
 * DATA QUALITY != VERIFICATION
 * - Verification confirms official attestation by community moderators.
 * - Data Quality measures record completeness, internal consistency, and genealogical utility.
 * - A verified record may still have missing fields; an unverified record may be 100% complete.
 */

export type DataQualityTier = 'EXCELLENT' | 'GOOD' | 'ADEQUATE' | 'NEEDS_IMPROVEMENT'

export interface QualityCategoryScore {
  label: string
  earned: number
  max: number
  description: string
}

export interface DataQualityScore {
  entityType: 'PERSON' | 'FAMILY'
  entityId: string
  score: number // 0 - 100
  tier: DataQualityTier
  categories: Record<string, QualityCategoryScore>
  missingFields: string[]
  recommendations: string[]
  warnings: string[]
  calculatedAt: string
}
