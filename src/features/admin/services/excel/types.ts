/**
 * Excel Import Reader, Format Registry & Adapter Contracts (Excel-1)
 *
 * Provides domain-agnostic workbook reading, deterministic signature detection,
 * format registration, and adapter interfaces for heterogeneous Excel files.
 *
 * Architectural Invariants:
 * - PERSON != USER: Maps demographic census entities only. Never touches auth.users or profiles.
 * - DETECT != MERGE: Extracts and stages raw and normalized data without automated merging.
 * - STAGING != CANONICAL: Lineage points to staging only; canonical_id remains strictly null.
 * - Zero Secrets: Redacts any credential-like fields (passwords, tokens, API keys).
 * - Read-Only Boundaries: Adapters output standard StagingRecordDraft[] compatible with Phase 14.
 */

import type { StagingRecordDraft, StructuredImportError } from '@/features/admin/types'

/**
 * Supported Excel cell primitive values.
 */
export type ExcelCellValue = string | number | boolean | Date | null | undefined

/**
 * Representation of a row in an Excel worksheet.
 */
export type ExcelRow = ExcelCellValue[]

/**
 * Normalized representation of an individual worksheet within an Excel workbook.
 */
export interface ExcelSheetData {
  name: string
  rows: ExcelRow[]
}

/**
 * Fully parsed in-memory workbook representation.
 */
export interface ExcelWorkbookData {
  fileName: string
  fileSizeBytes: number
  sheets: ExcelSheetData[]
}

/**
 * Approved Excel format IDs.
 */
export type ApprovedExcelFormatId = 'KHATRISETU_V1' | 'COMMUNITY_WEB_CMS_V1'

/**
 * Format ID or unknown indicator.
 */
export type ExcelFormatId = ApprovedExcelFormatId | (string & {})

/**
 * Detection confidence score.
 */
export type DetectionConfidence = 'EXACT' | 'HIGH' | 'LOW' | 'NONE'

/**
 * Signature match result for an Excel workbook.
 */
export interface ExcelFormatDetectionResult {
  formatId: ExcelFormatId | null
  confidence: DetectionConfidence
  matchedSignatures: string[]
  unmatchedReasons?: string[]
}

/**
 * Context provided to an Excel adapter during execution.
 */
export interface ExcelAdapterContext {
  fileName: string
  fileHash: string
  notes?: string
}

/**
 * Result returned by an Excel format adapter.
 */
export interface ExcelAdapterResult {
  formatId: ApprovedExcelFormatId
  records: StagingRecordDraft[]
  errors: StructuredImportError[]
  summary: {
    totalRecords: number
    persons: number
    families: number
    relationships: number
  }
}

/**
 * Contract that all format-specific Excel adapters must implement.
 */
export interface ExcelFormatAdapter {
  readonly formatId: ApprovedExcelFormatId
  readonly displayName: string
  readonly description: string

  /**
   * Evaluates how well a workbook matches this adapter's expected structure.
   */
  matches(workbook: ExcelWorkbookData): ExcelFormatDetectionResult

  /**
   * Adapts the workbook into standard Phase 14 StagingRecordDraft items.
   */
  adapt(
    workbook: ExcelWorkbookData,
    context: ExcelAdapterContext
  ): Promise<ExcelAdapterResult>
}

/**
 * Registered format definition metadata.
 */
export interface ExcelFormatDefinition {
  formatId: ApprovedExcelFormatId
  displayName: string
  sourceSystem: string
  description: string
  expectedSheets: string[]
  adapter: ExcelFormatAdapter
}
