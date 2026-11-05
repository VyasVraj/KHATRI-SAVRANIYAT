-- =============================================================================
-- Migration: 20261017180000_create_staging_ingestion_rpc.sql
-- Purpose:   Authoritative RPC for bulk ingestion of staged import records
--             and atomic synchronization of batch aggregate metrics.
-- Phase:     Phase 14 — Subtask 2 (Parsing, Mapping & Staging Ingestion)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. PERSON != USER:
--    - Ingests demographic census data only into public.staging_records.
--    - Never creates auth.users, never creates public.profiles, never sets user_id.
--
-- 2. DETECT != MERGE:
--    - Staging records are isolated with validation_status = 'PENDING' or 'ERROR'.
--    - No automated deduplication or destructive merges occur.
--
-- 3. CANONICAL TABLES ARE UNTOUCHED:
--    - Ingestion operates strictly within public.staging_records.
--    - canonical_id is strictly set to NULL.
--    - Canonical tables (persons, families, relationships) are not altered.
--
-- 4. ATOMICITY & IDEMPOTENCY:
--    - Bulk upserts records on unique constraint (batch_id, entity_type, source_row_number).
--    - Automatically re-aggregates total_records, row_counts, and validation_summary on import_batches.
--    - Row locking (FOR UPDATE) guarantees concurrent safety.
--
-- 5. ADMIN-ONLY AUTHORIZATION:
--    - Restricted to active SUPER_ADMIN and ADMIN roles via public.is_admin().
--    - SECURITY DEFINER with safe search_path = public, auth.
--    - PUBLIC and anon access revoked.
--
-- =============================================================================

CREATE OR REPLACE FUNCTION public.stage_import_records(
  p_batch_id UUID,
  p_records JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_inserted_count INT := 0;
  v_total_records INT := 0;
  v_row_counts JSONB;
  v_validation_summary JSONB;
  v_idx INT := 0;
  v_elem JSONB;
  v_entity_text TEXT;
  v_row_num_text TEXT;
  v_parsed_data JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to stage import records'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to stage import records'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_records IS NULL OR jsonb_typeof(p_records) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_records must be a JSON array of staging records'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Server-side chunk limit: Maximum 500 records per call
  IF jsonb_array_length(p_records) > 500 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Chunk size exceeds maximum allowed limit of 500 records (received %)', jsonb_array_length(p_records)
      USING ERRCODE = '22023';
  END IF;

  -- 5. Strict record structure validation (reject entire chunk on malformed record)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_records) LOOP
    v_idx := v_idx + 1;

    -- Must be a JSON object
    IF jsonb_typeof(v_elem) != 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % is not a JSON object', v_idx
        USING ERRCODE = '22023';
    END IF;

    -- Entity type validation
    v_entity_text := trim(v_elem->>'entity_type');
    IF v_entity_text IS NULL OR v_entity_text NOT IN ('PERSON', 'FAMILY', 'RELATIONSHIP') THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has missing or invalid entity_type "%"', v_idx, COALESCE(v_entity_text, 'NULL')
        USING ERRCODE = '22023';
    END IF;

    -- Source row number validation
    v_row_num_text := trim(v_elem->>'source_row_number');
    IF v_row_num_text IS NULL OR v_row_num_text !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has missing, non-numeric, or non-positive source_row_number "%"', v_idx, COALESCE(v_row_num_text, 'NULL')
        USING ERRCODE = '22023';
    END IF;

    -- Parsed data validation (must be object if present)
    v_parsed_data := v_elem->'parsed_data';
    IF v_parsed_data IS NOT NULL AND jsonb_typeof(v_parsed_data) != 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has invalid parsed_data (must be an object)', v_idx
        USING ERRCODE = '22023';
    END IF;

    -- Raw data validation (must be object if present)
    IF v_elem->'raw_data' IS NOT NULL AND jsonb_typeof(v_elem->'raw_data') != 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has invalid raw_data (must be an object)', v_idx
        USING ERRCODE = '22023';
    END IF;

    -- Validation errors validation (must be array if present)
    IF v_elem->'validation_errors' IS NOT NULL AND jsonb_typeof(v_elem->'validation_errors') != 'array' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has invalid validation_errors (must be an array)', v_idx
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 6. Retrieve and lock target batch
  SELECT id, status, file_name, file_hash, total_records INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 7. Lifecycle status check: Ingestion is only permitted for STAGED batches
  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot stage records into import batch % with status %', p_batch_id, v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 8. Bulk upsert staging records
  -- NOTE: validation_status is ALWAYS forced to 'PENDING'. Client cannot bypass PENDING.
  -- Canonical_id is strictly NULL.
  WITH inserted_rows AS (
    INSERT INTO public.staging_records (
      batch_id,
      entity_type,
      source_row_number,
      source_record_id,
      parsed_data,
      raw_data,
      validation_status,
      validation_errors,
      canonical_id
    )
    SELECT
      p_batch_id,
      (elem->>'entity_type')::public.import_entity_type,
      (elem->>'source_row_number')::INT,
      NULLIF(trim(elem->>'source_record_id'), ''),
      COALESCE(elem->'parsed_data', '{}'::jsonb),
      COALESCE(elem->'raw_data', '{}'::jsonb),
      'PENDING'::public.staging_validation_status, -- Forced server-side authority
      COALESCE(elem->'validation_errors', '[]'::jsonb),
      NULL -- canonical_id must remain strictly NULL during staging
    FROM jsonb_array_elements(p_records) AS elem
    ON CONFLICT (batch_id, entity_type, source_row_number)
    DO UPDATE SET
      source_record_id = EXCLUDED.source_record_id,
      parsed_data = EXCLUDED.parsed_data,
      raw_data = EXCLUDED.raw_data,
      validation_status = 'PENDING'::public.staging_validation_status, -- Reset to PENDING on upsert
      validation_errors = EXCLUDED.validation_errors,
      updated_at = NOW()
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted_rows;

  -- 9. Re-calculate aggregate metrics from staging_records
  SELECT
    count(*),
    jsonb_build_object(
      'persons', count(*) FILTER (WHERE entity_type = 'PERSON'),
      'families', count(*) FILTER (WHERE entity_type = 'FAMILY'),
      'relationships', count(*) FILTER (WHERE entity_type = 'RELATIONSHIP')
    ),
    jsonb_build_object(
      'errors', count(*) FILTER (WHERE validation_status = 'ERROR'),
      'warnings', count(*) FILTER (WHERE validation_status = 'WARNING'),
      'valid', count(*) FILTER (WHERE validation_status = 'VALID' OR validation_status = 'PENDING'),
      'duplicates', 0
    )
  INTO
    v_total_records,
    v_row_counts,
    v_validation_summary
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  -- 10. Synchronize aggregate metrics onto import_batches
  UPDATE public.import_batches
  SET
    total_records = v_total_records,
    row_counts = v_row_counts,
    validation_summary = v_validation_summary,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 11. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    NULL,
    jsonb_build_object(
      'inserted_chunk_size', v_inserted_count,
      'total_staged_records', v_total_records,
      'row_counts', v_row_counts,
      'validation_summary', v_validation_summary
    ),
    jsonb_build_object(
      'action_type', 'STAGE_IMPORT_RECORDS',
      'batch_id', p_batch_id,
      'caller_id', v_caller_id
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'inserted_count', v_inserted_count,
    'total_records', v_total_records,
    'row_counts', v_row_counts,
    'validation_summary', v_validation_summary
  );
END;
$$;

COMMENT ON FUNCTION public.stage_import_records(UUID, JSONB) IS
  'Server-authoritative RPC: Bulk ingests staged records into public.staging_records and atomically synchronizes batch metrics. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- Privileges & Access Grants
-- -----------------------------------------------------------------------------

-- Revoke all from PUBLIC and anon (least privilege)
REVOKE ALL ON FUNCTION public.stage_import_records(UUID, JSONB) FROM PUBLIC, anon;

-- Grant EXECUTE to authenticated administrators only (no service_role dependency)
GRANT EXECUTE ON FUNCTION public.stage_import_records(UUID, JSONB) TO authenticated;
