-- =============================================================================
-- Migration: 20261017100000_create_import_staging_infrastructure.sql
-- Purpose:   Create import batches and staging records database foundation,
--             authoritative batch lifecycle RPCs, and admin-only RLS policies.
-- Phase:     Phase 14 — Subtask 1 (Import & Data Migration Foundation)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. PERSON != USER:
--    - Staged and imported records represent census entities (public.persons).
--    - Staging and import RPCs NEVER create auth.users, NEVER create public.profiles,
--      NEVER assign persons.user_id, and NEVER approve identity claims.
--
-- 2. DETECT != MERGE:
--    - No automated deduplication or destructive merges occur.
--
-- 3. CANONICAL TABLES ARE UNTOUCHED:
--    - Subtask 1 operates strictly in isolated staging storage.
--    - Canonical tables (persons, families, relationships) are not altered.
--    - Addition of any canonical provenance markers (e.g., import_batch_id) is
--      deferred to the promotion subtask (Subtask 4) to eliminate premature schema coupling.
--
-- 4. HYBRID STAGING ARCHITECTURE (WHY THIS DESIGN WAS CHOSEN):
--    - A generic JSONB payload within an entity-scoped staging table (public.staging_records)
--      was selected over rigid separate tables (staging_persons, staging_families, etc.).
--    - RATIONALE:
--      * Source datasets (CSV/JSON) vary significantly in schema and often contain raw/unparsed
--        values, custom headers, or malformed strings that would crash strict DDL constraints.
--      * Preserves entity-level scoping via `entity_type` ('PERSON', 'FAMILY', 'RELATIONSHIP')
--        with exact `source_row_number` and `source_record_id` traceability.
--      * Structured JSONB allows flexible field mapping and partial updates during validation.
--      * Batch isolation and cascade cleanup: all staging rows are bound to a batch and
--        automatically removed upon batch deletion (`ON DELETE CASCADE`).
--
-- 5. ADMIN-ONLY AUTHORIZATION:
--    - Only active SUPER_ADMIN and ADMIN accounts can create or cancel batches or view staging.
--    - COMMUNITY_MODERATOR and lower roles have zero import access.
--    - All mutations are server-authoritative via SECURITY DEFINER RPCs with search_path = public, auth.
--    - Direct client INSERT/UPDATE/DELETE on staging tables is denied by default via RLS.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Custom Enums
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'import_batch_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.import_batch_status AS ENUM (
      'STAGED',     -- File uploaded and rows staged; awaiting validation
      'VALIDATED',  -- Validation complete; duplicate candidates flagged; ready for review
      'PROMOTED',   -- Validated records promoted into canonical tables
      'CANCELLED',  -- Batch discarded by administrator
      'REVERTED'    -- Previously promoted batch soft-reverted
    );
  END IF;
END $$;

COMMENT ON TYPE public.import_batch_status IS
  'Lifecycle states for an import batch: STAGED -> VALIDATED -> PROMOTED (or CANCELLED/REVERTED).';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'import_entity_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.import_entity_type AS ENUM (
      'PERSON',
      'FAMILY',
      'RELATIONSHIP'
    );
  END IF;
END $$;

COMMENT ON TYPE public.import_entity_type IS
  'Scoping of census entities handled during data migration.';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'staging_validation_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.staging_validation_status AS ENUM (
      'PENDING',    -- Awaiting validation checks
      'VALID',      -- Passed schema and relational validation
      'WARNING',    -- Non-blocking issues detected (e.g. possible duplicate)
      'ERROR',      -- Blocking constraint or syntax errors detected
      'EXCLUDED'    -- Explicitly excluded by administrator from final promotion
    );
  END IF;
END $$;

COMMENT ON TYPE public.staging_validation_status IS
  'Validation evaluation outcome for an individual staged row.';

-- -----------------------------------------------------------------------------
-- 2. Table: public.import_batches
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance & File Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size_bytes BIGINT,

  -- Lifecycle State
  status public.import_batch_status NOT NULL DEFAULT 'STAGED',

  -- Aggregate Metrics & Summaries
  total_records INT NOT NULL DEFAULT 0,
  row_counts JSONB NOT NULL DEFAULT '{"persons": 0, "families": 0, "relationships": 0}'::jsonb,
  validation_summary JSONB NOT NULL DEFAULT '{"errors": 0, "warnings": 0, "valid": 0, "duplicates": 0}'::jsonb,

  -- Optional Context & Notes
  notes TEXT,

  -- Lifecycle Timestamps & Actors
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,

  promoted_at TIMESTAMPTZ,
  promoted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT import_batches_file_name_not_empty
    CHECK (file_name != '' AND length(trim(file_name)) > 0 AND length(file_name) <= 255),
  CONSTRAINT import_batches_file_format_valid
    CHECK (file_format IN ('CSV', 'JSON')),
  CONSTRAINT import_batches_file_hash_format
    CHECK (file_hash ~ '^[a-fA-F0-9]{64}$'),
  CONSTRAINT import_batches_file_size_positive
    CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  CONSTRAINT import_batches_total_records_non_negative
    CHECK (total_records >= 0),
  CONSTRAINT import_batches_row_counts_is_object
    CHECK (jsonb_typeof(row_counts) = 'object'),
  CONSTRAINT import_batches_validation_summary_is_object
    CHECK (jsonb_typeof(validation_summary) = 'object'),
  CONSTRAINT import_batches_notes_length
    CHECK (notes IS NULL OR length(notes) <= 2000),
  CONSTRAINT import_batches_cancellation_reason_length
    CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 1000),
  CONSTRAINT import_batches_cancellation_consistency
    CHECK (
      (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
      OR (status != 'CANCELLED' AND cancelled_at IS NULL)
    ),
  CONSTRAINT import_batches_promoted_consistency
    CHECK (
      (status = 'PROMOTED' AND promoted_at IS NOT NULL)
      OR (status != 'PROMOTED' AND promoted_at IS NULL)
    )
);

COMMENT ON TABLE public.import_batches IS
  'Authoritative container tracking bulk census data imports, file provenance, and lifecycle states.';

-- Updated-At Trigger for import_batches
DROP TRIGGER IF EXISTS import_batches_handle_updated_at ON public.import_batches;
CREATE TRIGGER import_batches_handle_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for import_batches
CREATE INDEX IF NOT EXISTS idx_import_batches_created_by
  ON public.import_batches (created_by);

CREATE INDEX IF NOT EXISTS idx_import_batches_status
  ON public.import_batches (status, created_at DESC);

-- Partial Unique Index: Prevents simultaneous in-progress imports of identical files.
-- Allows re-uploading if a previous batch was CANCELLED or REVERTED.
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_active_hash
  ON public.import_batches (file_hash)
  WHERE status IN ('STAGED', 'VALIDATED');

-- -----------------------------------------------------------------------------
-- 3. Table: public.staging_records
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staging_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,

  -- Scoping & Source Traceability
  entity_type public.import_entity_type NOT NULL,
  source_row_number INT NOT NULL,
  source_record_id TEXT,

  -- Payload Data
  parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_data JSONB,

  -- Validation State
  validation_status public.staging_validation_status NOT NULL DEFAULT 'PENDING',
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Canonical Linkage Placeholder (Populated upon promotion in Subtask 4)
  canonical_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT staging_records_source_row_positive
    CHECK (source_row_number > 0),
  CONSTRAINT staging_records_source_record_id_length
    CHECK (source_record_id IS NULL OR (length(trim(source_record_id)) > 0 AND length(source_record_id) <= 100)),
  CONSTRAINT staging_records_parsed_data_is_object
    CHECK (jsonb_typeof(parsed_data) = 'object'),
  CONSTRAINT staging_records_validation_errors_is_array
    CHECK (jsonb_typeof(validation_errors) = 'array'),
  CONSTRAINT staging_records_unique_source_row
    UNIQUE (batch_id, entity_type, source_row_number)
);

COMMENT ON TABLE public.staging_records IS
  'Isolated staging storage holding unpromoted census records with validation metadata and source row lineage.';

-- Updated-At Trigger for staging_records
DROP TRIGGER IF EXISTS staging_records_handle_updated_at ON public.staging_records;
CREATE TRIGGER staging_records_handle_updated_at
  BEFORE UPDATE ON public.staging_records
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for staging_records
CREATE INDEX IF NOT EXISTS idx_staging_records_batch_entity
  ON public.staging_records (batch_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_staging_records_batch_status
  ON public.staging_records (batch_id, validation_status);

CREATE INDEX IF NOT EXISTS idx_staging_records_source_id
  ON public.staging_records (batch_id, entity_type, source_record_id)
  WHERE source_record_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- -----------------------------------------------------------------------------

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_records ENABLE ROW LEVEL SECURITY;

-- Policies for public.import_batches:
-- Read: Active ADMIN or SUPER_ADMIN can inspect all import batches.
DROP POLICY IF EXISTS "import_batches_select_admin" ON public.import_batches;
CREATE POLICY "import_batches_select_admin"
  ON public.import_batches
  FOR SELECT
  USING (public.is_admin());

-- Mutations: Direct client mutations are blocked. All writes flow through authoritative RPCs.
DROP POLICY IF EXISTS "import_batches_insert_deny" ON public.import_batches;
CREATE POLICY "import_batches_insert_deny"
  ON public.import_batches
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "import_batches_update_deny" ON public.import_batches;
CREATE POLICY "import_batches_update_deny"
  ON public.import_batches
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "import_batches_delete_deny" ON public.import_batches;
CREATE POLICY "import_batches_delete_deny"
  ON public.import_batches
  FOR DELETE
  USING (FALSE);

-- Policies for public.staging_records:
-- Read: Active ADMIN or SUPER_ADMIN can query staging rows.
DROP POLICY IF EXISTS "staging_records_select_admin" ON public.staging_records;
CREATE POLICY "staging_records_select_admin"
  ON public.staging_records
  FOR SELECT
  USING (public.is_admin());

-- Mutations: Direct client mutations are blocked. Ingestion and updates flow through authoritative RPCs.
DROP POLICY IF EXISTS "staging_records_insert_deny" ON public.staging_records;
CREATE POLICY "staging_records_insert_deny"
  ON public.staging_records
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "staging_records_update_deny" ON public.staging_records;
CREATE POLICY "staging_records_update_deny"
  ON public.staging_records
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "staging_records_delete_deny" ON public.staging_records;
CREATE POLICY "staging_records_delete_deny"
  ON public.staging_records
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 5. Server-Authoritative RPC: public.create_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_import_batch(
  p_file_name TEXT,
  p_file_format TEXT,
  p_file_hash TEXT,
  p_file_size_bytes BIGINT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch_id UUID;
  v_clean_name TEXT;
  v_clean_format TEXT;
  v_clean_hash TEXT;
  v_clean_notes TEXT;
  v_existing_active_id UUID;
  v_existing_promoted_id UUID;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to create import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to create import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate arguments
  v_clean_name := trim(COALESCE(p_file_name, ''));
  IF length(v_clean_name) = 0 OR length(v_clean_name) > 255 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_name must be between 1 and 255 characters'
      USING ERRCODE = '22023';
  END IF;

  v_clean_format := upper(trim(COALESCE(p_file_format, '')));
  IF v_clean_format NOT IN ('CSV', 'JSON') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_format must be CSV or JSON'
      USING ERRCODE = '22023';
  END IF;

  v_clean_hash := lower(trim(COALESCE(p_file_hash, '')));
  IF v_clean_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_hash must be a valid 64-character hex SHA-256 string'
      USING ERRCODE = '22023';
  END IF;

  IF p_file_size_bytes IS NOT NULL AND p_file_size_bytes <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_size_bytes must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  v_clean_notes := trim(COALESCE(p_notes, ''));
  IF length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  ELSIF length(v_clean_notes) > 2000 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: notes must not exceed 2000 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Idempotency & Duplicate Hash Checks
  -- Check if an active (STAGED/VALIDATED) batch already exists with the same hash
  SELECT id INTO v_existing_active_id
  FROM public.import_batches
  WHERE file_hash = v_clean_hash
    AND status IN ('STAGED', 'VALIDATED')
  LIMIT 1;

  IF v_existing_active_id IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: An active import batch with this exact file hash already exists (Batch ID: %)', v_existing_active_id
      USING ERRCODE = '23505';
  END IF;

  -- Check if an already promoted batch exists with the same hash
  SELECT id INTO v_existing_promoted_id
  FROM public.import_batches
  WHERE file_hash = v_clean_hash
    AND status = 'PROMOTED'
  LIMIT 1;

  IF v_existing_promoted_id IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: This exact file has already been imported and promoted in batch %', v_existing_promoted_id
      USING ERRCODE = '23505';
  END IF;

  -- 5. Insert new batch in STAGED status
  INSERT INTO public.import_batches (
    created_by,
    file_name,
    file_format,
    file_hash,
    file_size_bytes,
    status,
    notes
  ) VALUES (
    v_caller_id,
    v_clean_name,
    v_clean_format,
    v_clean_hash,
    p_file_size_bytes,
    'STAGED',
    v_clean_notes
  )
  RETURNING id INTO v_batch_id;

  -- 6. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    v_batch_id,
    NULL,
    jsonb_build_object(
      'status', 'STAGED',
      'file_name', v_clean_name,
      'file_format', v_clean_format,
      'file_hash', v_clean_hash,
      'file_size_bytes', p_file_size_bytes
    ),
    jsonb_build_object(
      'action_type', 'CREATE_IMPORT_BATCH',
      'batch_id', v_batch_id,
      'caller_id', v_caller_id
    )
  );

  RETURN v_batch_id;
END;
$$;

COMMENT ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) IS
  'Server-authoritative RPC: Initializes a new census import batch in STAGED status with file hash verification and audit logging. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 6. Server-Authoritative RPC: public.cancel_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_import_batch(
  p_batch_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_clean_reason TEXT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to cancel import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to cancel import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate arguments
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF length(v_clean_reason) = 0 THEN
    v_clean_reason := NULL;
  ELSIF length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: cancellation reason must not exceed 1000 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock batch row
  SELECT id, status, file_name, file_hash INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Lifecycle Guard Checks
  IF v_batch.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'CONFLICT: Import batch % is already cancelled', p_batch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status = 'PROMOTED' THEN
    RAISE EXCEPTION 'CONFLICT: Cannot cancel an already promoted import batch (Batch ID: %)', p_batch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status = 'REVERTED' THEN
    RAISE EXCEPTION 'CONFLICT: Cannot cancel an already reverted import batch (Batch ID: %)', p_batch_id
      USING ERRCODE = '23514';
  END IF;

  -- 6. Apply cancellation
  UPDATE public.import_batches
  SET
    status = 'CANCELLED',
    cancelled_at = NOW(),
    cancelled_by = v_caller_id,
    cancellation_reason = v_clean_reason,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 7. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    jsonb_build_object('status', v_batch.status),
    jsonb_build_object(
      'status', 'CANCELLED',
      'cancellation_reason', v_clean_reason
    ),
    jsonb_build_object(
      'action_type', 'CANCEL_IMPORT_BATCH',
      'batch_id', p_batch_id,
      'previous_status', v_batch.status,
      'caller_id', v_caller_id
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.cancel_import_batch(UUID, TEXT) IS
  'Server-authoritative RPC: Cancels an unpromoted import batch with row locking and audit logging. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 7. Privileges & Access Grants
-- -----------------------------------------------------------------------------

-- Revoke all privileges from PUBLIC and anon (least privilege)
REVOKE ALL ON public.import_batches FROM PUBLIC, anon;
REVOKE ALL ON public.staging_records FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_import_batch(UUID, TEXT) FROM PUBLIC, anon;

-- Grant authenticated role SELECT on tables (RLS filters rows using is_admin())
GRANT SELECT ON public.import_batches TO authenticated;
GRANT SELECT ON public.staging_records TO authenticated;

-- Grant authenticated role EXECUTE on authoritative RPCs (RPC verifies is_admin() internally)
GRANT EXECUTE ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_import_batch(UUID, TEXT) TO authenticated;

-- Service role retains full administrative privileges for background operations & migrations
GRANT ALL ON public.import_batches TO service_role;
GRANT ALL ON public.staging_records TO service_role;
GRANT ALL ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;
GRANT ALL ON FUNCTION public.cancel_import_batch(UUID, TEXT) TO service_role;
