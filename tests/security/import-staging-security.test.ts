/**
 * Security Tests: Import Staging Infrastructure & Authorization (Phase 14 — Subtask 1)
 *
 * Verifies non-negotiable security invariants:
 * 1. PERSON != USER: Staging records represent census entities only, never creating auth.users or profiles.
 * 2. Role Boundaries: Only active SUPER_ADMIN and ADMIN can access import staging RPCs and tables.
 *    COMMUNITY_MODERATOR, MEMBER, and unauthenticated callers are strictly blocked.
 * 3. Direct Mutation Denial: Direct INSERT/UPDATE/DELETE on import_batches and staging_records is blocked by RLS.
 * 4. Lifecycle Guards: Concurrent active duplicate file hashes rejected; double cancellation blocked; promoted cancellation blocked.
 * 5. Secret Hygiene: No service_role keys or secrets exposed in frontend code.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  createImportBatch,
  cancelImportBatch,
  sanitizeImportError,
} from '@/features/admin/services/import.service'
import { supabase } from '@/lib/supabase'

describe('Phase 14 Subtask 1: Security & Authorization Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Architectural Invariant: PERSON != USER', () => {
    it('verifies migration contains no DDL creating auth.users or modifying persons.user_id', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017100000_create_import_staging_infrastructure.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')
      const executableSql = migrationSql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')

      // Must NOT alter auth.users
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+auth\.users/i)
      expect(executableSql).not.toMatch(/UPDATE\s+auth\.users/i)

      // Must NOT alter profiles or set persons.user_id
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.profiles/i)
      expect(executableSql).not.toMatch(/user_id\s*=\s*/i)
      expect(executableSql).not.toMatch(/persons\.user_id/i)

      // Canonical tables must remain untouched
      expect(executableSql).not.toMatch(/ALTER\s+TABLE\s+public\.persons/i)
      expect(executableSql).not.toMatch(/ALTER\s+TABLE\s+public\.families/i)
      expect(executableSql).not.toMatch(/ALTER\s+TABLE\s+public\.relationships/i)
    })
  })

  describe('2. Role-Based Access Control (RBAC) & Privileges', () => {
    it('verifies migration revokes table and RPC access from PUBLIC and anon', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017100000_create_import_staging_infrastructure.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      expect(migrationSql).toContain('REVOKE ALL ON public.import_batches FROM PUBLIC, anon;')
      expect(migrationSql).toContain('REVOKE ALL ON public.staging_records FROM PUBLIC, anon;')
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.create_import_batch')
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.cancel_import_batch')
    })

    it('blocks unauthenticated callers from creating import batches', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'UNAUTHENTICATED: Caller must be authenticated to create import batches' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        createImportBatch({
          fileName: 'census_2026.csv',
          fileFormat: 'CSV',
          fileHash: 'a'.repeat(64),
        })
      ).rejects.toThrow('You must be signed in to perform import operations.')
    })

    it('blocks non-admin callers (e.g. COMMUNITY_MODERATOR or MEMBER) from creating import batches', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to create import batches' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        createImportBatch({
          fileName: 'census_2026.csv',
          fileFormat: 'CSV',
          fileHash: 'b'.repeat(64),
        })
      ).rejects.toThrow('You do not have permission to manage data imports. Administrator privileges required.')
    })

    it('blocks non-admin callers from cancelling import batches', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to cancel import batches' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        cancelImportBatch({
          batchId: '00000000-0000-0000-0000-000000000001',
          reason: 'Test cancellation',
        })
      ).rejects.toThrow('You do not have permission to manage data imports. Administrator privileges required.')
    })
  })

  describe('3. RLS Direct Mutation Denial', () => {
    it('verifies RLS policies deny direct INSERT, UPDATE, and DELETE on staging tables', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017100000_create_import_staging_infrastructure.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // import_batches policies
      expect(migrationSql).toContain('CREATE POLICY "import_batches_insert_deny"')
      expect(migrationSql).toContain('WITH CHECK (FALSE)')
      expect(migrationSql).toContain('CREATE POLICY "import_batches_update_deny"')
      expect(migrationSql).toContain('CREATE POLICY "import_batches_delete_deny"')

      // staging_records policies
      expect(migrationSql).toContain('CREATE POLICY "staging_records_insert_deny"')
      expect(migrationSql).toContain('CREATE POLICY "staging_records_update_deny"')
      expect(migrationSql).toContain('CREATE POLICY "staging_records_delete_deny"')
    })
  })

  describe('4. Lifecycle & Idempotency Guards', () => {
    it('rejects creating batch when identical file hash is already in progress', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'CONFLICT: An active import batch with this exact file hash already exists (Batch ID: batch-123)' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        createImportBatch({
          fileName: 'duplicate_census.csv',
          fileFormat: 'CSV',
          fileHash: 'c'.repeat(64),
        })
      ).rejects.toThrow('An import batch with this exact file hash is already in progress.')
    })

    it('rejects creating batch when identical file hash has already been promoted', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'CONFLICT: This exact file has already been imported and promoted in batch batch-456' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        createImportBatch({
          fileName: 'promoted_census.csv',
          fileFormat: 'CSV',
          fileHash: 'd'.repeat(64),
        })
      ).rejects.toThrow('This exact file has already been imported and promoted in a previous batch.')
    })

    it('rejects cancelling an already cancelled batch', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'CONFLICT: Import batch batch-789 is already cancelled' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        cancelImportBatch({
          batchId: '00000000-0000-0000-0000-000000000789',
        })
      ).rejects.toThrow('This import batch has already been cancelled.')
    })

    it('rejects cancelling an already promoted batch', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'CONFLICT: Cannot cancel an already promoted import batch (Batch ID: batch-999)' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        cancelImportBatch({
          batchId: '00000000-0000-0000-0000-000000000999',
        })
      ).rejects.toThrow('Cannot cancel an import batch that has already been promoted.')
    })
  })

  describe('5. Error Sanitization & Data Protection', () => {
    it('sanitizes unexpected database errors without leaking internal schema details', () => {
      const sanitized = sanitizeImportError(
        new Error('pg_catalog: relation "public.staging_records" constraint check failure on row_number'),
        'An error occurred during import processing.'
      )
      expect(sanitized).toBe('An error occurred during import processing.')
      expect(sanitized).not.toContain('pg_catalog')
      expect(sanitized).not.toContain('staging_records')
    })
  })

  describe('6. Secret & Key Hygiene', () => {
    it('verifies import service and types contain zero service_role references or secrets', () => {
      const servicePath = resolve(
        __dirname,
        '../../src/features/admin/services/import.service.ts'
      )
      const serviceCode = readFileSync(servicePath, 'utf8')

      expect(serviceCode).not.toContain('service_role')
      expect(serviceCode).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(serviceCode).not.toContain('Bearer')
      expect(serviceCode).not.toContain('eyJ')

      const parserPath = resolve(
        __dirname,
        '../../src/features/admin/services/importParser.service.ts'
      )
      const parserCode = readFileSync(parserPath, 'utf8')
      expect(parserCode).not.toContain('service_role')
      expect(parserCode).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(parserCode).not.toContain('Bearer')
      expect(parserCode).not.toContain('eyJ')
    })
  })

  describe('7. Subtask 2 Invariants: Staging Ingestion RPC & Parser Security', () => {
    it('verifies staging ingestion migration contains no canonical table mutations', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017180000_create_staging_ingestion_rpc.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')
      const executableSql = migrationSql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')

      // Canonical tables must NOT be modified
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.persons/i)
      expect(executableSql).not.toMatch(/UPDATE\s+public\.persons/i)
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.families/i)
      expect(executableSql).not.toMatch(/UPDATE\s+public\.families/i)
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.relationships/i)
      expect(executableSql).not.toMatch(/UPDATE\s+public\.relationships/i)

      // Must NOT touch auth.users or profiles
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+auth\.users/i)
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.profiles/i)
      expect(executableSql).not.toMatch(/user_id/i)

      // Must explicitly enforce canonical_id = NULL
      expect(migrationSql).toContain('canonical_id must remain strictly NULL during staging')

      // Must revoke from PUBLIC and anon
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.stage_import_records(UUID, JSONB) FROM PUBLIC, anon;')
      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.stage_import_records(UUID, JSONB) TO authenticated;')

      // Must NOT grant to service_role (authenticated admin only)
      expect(migrationSql).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.stage_import_records.*TO\s+service_role/i)
    })

    it('verifies SQL migration enforces hard server-side 500-record limit', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017180000_create_staging_ingestion_rpc.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      expect(migrationSql).toContain('jsonb_array_length(p_records) > 500')
      expect(migrationSql).toContain('Chunk size exceeds maximum allowed limit of 500 records')
    })

    it('verifies SQL migration strictly rejects malformed records and enforces structure', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017180000_create_staging_ingestion_rpc.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Rejects non-objects
      expect(migrationSql).toContain("jsonb_typeof(v_elem) != 'object'")
      expect(migrationSql).toContain('is not a JSON object')

      // Rejects missing or invalid entity_type
      expect(migrationSql).toContain("v_entity_text NOT IN ('PERSON', 'FAMILY', 'RELATIONSHIP')")
      expect(migrationSql).toContain('missing or invalid entity_type')

      // Rejects missing, non-numeric, or non-positive source_row_number
      expect(migrationSql).toContain("v_row_num_text !~ '^[1-9][0-9]*$'")
      expect(migrationSql).toContain('missing, non-numeric, or non-positive source_row_number')

      // Validates parsed_data is object if present
      expect(migrationSql).toContain("jsonb_typeof(v_parsed_data) != 'object'")

      // Validates raw_data is object if present
      expect(migrationSql).toContain("jsonb_typeof(v_elem->'raw_data') != 'object'")

      // Validates validation_errors is array if present
      expect(migrationSql).toContain("jsonb_typeof(v_elem->'validation_errors') != 'array'")
    })

    it('verifies SQL migration forces validation_status to PENDING and preserves canonical_id as NULL', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017180000_create_staging_ingestion_rpc.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Client-supplied VALID/WARNING/ERROR/EXCLUDED cannot bypass server PENDING
      expect(migrationSql).toContain("'PENDING'::public.staging_validation_status, -- Forced server-side authority")
      expect(migrationSql).toContain("validation_status = 'PENDING'::public.staging_validation_status, -- Reset to PENDING on upsert")

      // Canonical id strictly NULL
      expect(migrationSql).toContain('NULL -- canonical_id must remain strictly NULL during staging')

      // Upsert on conflict preservation
      expect(migrationSql).toContain('ON CONFLICT (batch_id, entity_type, source_row_number)')
      expect(migrationSql).toContain('DO UPDATE SET')
    })
  })

  describe('8. Subtask 3 Security & Architectural Invariants: Validation & Review RPCs', () => {
    it('verifies validation RPC migration contains zero writes to canonical domain tables', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')
      const executableSql = migrationSql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')

      // Canonical tables must NOT be modified
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.persons/i)
      expect(executableSql).not.toMatch(/UPDATE\s+public\.persons/i)
      expect(executableSql).not.toMatch(/DELETE\s+FROM\s+public\.persons/i)

      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.families/i)
      expect(executableSql).not.toMatch(/UPDATE\s+public\.families/i)
      expect(executableSql).not.toMatch(/DELETE\s+FROM\s+public\.families/i)

      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.relationships/i)
      expect(executableSql).not.toMatch(/UPDATE\s+public\.relationships/i)

      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.family_members/i)
      expect(executableSql).not.toMatch(/UPDATE\s+public\.family_members/i)

      // Must NOT touch auth.users or profiles
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+auth\.users/i)
      expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.profiles/i)
      expect(executableSql).not.toMatch(/user_id\s*=\s*/i)
    })

    it('verifies validation RPC migration enforces role boundaries and least privilege', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // SECURITY DEFINER with safe search_path
      expect(migrationSql).toContain('SECURITY DEFINER')
      expect(migrationSql).toContain('SET search_path = public, auth')

      // is_admin check
      expect(migrationSql).toContain('IF NOT public.is_admin() THEN')

      // Revocations from PUBLIC and anon
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.validate_import_batch(UUID) FROM PUBLIC, anon;')
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.set_staging_record_status(UUID, public.staging_validation_status, TEXT) FROM PUBLIC, anon;')
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.finalize_batch_validation(UUID) FROM PUBLIC, anon;')

      // No grant to service_role
      expect(migrationSql).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.validate_import_batch.*TO\s+service_role/i)
    })

    it('verifies duplicate detection flags as WARNING without auto-merging (DETECT != MERGE)', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')
      const executableSql = migrationSql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')

      expect(migrationSql).toContain("'code', 'DUPLICATE_CANDIDATE'")
      expect(migrationSql).toContain("'severity', 'WARNING'")
      expect(executableSql).not.toMatch(/\bMERGE\s+INTO\b/i)
      expect(executableSql).not.toMatch(/\bMERGE\b/i)
    })

    it('verifies relationship types are strictly limited to canonical PARENT, SPOUSE, SIBLING (no CHILD)', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Canonical enum check
      expect(migrationSql).toContain("v_rel_type NOT IN ('PARENT', 'SPOUSE', 'SIBLING')")
      expect(migrationSql).not.toMatch(/v_rel_type\s+NOT\s+IN\s*\([^)]*'CHILD'[^)]*\)/i)
      expect(migrationSql).toContain('canonical schema does not support CHILD; map to PARENT with reversed endpoints')
    })

    it('verifies safe is_living handling without unsafe boolean casting', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Must NOT contain unsafe ::BOOLEAN cast (e.g. ::BOOLEAN)
      expect(migrationSql).not.toMatch(/::BOOLEAN/i)
      expect(migrationSql).toContain("'code', 'INVALID_BOOLEAN_VALUE'")
    })

    it('verifies canonical person status is aligned with ACTIVE and DECEASED with LIVING mapping', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Canonical status check
      expect(migrationSql).toContain("v_person_status_raw = 'ACTIVE'")
      expect(migrationSql).toContain("v_person_status_raw = 'LIVING'")
      expect(migrationSql).toContain("v_canonical_status := 'ACTIVE'")
      expect(migrationSql).toContain("v_person_status_raw = 'DECEASED'")
      expect(migrationSql).toContain("v_canonical_status := 'DECEASED'")
      expect(migrationSql).toContain("'code', 'INVALID_PERSON_STATUS'")
      expect(migrationSql).toContain('expected ACTIVE or DECEASED (source LIVING maps to ACTIVE)')
      // Does not treat LIVING as canonical database status
      expect(migrationSql).not.toMatch(/expected LIVING or DECEASED/i)
    })

    it('verifies person validation requires BOTH first_name and last_name (canonical schema)', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Must require first_name and last_name separately
      expect(migrationSql).toContain("'code', 'MISSING_FIRST_NAME'")
      expect(migrationSql).toContain("'code', 'MISSING_LAST_NAME'")
      expect(migrationSql).not.toContain("'code', 'MISSING_NAME'")
    })

    it('verifies duplicate candidate payload preserves privacy (no canonical full name in message)', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Must contain canonical_candidate_id, confidence, and match_signals
      expect(migrationSql).toContain("'canonical_candidate_id', v_cand_match.id")
      expect(migrationSql).toContain("'confidence'")
      expect(migrationSql).toContain("'match_signals'")
      // Must NOT interpolate canonical person's name into message
      expect(migrationSql).not.toMatch(/Potential duplicate match with canonical person "%s %s"/i)
    })

    it('verifies set_staging_record_status prevents contradictory VALID status on records with unresolved ERRORs', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Requires notes to resolve ERROR to VALID
      expect(migrationSql).toContain("p_status = 'VALID' AND v_has_blocking_errors")
      expect(migrationSql).toContain('Mandatory review notes (minimum 3 characters) required to resolve blocking validation errors')
      expect(migrationSql).toContain("'severity', 'RESOLVED'")
      expect(migrationSql).toContain("'code', 'ADMIN_ERROR_RESOLVED'")
    })

    it('verifies finalize_batch_validation checks PENDING, ERROR, and unresolved error payloads', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Checks pending records
      expect(migrationSql).toContain('v_pending_status_count > 0')
      expect(migrationSql).toContain('unvalidated (PENDING) records')

      // Checks error status and unresolved error payloads
      expect(migrationSql).toContain('v_error_status_count > 0 OR v_unresolved_error_count > 0')

      // Checks eligible records count
      expect(migrationSql).toContain('v_eligible_count = 0')
      expect(migrationSql).toContain('zero valid or warning records to import')
    })

    it('verifies all RAISE EXCEPTION statements have matching format parameters without compile errors', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      // Match all RAISE EXCEPTION lines
      const raiseRegex = /RAISE\s+EXCEPTION\s+(['"])([\s\S]*?)\1\s*(?:,\s*([^;]+?))?\s*USING/g
      let match: RegExpExecArray | null
      while ((match = raiseRegex.exec(migrationSql)) !== null) {
        const message = match[2]
        const argsStr = match[3]
        const placeholderCount = (message.match(/%/g) || []).length
        const args = argsStr ? argsStr.split(',').map((a) => a.trim()).filter(Boolean) : []

        expect(args.length).toBe(placeholderCount)
      }
    })

    it('verifies set_staging_record_status prevents manufacturing VALID, WARNING, or ERROR from PENDING', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      expect(migrationSql).toContain("v_rec.validation_status = 'PENDING' AND p_status IN ('VALID', 'WARNING', 'ERROR')")
      expect(migrationSql).toContain('PENDING records must be processed by validate_import_batch() before they can become VALID, WARNING, or ERROR.')
    })

    it('verifies set_staging_record_status prevents bypassing validation from EXCLUDED to VALID, WARNING, or ERROR', () => {
      const migrationPath = resolve(
        __dirname,
        '../../supabase/migrations/20261017200000_create_import_validation_and_review_rpcs.sql'
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')

      expect(migrationSql).toContain("v_rec.validation_status = 'EXCLUDED' AND p_status IN ('VALID', 'WARNING', 'ERROR')")
      expect(migrationSql).toContain('EXCLUDED records must be reprocessed by validate_import_batch() before becoming VALID, WARNING, or ERROR.')
    })
  })

  describe('6. Phase 14 Subtask 4: Promotion Security, Eligibility & Provenance', () => {
    const promotionMigrationPath = resolve(
      __dirname,
      '../../supabase/migrations/20261017220000_create_import_promotion_rpc.sql'
    )
    const promotionSql = readFileSync(promotionMigrationPath, 'utf8')

    it('verifies promote_import_batch is SECURITY DEFINER with safe search_path', () => {
      expect(promotionSql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.promote_import_batch/i)
      expect(promotionSql).toContain('SECURITY DEFINER')
      expect(promotionSql).toContain('SET search_path = public, auth')
    })

    it('verifies promote_import_batch revokes from PUBLIC/anon and grants to authenticated only', () => {
      expect(promotionSql).toContain('REVOKE ALL ON FUNCTION public.promote_import_batch(UUID) FROM PUBLIC, anon;')
      expect(promotionSql).toContain('GRANT EXECUTE ON FUNCTION public.promote_import_batch(UUID) TO authenticated;')
      expect(promotionSql).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.promote_import_batch\(UUID\)\s+TO\s+service_role/i)
      expect(promotionSql).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.promote_import_batch\(UUID\)\s+TO\s+anon/i)
    })

    it('verifies promote_import_batch enforces admin role check internally', () => {
      expect(promotionSql).toContain('IF v_caller_id IS NULL THEN')
      expect(promotionSql).toContain('UNAUTHENTICATED:')
      expect(promotionSql).toContain('IF NOT public.is_admin() THEN')
      expect(promotionSql).toContain('FORBIDDEN:')
    })

    it('verifies promotion enforces batch status = VALIDATED and locks FOR UPDATE', () => {
      expect(promotionSql).toContain("FOR UPDATE;")
      expect(promotionSql).toContain("v_batch.status != 'VALIDATED'")
      expect(promotionSql).toContain('Batch must be VALIDATED.')
    })

    it('verifies promotion enforces zero PENDING and zero ERROR records before inserting', () => {
      expect(promotionSql).toContain("validation_status = 'PENDING'")
      expect(promotionSql).toContain("validation_status = 'ERROR'")
      expect(promotionSql).toContain('PRECONDITION_FAILED: Cannot promote batch with')
    })

    it('verifies promotion enforces PERSON != USER: user_id is explicitly NULL', () => {
      expect(promotionSql).toContain('user_id,\n      created_by,')
      expect(promotionSql).toContain('NULL,\n      v_caller_id,')
      expect(promotionSql).not.toMatch(/INSERT\s+INTO\s+auth\.users/i)
      expect(promotionSql).not.toMatch(/INSERT\s+INTO\s+public\.profiles/i)
    })

    it('verifies DETECT != MERGE: DUPLICATE_CANDIDATE creates OPEN duplicate_flags without merging', () => {
      expect(promotionSql).toContain("INSERT INTO public.duplicate_flags")
      expect(promotionSql).toContain("'OPEN'::public.duplicate_flag_status")
      expect(promotionSql).toContain("DETECT != MERGE: distinct canonical records preserved.")
      expect(promotionSql).not.toMatch(/UPDATE\s+public\.persons\s+SET\s+first_name/i)
      expect(promotionSql).not.toMatch(/DELETE\s+FROM\s+public\.persons/i)
    })

    it('verifies symmetric relationship ordering (person_a_id < person_b_id) for SPOUSE and SIBLING', () => {
      expect(promotionSql).toContain("IF v_rel_type IN ('SPOUSE', 'SIBLING') AND v_canonical_person_a > v_canonical_person_b THEN")
      expect(promotionSql).toContain('v_swap_temp := v_canonical_person_a;')
    })

    it('verifies family head linkage creates family_members row with role=HEAD, is_head=TRUE', () => {
      expect(promotionSql).toContain("INSERT INTO public.family_members")
      expect(promotionSql).toContain("'HEAD'::public.family_role")
      expect(promotionSql).toContain("TRUE,")
    })

    it('verifies family head reference resolves strictly against same-batch promoted persons with zero canonical fallback', () => {
      // Must resolve against temp_import_id_map (same batch only)
      expect(promotionSql).toContain("FROM temp_import_id_map\n      WHERE entity_type = 'PERSON'\n        AND (source_record_id = v_head_ref OR staging_id::TEXT = v_head_ref);")

      // Must NOT contain any fallback query against public.persons for family head
      const headSectionMatch = promotionSql.match(/-- STEP 3: FAMILY HEAD MEMBERSHIP LINKAGE[\s\S]*?-- STEP 4: PROMOTE RELATIONSHIP RECORDS/)
      expect(headSectionMatch).not.toBeNull()
      const headSection = headSectionMatch![0]

      expect(headSection).not.toMatch(/SELECT\s+id\s+INTO\s+v_head_canonical_id\s+FROM\s+public\.persons/i)
      expect(headSection).not.toContain('FROM public.persons')
      expect(headSection).toContain('Family head reference must belong to the same import batch.')
    })

    it('verifies immutable audit log is generated via log_audit_event()', () => {
      expect(promotionSql).toContain("PERFORM public.log_audit_event(")
      expect(promotionSql).toContain("'ADMIN_ACTION'::public.audit_action")
      expect(promotionSql).toContain("'PROMOTE_IMPORT_BATCH'")
    })

    it('verifies all RAISE EXCEPTION statements in promotion migration have matching placeholder counts', () => {
      const raiseRegex = /RAISE\s+EXCEPTION\s+(['"])([\s\S]*?)\1\s*(?:,\s*([^;]+?))?\s*USING/g
      let match: RegExpExecArray | null
      while ((match = raiseRegex.exec(promotionSql)) !== null) {
        const message = match[2]
        const argsStr = match[3]
        const placeholderCount = (message.match(/%/g) || []).length
        const args = argsStr ? argsStr.split(',').map((a) => a.trim()).filter(Boolean) : []

        expect(args.length).toBe(placeholderCount)
      }
    })
  })
})

