/**
 * Import Service — Client data access layer for Import & Data Migration (Phase 14 — Subtask 1)
 *
 * Security & Architectural Invariants:
 * - PERSON != USER: Import operations handle census entities only, never auth accounts.
 * - DETECT != MERGE: No automatic deduplication or destructive merges occur.
 * - Server-Authoritative: Batch creation and cancellation strictly route through
 *   security-definer PostgreSQL RPCs with role verification (is_admin()).
 * - Direct table INSERT/UPDATE/DELETE from client is denied by database RLS.
 */

import { supabase } from '@/lib/supabase'
import { sanitizeMultilineText } from '@/lib/sanitization'
import type {
  CreateImportBatchInput,
  CancelImportBatchInput,
  ImportBatchItem,
  ImportBatchFilterParams,
  ImportBatchListResponse,
  StagingRecordDraft,
  StageImportRecordsResponse,
  IngestImportInput,
  IngestImportResult,
  StagingRecordFilterParams,
  StagingRecordListResponse,
  StagingRecordItem,
  BatchValidationResult,
  SetStagingRecordStatusInput,
  FinalizeBatchValidationResult,
  BatchDataQualityMetrics,
  StagingValidationStatus,
  ImportBatchStatus,
  ImportBatchValidationSummary,
  PromoteImportBatchResult,
} from '../types'
import {
  parseImportFile,
  IMPORT_LIMITS,
} from './importParser.service'

/**
 * Sanitizes Supabase/PostgreSQL RPC errors into clear, user-facing error messages.
 * Never leaks raw internal table names or SQL details.
 */
export function sanitizeImportError(err: unknown, defaultMessage: string): string {
  if (!err) return defaultMessage

  const message =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message ?? ''

  if (message.includes('CONFLICT: An active import batch')) {
    return 'An import batch with this exact file hash is already in progress.'
  }

  if (message.includes('CONFLICT: This exact file has already been imported and promoted')) {
    return 'This exact file has already been imported and promoted in a previous batch.'
  }

  if (message.includes('CONFLICT: Import batch') && message.includes('already cancelled')) {
    return 'This import batch has already been cancelled.'
  }

  if (message.includes('CONFLICT: Cannot cancel an already promoted')) {
    return 'Cannot cancel an import batch that has already been promoted.'
  }

  if (message.includes('INVALID_STATUS: Cannot stage records')) {
    return 'Cannot stage records into this import batch because its status is not STAGED.'
  }

  if (message.includes('NOT_FOUND: Import batch')) {
    return 'The requested import batch was not found.'
  }

  if (message.includes('UNAUTHENTICATED') || message.includes('signed in')) {
    return 'You must be signed in to perform import operations.'
  }

  if (message.includes('FORBIDDEN') || message.includes('ADMIN or SUPER_ADMIN')) {
    return 'You do not have permission to manage data imports. Administrator privileges required.'
  }

  if (message.includes('UNRESOLVED_REFERENCE')) {
    return message.replace(/^.*UNRESOLVED_REFERENCE:\s*/, '')
  }

  if (message.includes('INVALID_ARGUMENT')) {
    return message.replace(/^.*INVALID_ARGUMENT:\s*/, '')
  }

  if (message.includes('INVALID_STATUS')) {
    return message.replace(/^.*INVALID_STATUS:\s*/, '')
  }

  if (message.includes('PRECONDITION_FAILED')) {
    return message.replace(/^.*PRECONDITION_FAILED:\s*/, '')
  }

  return defaultMessage
}

/**
 * Creates a new import batch in STAGED status via authoritative RPC `create_import_batch`.
 * Caller must be an active ADMIN or SUPER_ADMIN.
 *
 * @param input Batch metadata including file name, format, and SHA-256 hash.
 * @returns UUID of the created import batch.
 * @throws {Error} If caller is unauthorized, arguments are invalid, or identical active batch exists.
 */
export async function createImportBatch(
  input: CreateImportBatchInput
): Promise<string> {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: string | null; error: { message: string } | null }>)(
    'create_import_batch',
    {
      p_file_name: input.fileName,
      p_file_format: input.fileFormat,
      p_file_hash: input.fileHash,
      p_file_size_bytes: input.fileSizeBytes ?? null,
      p_notes: input.notes ? sanitizeMultilineText(input.notes) : null,
    }
  )

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to create import batch on the server.')
    )
  }

  if (!data || typeof data !== 'string') {
    throw new Error('Server returned an invalid import batch identifier.')
  }

  return data
}

/**
 * Cancels an unpromoted import batch via authoritative RPC `cancel_import_batch`.
 * Sets batch status to CANCELLED and records cancellation metadata.
 *
 * @param input Target batch ID and optional cancellation reason.
 * @returns True if cancellation succeeded.
 * @throws {Error} If batch not found, already cancelled, already promoted, or unauthorized.
 */
export async function cancelImportBatch(
  input: CancelImportBatchInput
): Promise<boolean> {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>)(
    'cancel_import_batch',
    {
      p_batch_id: input.batchId,
      p_reason: input.reason ? sanitizeMultilineText(input.reason) : null,
    }
  )

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to cancel import batch on the server.')
    )
  }

  return data === true
}

// Helper for dynamic table access while preserving TypeScript types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const importBatchesTable = () => (supabase.from as any)('import_batches')

/**
 * Lists import batches with server-side pagination and status filtering.
 * Filtered by database RLS to active administrators only.
 *
 * @param params Filtering and pagination options.
 * @returns Paginated list of import batches.
 */
export async function listImportBatches(
  params: ImportBatchFilterParams = {}
): Promise<ImportBatchListResponse> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 15))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = importBatchesTable().select('*', { count: 'exact' })

  if (params.status && params.status !== 'ALL') {
    query = query.eq('status', params.status)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to fetch import batches from server.')
    )
  }

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return {
    batches: (data ?? []) as unknown as ImportBatchItem[],
    totalCount,
    page,
    pageSize,
    totalPages,
  }
}

/**
 * Fetches a single import batch by ID.
 *
 * @param batchId UUID of the import batch.
 * @returns ImportBatchItem details.
 */
export async function getImportBatch(batchId: string): Promise<ImportBatchItem> {
  const { data, error } = await importBatchesTable()
    .select('*')
    .eq('id', batchId)
    .single()

  if (error || !data) {
    throw new Error(
      sanitizeImportError(error, 'Import batch not found or access denied.')
    )
  }

  return data as unknown as ImportBatchItem
}

/**
 * Ingests a collection of staged record drafts into public.staging_records
 * and atomically recalculates batch aggregate counts via authoritative RPC `stage_import_records`.
 * Automatically chunks large batches to prevent HTTP payload exhaustion.
 *
 * @param batchId UUID of target STAGED import batch.
 * @param records Collection of validated staging record drafts.
 * @returns Synchronized batch aggregate metrics.
 */
export async function stageImportRecords(
  batchId: string,
  records: StagingRecordDraft[]
): Promise<StageImportRecordsResponse> {
  if (!batchId) {
    throw new Error('batchId is required to stage records.')
  }

  if (records.length === 0) {
    const batch = await getImportBatch(batchId)
    return {
      batchId,
      insertedCount: 0,
      totalRecords: batch.total_records,
      rowCounts: batch.row_counts,
      validationSummary: batch.validation_summary,
    }
  }

  const chunkSize = IMPORT_LIMITS.CHUNK_SIZE
  let totalInserted = 0
  let finalResult: StageImportRecordsResponse | null = null

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize)

    const { data, error } = await (supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>)(
      'stage_import_records',
      {
        p_batch_id: batchId,
        p_records: chunk,
      }
    )

    if (error) {
      throw new Error(
        sanitizeImportError(error, 'Failed to stage records on the server.')
      )
    }

    if (!data) {
      throw new Error('Server returned an empty response during staging record ingestion.')
    }

    totalInserted += (data.inserted_count as number) ?? chunk.length
    finalResult = {
      batchId,
      insertedCount: totalInserted,
      totalRecords: (data.total_records as number) ?? totalInserted,
      rowCounts: (data.row_counts as unknown as ImportBatchItem['row_counts']) ?? {
        persons: 0,
        families: 0,
        relationships: 0,
      },
      validationSummary: (data.validation_summary as unknown as ImportBatchItem['validation_summary']) ?? {
        errors: 0,
        warnings: 0,
        valid: 0,
        duplicates: 0,
      },
    }
  }

  return (
    finalResult ?? {
      batchId,
      insertedCount: totalInserted,
      totalRecords: totalInserted,
      rowCounts: { persons: 0, families: 0, relationships: 0 },
      validationSummary: { errors: 0, warnings: 0, valid: 0, duplicates: 0 },
    }
  )
}

/**
 * High-level orchestration pipeline for data migration:
 * 1. Parses raw CSV/JSON content and normalizes entities.
 * 2. Creates authoritative import batch with computed SHA-256 hash.
 * 3. Ingests staging records in chunked, idempotent batches.
 * 4. Invariant: canonical_id remains null; canonical tables are untouched.
 *
 * @param input Raw file content and metadata.
 * @returns IngestImportResult with batch ID and aggregated staging statistics.
 */
export async function ingestImport(
  input: IngestImportInput
): Promise<IngestImportResult> {
  // Step 1: Parse and normalize client-side
  const parseResult = await parseImportFile(input.fileName, input.content, {
    format: input.format,
    defaultEntityType: input.defaultEntityType,
    notes: input.notes,
  })

  // Step 2: Use existing batch or create authoritative new batch
  const isResuming = Boolean(input.existingBatchId)
  const batchId =
    input.existingBatchId ??
    (await createImportBatch({
      fileName: parseResult.fileName,
      fileFormat: parseResult.fileFormat,
      fileHash: parseResult.fileHash,
      fileSizeBytes: parseResult.fileSizeBytes,
      notes: input.notes,
    }))

  // Step 3: Stage records via authoritative RPC
  try {
    const stagingResult = await stageImportRecords(batchId, parseResult.records)

    return {
      batchId,
      fileHash: parseResult.fileHash,
      totalRecords: stagingResult.totalRecords,
      rowCounts: stagingResult.rowCounts,
      validationSummary: stagingResult.validationSummary,
      stagedRecordsCount: stagingResult.insertedCount,
    }
  } catch (err) {
    // If staging fails for a newly created batch, auto-cancel the batch so it does not
    // remain orphaned in STAGED status and block future retries under active file-hash protection.
    if (!isResuming) {
      try {
        const failureReason =
          (err as Error)?.message?.slice(0, 500) || 'Staging ingestion failure'
        await cancelImportBatch({
          batchId,
          reason: `Automatic cleanup: Ingestion failed (${failureReason})`,
        })
      } catch {
        // Best effort cancellation; preserve original staging error
      }
    }
    throw err
  }
}

// Helper for staging_records table access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stagingRecordsTable = () => (supabase.from as any)('staging_records')

/**
 * Lists staging records for a specific import batch with server-side pagination and filters.
 * Filtered by database RLS to active administrators only.
 *
 * @param batchId UUID of the parent import batch.
 * @param params Pagination and entity/status filters.
 * @returns Paginated staging records.
 */
export async function listStagingRecords(
  batchId: string,
  params: StagingRecordFilterParams = {}
): Promise<StagingRecordListResponse> {
  if (!batchId) {
    throw new Error('batchId is required to list staging records.')
  }

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = stagingRecordsTable()
    .select('*', { count: 'exact' })
    .eq('batch_id', batchId)

  if (params.entityType && params.entityType !== 'ALL') {
    query = query.eq('entity_type', params.entityType)
  }

  if (params.validationStatus && params.validationStatus !== 'ALL') {
    query = query.eq('validation_status', params.validationStatus)
  }

  const { data, count, error } = await query
    .order('source_row_number', { ascending: true })
    .range(from, to)

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to fetch staging records from server.')
    )
  }

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return {
    records: (data ?? []) as unknown as StagingRecordItem[],
    totalCount,
    page,
    pageSize,
    totalPages,
  }
}

/**
 * Validates all staged records in an import batch via authoritative RPC `validate_import_batch`.
 * Evaluates records against canonical schema rules and identifies duplicate candidates.
 * Invariant: DETECT != MERGE. Duplicates are flagged as WARNING, never merged.
 *
 * @param batchId UUID of the import batch.
 * @returns Synchronized batch metrics and summary.
 */
export async function validateImportBatch(
  batchId: string
): Promise<BatchValidationResult> {
  if (!batchId) {
    throw new Error('batchId is required to validate import batch.')
  }

  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>)(
    'validate_import_batch',
    {
      p_batch_id: batchId,
    }
  )

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to validate import batch on the server.')
    )
  }

  if (!data) {
    throw new Error('Server returned empty response for batch validation.')
  }

  return {
    batchId: (data['batch_id'] as string) || batchId,
    totalRecords: (data['total_records'] as number) ?? 0,
    rowCounts: (data['row_counts'] as BatchValidationResult['rowCounts']) ?? {
      persons: 0,
      families: 0,
      relationships: 0,
    },
    validationSummary: (data['validation_summary'] as BatchValidationResult['validationSummary']) ?? {
      errors: 0,
      warnings: 0,
      valid: 0,
      duplicates: 0,
    },
  }
}

/**
 * Updates manual validation status on an individual staging record (e.g. EXCLUDED or VALID).
 * Allows administrators to resolve review warnings or exclude problematic records prior to promotion.
 *
 * @param input Target record ID, target status, and optional review notes.
 * @returns Confirmation of updated status.
 */
export async function setStagingRecordStatus(
  input: SetStagingRecordStatusInput
): Promise<{ recordId: string; batchId: string; status: StagingValidationStatus }> {
  if (!input.recordId) {
    throw new Error('recordId is required.')
  }

  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>)(
    'set_staging_record_status',
    {
      p_record_id: input.recordId,
      p_status: input.status,
      p_notes: input.notes ? sanitizeMultilineText(input.notes) : null,
    }
  )

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to update staging record status on the server.')
    )
  }

  return {
    recordId: (data?.['record_id'] as string) || input.recordId,
    batchId: (data?.['batch_id'] as string) || '',
    status: (data?.['status'] as StagingValidationStatus) || input.status,
  }
}

/**
 * Finalizes an import batch from STAGED to VALIDATED status via authoritative RPC `finalize_batch_validation`.
 * Fails if any blocking ERROR records remain unresolved.
 *
 * @param batchId UUID of the import batch.
 * @returns Finalized batch result.
 */
export async function finalizeBatchValidation(
  batchId: string
): Promise<FinalizeBatchValidationResult> {
  if (!batchId) {
    throw new Error('batchId is required to finalize validation.')
  }

  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>)(
    'finalize_batch_validation',
    {
      p_batch_id: batchId,
    }
  )

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to finalize batch validation.')
    )
  }

  return {
    batchId: (data?.['batch_id'] as string) || batchId,
    status: (data?.['status'] as ImportBatchStatus) || 'VALIDATED',
  }
}

/**
 * Computes deterministic data quality score and metric breakdown for an import batch.
 * Score is calculated out of 100 based on validation results:
 * - 100% valid with 0 errors/warnings = 100 (EXCELLENT)
 * - Errors heavily penalize (-3x)
 * - Warnings moderately penalize (-1x)
 * - Excluded records are neutral
 *
 * @param summary Batch validation summary metrics.
 * @param totalRecords Total records in the batch.
 * @returns BatchDataQualityMetrics breakdown.
 */
export function calculateBatchDataQuality(
  summary: ImportBatchValidationSummary,
  totalRecords: number
): BatchDataQualityMetrics {
  if (!totalRecords || totalRecords <= 0) {
    return {
      totalRecords: 0,
      validCount: 0,
      warningCount: 0,
      errorCount: 0,
      excludedCount: 0,
      duplicateCount: 0,
      validityRate: 100,
      errorRate: 0,
      qualityScore: 100,
      tier: 'EXCELLENT',
    }
  }

  const validCount = summary.valid || 0
  const warningCount = summary.warnings || 0
  const errorCount = summary.errors || 0
  const duplicateCount = summary.duplicates || 0
  const evaluatedCount = validCount + warningCount + errorCount
  const excludedCount = Math.max(0, totalRecords - evaluatedCount)

  const validityRate = Math.round((validCount / totalRecords) * 100)
  const errorRate = Math.round((errorCount / totalRecords) * 100)

  // Quality score formula: 100 - (errorRate * 0.7) - ((warnings / total) * 30)
  const errorPenalty = (errorCount / totalRecords) * 70
  const warningPenalty = (warningCount / totalRecords) * 30
  const rawScore = 100 - errorPenalty - warningPenalty
  const qualityScore = Math.max(0, Math.min(100, Math.round(rawScore)))

  let tier: BatchDataQualityMetrics['tier'] = 'NEEDS_IMPROVEMENT'
  if (qualityScore >= 85) tier = 'EXCELLENT'
  else if (qualityScore >= 70) tier = 'GOOD'
  else if (qualityScore >= 50) tier = 'ADEQUATE'

  return {
    totalRecords,
    validCount,
    warningCount,
    errorCount,
    excludedCount,
    duplicateCount,
    validityRate,
    errorRate,
    qualityScore,
    tier,
  }
}

/**
 * Promotes a validated import batch into canonical census domain tables (persons, families,
 * family_members, relationships, and duplicate_flags) via authoritative RPC `promote_import_batch`.
 *
 * Security & Architectural Invariants:
 * - Server-Authoritative: Executed via security-definer PostgreSQL RPC with role verification (is_admin()).
 * - PERSON != USER: Promoted census records have user_id = NULL unconditionally. No auth.users or profiles created.
 * - DETECT != MERGE: No automatic deduplication or destructive merges occur. Duplicate candidates create OPEN flags.
 * - Atomic: Single database transaction; any failure completely rolls back all canonical records.
 *
 * @param batchId Target import batch UUID (must be in VALIDATED status).
 * @returns PromoteImportBatchResult with counts of promoted entities.
 * @throws {Error} If caller is unauthorized, batch is not VALIDATED, unresolved errors exist, or promotion fails.
 */
export async function promoteImportBatch(
  batchId: string
): Promise<PromoteImportBatchResult> {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>)(
    'promote_import_batch',
    {
      p_batch_id: batchId,
    }
  )

  if (error) {
    throw new Error(
      sanitizeImportError(error, 'Failed to promote import batch to canonical tables.')
    )
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Server returned an invalid promotion response.')
  }

  const rawCounts = (data['promotedCounts'] as Record<string, number>) || {}

  return {
    batchId: (data['batchId'] as string) || batchId,
    status: (data['status'] as 'PROMOTED') || 'PROMOTED',
    alreadyPromoted: Boolean(data['alreadyPromoted']),
    promotedAt: (data['promotedAt'] as string) || new Date().toISOString(),
    promotedBy: (data['promotedBy'] as string | null) ?? null,
    promotedCounts: {
      persons: Number(rawCounts['persons'] ?? 0),
      families: Number(rawCounts['families'] ?? 0),
      relationships: Number(rawCounts['relationships'] ?? 0),
      total: Number(rawCounts['total'] ?? 0),
    },
    familyMemberships: Number(data['familyMemberships'] ?? 0),
    duplicateFlags: Number(data['duplicateFlags'] ?? 0),
    total: Number(data['total'] ?? 0),
  }
}

