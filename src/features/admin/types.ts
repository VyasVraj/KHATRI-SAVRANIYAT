/**
 * Admin Feature Types
 *
 * Phase 13 — Subtask 2: Admin Hub, Layout & Platform Metrics
 *
 * Invariants:
 * - PERSON != USER:
 *   * Users are authentication identities (auth.users / public.profiles).
 *   * Persons are community census entities (public.persons).
 * - Aggregated metrics do not expose private census data.
 */

import type React from 'react'
import type { UserRole, AuditAction } from '@/types'

/**
 * Platform metrics returned by server-authoritative RPC `admin_get_platform_metrics()`.
 */
export interface PlatformMetrics {
  total_users: number
  active_users: number
  total_persons: number
  total_families: number
  pending_claims: number
  pending_verifications: number
  open_duplicates: number
  generated_at: string
}

/**
 * Navigation item definition for the administrative sidebar/drawer.
 */
export interface AdminNavigationItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  description: string
  badge?: number | string
  badgeVariant?: 'default' | 'warning' | 'info'
  exact?: boolean
}

/**
 * Platform user item representation from public.profiles.
 * Invariant: PERSON != USER. This represents an authentication profile, not census person.
 */
export interface AdminUserItem {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  email_verified: boolean
  created_at: string
  updated_at: string
}

/**
 * Filter parameters for querying administrative users.
 */
export interface AdminUserFilterParams {
  search?: string
  role?: UserRole | 'ALL'
  status?: 'all' | 'active' | 'inactive'
  page?: number
  pageSize?: number
}

/**
 * Paginated response for administrative user listing.
 */
export interface AdminUserListResponse {
  users: AdminUserItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Audit log entry returned by server-authoritative RPC `admin_get_audit_logs()`.
 */
export interface AdminAuditLogItem {
  id: string
  action: AuditAction
  actor_id: string | null
  actor_name: string | null
  actor_email: string | null
  target_type: string | null
  target_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  total_count: number
}

/**
 * Filter parameters for querying audit logs.
 */
export interface AdminAuditFilterParams {
  action?: AuditAction | 'ALL'
  actor_id?: string
  target_type?: string
  target_id?: string
  start_date?: string
  end_date?: string
  page?: number
  pageSize?: number
}

/**
 * Paginated response for audit logs query.
 */
export interface AdminAuditListResponse {
  logs: AdminAuditLogItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Duplicate entities and review types (Phase 13 Subtask 4).
 * Invariant: DETECT != MERGE. Duplicate flags are human-reviewed indicators, never automatic merges.
 * Invariant: PERSON != USER. Candidates represent census persons/families, not login accounts.
 */
export type DuplicateEntityType = 'PERSON' | 'FAMILY'
export type DuplicateFlagStatus = 'OPEN' | 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'
export type DuplicateConfidence = 'STRONG' | 'POSSIBLE' | 'WEAK'

/**
 * Safe projection of census record data for duplicate comparison.
 * Excludes private sensitive fields (user_id, contact info, documents, etc.).
 */
export interface SafeDuplicateRecordPreview {
  id: string
  label: string
  // Person fields
  first_name?: string
  middle_name?: string | null
  last_name?: string
  gender?: string | null
  dob_year?: number | null
  date_of_birth?: string | null
  birth_place?: string | null
  gotra?: string | null
  nukh?: string | null
  kul?: string | null
  status?: string
  date_of_death?: string | null
  verification_status?: string
  // Family fields
  family_name?: string
  city?: string | null
  state?: string | null
  country?: string | null
  description?: string | null
}

export interface AdminDuplicateItem {
  id: string
  entity_type: DuplicateEntityType
  record_a_id: string
  record_b_id: string
  confidence: DuplicateConfidence
  status: DuplicateFlagStatus
  match_signals: string[]
  notes: string | null
  resolution_notes: string | null
  flagged_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  record_a_preview?: SafeDuplicateRecordPreview | null
  record_b_preview?: SafeDuplicateRecordPreview | null
}

export interface AdminDuplicateFilterParams {
  status?: DuplicateFlagStatus | 'ALL'
  entityType?: DuplicateEntityType | 'ALL'
  confidence?: DuplicateConfidence | 'ALL'
  page?: number
  pageSize?: number
}

export interface AdminDuplicateListResponse {
  items: AdminDuplicateItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ResolveAdminDuplicateInput {
  flagId: string
  resolution: 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'
  resolutionNotes?: string
}

/**
 * Import & Data Migration types (Phase 14 — Subtask 1).
 * Invariant: PERSON != USER. Imported census data never creates auth.users or profiles.
 * Invariant: DETECT != MERGE. Import validation highlights duplicates, never auto-merging.
 */
export type ImportBatchStatus =
  | 'STAGED'
  | 'VALIDATED'
  | 'PROMOTED'
  | 'CANCELLED'
  | 'REVERTED'

export type ImportEntityType = 'PERSON' | 'FAMILY' | 'RELATIONSHIP'

export type StagingValidationStatus =
  | 'PENDING'
  | 'VALID'
  | 'WARNING'
  | 'ERROR'
  | 'EXCLUDED'

export interface ImportBatchRowCounts {
  persons: number
  families: number
  relationships: number
}

export interface ImportBatchValidationSummary {
  errors: number
  warnings: number
  valid: number
  duplicates: number
}

export interface ImportBatchItem {
  id: string
  created_by: string | null
  file_name: string
  file_format: 'CSV' | 'JSON'
  file_hash: string
  file_size_bytes: number | null
  status: ImportBatchStatus
  total_records: number
  row_counts: ImportBatchRowCounts
  validation_summary: ImportBatchValidationSummary
  notes: string | null
  created_at: string
  updated_at: string
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  promoted_at: string | null
  promoted_by: string | null
}

export interface StagingRecordItem {
  id: string
  batch_id: string
  entity_type: ImportEntityType
  source_row_number: number
  source_record_id: string | null
  parsed_data: Record<string, unknown>
  raw_data?: Record<string, unknown> | null
  validation_status: StagingValidationStatus
  validation_errors: Array<{ field?: string; message: string; code?: string }>
  canonical_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateImportBatchInput {
  fileName: string
  fileFormat: 'CSV' | 'JSON'
  fileHash: string
  fileSizeBytes?: number
  notes?: string
}

export interface CancelImportBatchInput {
  batchId: string
  reason?: string
}

export interface ImportBatchFilterParams {
  status?: ImportBatchStatus | 'ALL'
  page?: number
  pageSize?: number
}

export interface ImportBatchListResponse {
  batches: ImportBatchItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Structured validation / parsing error on staging records.
 */
export interface StructuredImportError {
  code: string
  field?: string
  message: string
  severity: 'ERROR' | 'WARNING'
}

/**
 * Staged record payload prepared for database ingestion (public.staging_records).
 * Invariant: canonical_id remains strictly null during Subtask 2.
 */
export interface StagingRecordDraft {
  entity_type: ImportEntityType
  source_row_number: number
  source_record_id: string
  parsed_data: Record<string, unknown>
  raw_data: Record<string, unknown>
  validation_status: StagingValidationStatus
  validation_errors: StructuredImportError[]
  canonical_id?: null
}

/**
 * Options for parsing CSV, JSON, or Excel import content.
 */
export interface ParseImportOptions {
  format?: 'CSV' | 'JSON' | 'XLSX'
  defaultEntityType?: ImportEntityType
  notes?: string
}

/**
 * Result of client-side parsing and mapping of an import file.
 */
export interface ParseImportResult {
  fileName: string
  fileFormat: 'CSV' | 'JSON'
  fileHash: string
  fileSizeBytes: number
  totalRows: number
  records: StagingRecordDraft[]
  errors: StructuredImportError[]
  rowCounts: ImportBatchRowCounts
  validationSummary: ImportBatchValidationSummary
  detectedFormat?: {
    formatId: string
    displayName: string
    sourceSystem: string
    confidence: string
  }
}

/**
 * Response from authoritative RPC `stage_import_records`.
 */
export interface StageImportRecordsResponse {
  batchId: string
  insertedCount: number
  totalRecords: number
  rowCounts: ImportBatchRowCounts
  validationSummary: ImportBatchValidationSummary
}

/**
 * Input for full file ingestion (parse -> create batch -> stage records).
 */
export interface IngestImportInput {
  fileName: string
  content: string | ArrayBuffer | Uint8Array
  format?: 'CSV' | 'JSON' | 'XLSX'
  defaultEntityType?: ImportEntityType
  notes?: string
  existingBatchId?: string
}

/**
 * Complete result of import ingestion.
 */
export interface IngestImportResult {
  batchId: string
  fileHash: string
  totalRecords: number
  rowCounts: ImportBatchRowCounts
  validationSummary: ImportBatchValidationSummary
  stagedRecordsCount: number
}

/**
 * Filtering parameters for querying staging records of a batch.
 */
export interface StagingRecordFilterParams {
  entityType?: ImportEntityType | 'ALL'
  validationStatus?: StagingValidationStatus | 'ALL'
  page?: number
  pageSize?: number
}

/**
 * Paginated response for staging records.
 */
export interface StagingRecordListResponse {
  records: StagingRecordItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Result returned from authoritative batch validation RPC (Phase 14 — Subtask 3).
 */
export interface BatchValidationResult {
  batchId: string
  totalRecords: number
  rowCounts: ImportBatchRowCounts
  validationSummary: ImportBatchValidationSummary
}

/**
 * Parameters for setting manual review status on a staging record (e.g. EXCLUDED or VALID).
 */
export interface SetStagingRecordStatusInput {
  recordId: string
  status: StagingValidationStatus
  notes?: string
}

/**
 * Result of finalizing a batch from STAGED to VALIDATED status.
 */
export interface FinalizeBatchValidationResult {
  batchId: string
  status: ImportBatchStatus
}

/**
 * Candidate duplicate match identified during import validation.
 * Invariant: DETECT != MERGE. Used for review UI only; never auto-merged.
 */
export interface StagingDuplicateCandidate {
  stagingRecordId: string
  canonicalCandidateId: string
  confidence: 'STRONG' | 'POSSIBLE' | 'WEAK'
  message: string
  field?: string
  matchSignals?: string[]
}

/**
 * Deterministic batch-level data quality metrics (Phase 14 — Subtask 3).
 */
export interface BatchDataQualityMetrics {
  totalRecords: number
  validCount: number
  warningCount: number
  errorCount: number
  excludedCount: number
  duplicateCount: number
  validityRate: number // 0 - 100 percentage
  errorRate: number // 0 - 100 percentage
  qualityScore: number // 0 - 100 deterministic quality score
  tier: 'EXCELLENT' | 'GOOD' | 'ADEQUATE' | 'NEEDS_IMPROVEMENT'
}

/**
 * Result returned from authoritative batch promotion RPC (Phase 14 — Subtask 4).
 * Invariant: PERSON != USER. Promoted persons represent census entities only.
 * Invariant: DETECT != MERGE. Unresolved warnings create open duplicate flags without merging.
 */
export interface PromoteImportBatchResult {
  batchId: string
  status: 'PROMOTED'
  alreadyPromoted?: boolean
  promotedAt: string
  promotedBy: string | null
  promotedCounts: {
    persons: number
    families: number
    relationships: number
    total: number
  }
  familyMemberships: number
  duplicateFlags: number
  total: number
}

