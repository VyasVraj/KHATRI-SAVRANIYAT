-- =============================================================================
-- Migration: 20261017200000_create_import_validation_and_review_rpcs.sql
-- Purpose:   Authoritative RPCs for server-side validation, duplicate review,
--             and lifecycle state transitions of staged import batches.
-- Phase:     Phase 14 — Subtask 3 (Validation, Data Quality & Duplicate Review)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. DETECT != MERGE:
--    - Identifies duplicates and sets validation_status = 'WARNING' with structured match signals.
--    - NEVER automatically merges, deletes, or mutates canonical or staging records.
--
-- 2. PERSON != USER:
--    - Validates demographic census data only. Never creates auth.users or profiles.
--
-- 3. CANONICAL ISOLATION:
--    - Operates exclusively on public.staging_records and public.import_batches.
--    - NEVER writes to public.persons, public.families, public.relationships, or public.family_members.
--    - canonical_id remains strictly NULL.
--
-- 4. BATCH LIFECYCLE & ROW LOCKING:
--    - Target import batch is locked FOR UPDATE.
--    - Permitted only for batches in 'STAGED' status.
--    - Transitions batch to 'VALIDATED' only when explicit transition RPC is invoked and 0 blocking errors exist.
--
-- 5. ADMIN-ONLY AUTHORIZATION:
--    - Restricted to active SUPER_ADMIN and ADMIN roles via public.is_admin().
--    - SECURITY DEFINER with safe search_path = public, auth.
--    - Executable by authenticated administrators only. Revoked from PUBLIC and anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Authoritative RPC: public.validate_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_import_batch(
  p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_rec RECORD;
  v_errors JSONB;
  v_status public.staging_validation_status;
  v_errors_count INT := 0;
  v_warnings_count INT := 0;
  v_valid_count INT := 0;
  v_total_records INT := 0;
  v_duplicate_count INT := 0;
  v_row_counts JSONB;
  v_validation_summary JSONB;

  -- Field evaluation variables
  v_first_name TEXT;
  v_last_name TEXT;
  v_dob_str TEXT;
  v_dod_str TEXT;
  v_dob DATE;
  v_dod DATE;
  v_gender TEXT;
  v_family_name TEXT;
  v_person_a TEXT;
  v_person_b TEXT;
  v_rel_type TEXT;
  v_head_id TEXT;
  v_is_living BOOLEAN;
  v_is_living_raw TEXT;
  v_person_status_raw TEXT;
  v_canonical_status TEXT;

  -- Duplicate candidate variables
  v_cand_match RECORD;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to validate import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to validate import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock target batch
  SELECT id, status, total_records INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Lifecycle status check: Only STAGED batches may be validated
  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot validate import batch % with status %', p_batch_id, v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 6. Iterate through all staging records for this batch
  FOR v_rec IN
    SELECT id, entity_type, source_row_number, source_record_id, parsed_data, raw_data, validation_status
    FROM public.staging_records
    WHERE batch_id = p_batch_id
    ORDER BY source_row_number ASC
    FOR UPDATE
  LOOP
    -- If explicitly excluded, preserve EXCLUDED status
    IF v_rec.validation_status = 'EXCLUDED' THEN
      CONTINUE;
    END IF;

    v_errors := '[]'::jsonb;

    -- =========================================================================
    -- ENTITY: PERSON
    -- =========================================================================
    IF v_rec.entity_type = 'PERSON' THEN
      v_first_name := NULLIF(trim(v_rec.parsed_data->>'first_name'), '');
      v_last_name := NULLIF(trim(v_rec.parsed_data->>'last_name'), '');
      v_dob_str := NULLIF(trim(v_rec.parsed_data->>'date_of_birth'), '');
      v_dod_str := NULLIF(trim(v_rec.parsed_data->>'date_of_death'), '');
      v_gender := NULLIF(upper(trim(v_rec.parsed_data->>'gender')), '');

      -- Safe is_living & status validation (without casting to boolean)
      v_is_living_raw := trim(v_rec.parsed_data->>'is_living');
      v_is_living := NULL;
      IF v_is_living_raw IS NOT NULL THEN
        IF lower(v_is_living_raw) IN ('true', 't', 'yes', 'y', '1', 'living', 'alive') THEN
          v_is_living := TRUE;
        ELSIF lower(v_is_living_raw) IN ('false', 'f', 'no', 'n', '0', 'deceased', 'dead') THEN
          v_is_living := FALSE;
        ELSE
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_BOOLEAN_VALUE',
            'field', 'is_living',
            'severity', 'WARNING',
            'message', format('Value "%s" for is_living is not a recognized boolean; expected true/false, living/deceased.', v_is_living_raw)
          );
        END IF;
      END IF;

      -- Canonical persons status validation & normalization: ACTIVE | DECEASED
      -- Source status = 'LIVING' is normalized to canonical 'ACTIVE'
      v_person_status_raw := upper(trim(v_rec.parsed_data->>'status'));
      v_canonical_status := NULL;
      IF v_person_status_raw IS NOT NULL THEN
        IF v_person_status_raw = 'ACTIVE' THEN
          v_canonical_status := 'ACTIVE';
        ELSIF v_person_status_raw = 'LIVING' THEN
          v_canonical_status := 'ACTIVE';
        ELSIF v_person_status_raw = 'DECEASED' THEN
          v_canonical_status := 'DECEASED';
        ELSE
          -- Unsupported status values produce a structured row-level warning and preserve raw value
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_PERSON_STATUS',
            'field', 'status',
            'severity', 'WARNING',
            'message', format('Status "%s" is not a recognized canonical person status; expected ACTIVE or DECEASED (source LIVING maps to ACTIVE).', v_person_status_raw)
          );
        END IF;
      END IF;

      -- If both status and is_living are provided, check for contradiction
      IF v_is_living IS NOT NULL AND v_canonical_status IS NOT NULL THEN
        IF (v_is_living = TRUE AND v_canonical_status = 'DECEASED') OR
           (v_is_living = FALSE AND v_canonical_status = 'ACTIVE') THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'VITAL_STATUS_CONTRADICTION',
            'field', 'status',
            'severity', 'WARNING',
            'message', format('Contradiction detected: is_living=%s contradicts person status=%s.', v_is_living, v_canonical_status)
          );
        END IF;
      END IF;

      -- Rule P1: Name existence (BOTH first_name and last_name required by canonical schema)
      IF v_first_name IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_FIRST_NAME',
          'field', 'first_name',
          'severity', 'ERROR',
          'message', 'Person record must have a first_name.'
        );
      END IF;

      IF v_last_name IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_LAST_NAME',
          'field', 'last_name',
          'severity', 'ERROR',
          'message', 'Person record must have a last_name.'
        );
      END IF;

      -- Rule P2: Name length checks
      IF v_first_name IS NOT NULL AND length(v_first_name) > 100 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'first_name',
          'severity', 'ERROR',
          'message', 'first_name exceeds maximum length of 100 characters.'
        );
      END IF;

      IF v_last_name IS NOT NULL AND length(v_last_name) > 100 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'last_name',
          'severity', 'ERROR',
          'message', 'last_name exceeds maximum length of 100 characters.'
        );
      END IF;

      -- Rule P3: Gender validity
      IF v_gender IS NOT NULL AND v_gender NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'INVALID_GENDER',
          'field', 'gender',
          'severity', 'ERROR',
          'message', 'gender must be MALE, FEMALE, or OTHER.'
        );
      END IF;

      -- Rule P4: Date of birth validation
      v_dob := NULL;
      IF v_dob_str IS NOT NULL THEN
        BEGIN
          v_dob := v_dob_str::DATE;
          IF v_dob < '1800-01-01'::DATE THEN
            v_errors := v_errors || jsonb_build_object(
              'code', 'DOB_TOO_EARLY',
              'field', 'date_of_birth',
              'severity', 'ERROR',
              'message', 'date_of_birth cannot be earlier than 1800-01-01.'
            );
          ELSIF v_dob > CURRENT_DATE THEN
            v_errors := v_errors || jsonb_build_object(
              'code', 'DOB_IN_FUTURE',
              'field', 'date_of_birth',
              'severity', 'ERROR',
              'message', 'date_of_birth cannot be in the future.'
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_DATE_FORMAT',
            'field', 'date_of_birth',
            'severity', 'ERROR',
            'message', 'date_of_birth is not a valid date (expected YYYY-MM-DD).'
          );
        END;
      END IF;

      -- Rule P5: Date of death validation
      v_dod := NULL;
      IF v_dod_str IS NOT NULL THEN
        BEGIN
          v_dod := v_dod_str::DATE;
          IF v_dod > CURRENT_DATE THEN
            v_errors := v_errors || jsonb_build_object(
              'code', 'DOD_IN_FUTURE',
              'field', 'date_of_death',
              'severity', 'ERROR',
              'message', 'date_of_death cannot be in the future.'
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_DATE_FORMAT',
            'field', 'date_of_death',
            'severity', 'ERROR',
            'message', 'date_of_death is not a valid date (expected YYYY-MM-DD).'
          );
        END;
      END IF;

      -- Rule P6: Chronological consistency (DOD >= DOB)
      IF v_dob IS NOT NULL AND v_dod IS NOT NULL AND v_dod < v_dob THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'DEATH_BEFORE_BIRTH',
          'field', 'date_of_death',
          'severity', 'ERROR',
          'message', 'date_of_death cannot precede date_of_birth.'
        );
      END IF;

      -- Rule P7: Vital status contradiction
      IF v_dod IS NOT NULL AND (v_is_living = TRUE OR v_canonical_status = 'ACTIVE') THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'VITAL_STATUS_CONTRADICTION',
          'field', 'is_living',
          'severity', 'WARNING',
          'message', 'Person has date_of_death but is represented as living/ACTIVE.'
        );
      END IF;

      -- Rule P8: Duplicate Detection against canonical public.persons
      -- DETECT != MERGE: Flag as WARNING only with privacy-preserving match signals
      IF v_first_name IS NOT NULL AND v_last_name IS NOT NULL THEN
        SELECT id, first_name, last_name, date_of_birth, gotra INTO v_cand_match
        FROM public.persons
        WHERE deleted_at IS NULL
          AND lower(first_name) = lower(v_first_name)
          AND lower(last_name) = lower(v_last_name)
          AND (
            (v_dob IS NOT NULL AND date_of_birth = v_dob)
            OR (v_rec.parsed_data->>'gotra' IS NOT NULL AND lower(gotra) = lower(v_rec.parsed_data->>'gotra'))
          )
        LIMIT 1;

        IF FOUND THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'DUPLICATE_CANDIDATE',
            'field', 'name',
            'severity', 'WARNING',
            'message', 'Potential duplicate match detected with an existing canonical person.',
            'canonical_candidate_id', v_cand_match.id,
            'confidence', CASE WHEN v_dob IS NOT NULL AND v_cand_match.date_of_birth = v_dob THEN 'STRONG' ELSE 'POSSIBLE' END,
            'match_signals', jsonb_build_array(
              'FULL_NAME_MATCH',
              CASE WHEN v_dob IS NOT NULL AND v_cand_match.date_of_birth = v_dob THEN 'DOB_MATCH' ELSE 'GOTRA_MATCH' END
            )
          );
        END IF;
      END IF;

    -- =========================================================================
    -- ENTITY: FAMILY
    -- =========================================================================
    ELSIF v_rec.entity_type = 'FAMILY' THEN
      v_family_name := NULLIF(trim(v_rec.parsed_data->>'family_name'), '');
      v_head_id := NULLIF(trim(v_rec.parsed_data->>'head_id'), '');

      -- Rule F1: Family name existence
      IF v_family_name IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_REQUIRED_FIELD',
          'field', 'family_name',
          'severity', 'ERROR',
          'message', 'Family record must have a family_name.'
        );
      ELSIF length(v_family_name) > 200 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'family_name',
          'severity', 'ERROR',
          'message', 'family_name exceeds maximum length of 200 characters.'
        );
      END IF;

      -- Rule F2: Description length
      IF v_rec.parsed_data->>'description' IS NOT NULL AND length(v_rec.parsed_data->>'description') > 2000 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'description',
          'severity', 'ERROR',
          'message', 'description exceeds maximum length of 2000 characters.'
        );
      END IF;

      -- Rule F3: Head ID UUID format if supplied
      IF v_head_id IS NOT NULL AND v_head_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'INVALID_UUID_FORMAT',
          'field', 'head_id',
          'severity', 'WARNING',
          'message', 'head_id is not a standard UUID format; will require lineage resolution.'
        );
      END IF;

      -- Rule F4: Duplicate Detection against canonical public.families
      -- DETECT != MERGE: Flag as WARNING only with privacy-preserving match signals
      IF v_family_name IS NOT NULL THEN
        SELECT id, family_name, city INTO v_cand_match
        FROM public.families
        WHERE deleted_at IS NULL
          AND lower(family_name) = lower(v_family_name)
          AND (
            (v_rec.parsed_data->>'city' IS NOT NULL AND lower(city) = lower(v_rec.parsed_data->>'city'))
            OR (v_rec.parsed_data->>'gotra' IS NOT NULL AND lower(gotra) = lower(v_rec.parsed_data->>'gotra'))
          )
        LIMIT 1;

        IF FOUND THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'DUPLICATE_CANDIDATE',
            'field', 'family_name',
            'severity', 'WARNING',
            'message', 'Potential duplicate match detected with an existing canonical family.',
            'canonical_candidate_id', v_cand_match.id,
            'confidence', 'POSSIBLE',
            'match_signals', jsonb_build_array(
              'FAMILY_NAME_MATCH',
              CASE WHEN v_rec.parsed_data->>'city' IS NOT NULL AND lower(v_cand_match.city) = lower(v_rec.parsed_data->>'city') THEN 'CITY_MATCH' ELSE 'GOTRA_MATCH' END
            )
          );
        END IF;
      END IF;

    -- =========================================================================
    -- ENTITY: RELATIONSHIP
    -- =========================================================================
    ELSIF v_rec.entity_type = 'RELATIONSHIP' THEN
      v_person_a := NULLIF(trim(v_rec.parsed_data->>'person_a_id'), '');
      v_person_b := NULLIF(trim(v_rec.parsed_data->>'person_b_id'), '');
      v_rel_type := NULLIF(upper(trim(v_rec.parsed_data->>'relationship_type')), '');

      -- Rule R1: Endpoints existence
      IF v_person_a IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_REQUIRED_FIELD',
          'field', 'person_a_id',
          'severity', 'ERROR',
          'message', 'Relationship record must reference Person A (person_a_id).'
        );
      END IF;

      IF v_person_b IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_REQUIRED_FIELD',
          'field', 'person_b_id',
          'severity', 'ERROR',
          'message', 'Relationship record must reference Person B (person_b_id).'
        );
      END IF;

      -- Rule R2: Disallow self-reference
      IF v_person_a IS NOT NULL AND v_person_b IS NOT NULL AND lower(v_person_a) = lower(v_person_b) THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'SELF_RELATIONSHIP',
          'field', 'person_b_id',
          'severity', 'ERROR',
          'message', 'A relationship cannot connect a person to themselves.'
        );
      END IF;

      -- Rule R3: Relationship type valid canonical enum (PARENT, SPOUSE, SIBLING only)
      IF v_rel_type IS NULL OR v_rel_type NOT IN ('PARENT', 'SPOUSE', 'SIBLING') THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'INVALID_RELATIONSHIP_TYPE',
          'field', 'relationship_type',
          'severity', 'ERROR',
          'message', 'relationship_type must be PARENT, SPOUSE, or SIBLING (canonical schema does not support CHILD; map to PARENT with reversed endpoints).'
        );
      END IF;

      -- Rule R4: UUID format check (warning if source uses external IDs like ROW_5)
      IF v_person_a IS NOT NULL AND v_person_a !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        -- Check if it matches a source_record_id within the batch
        IF NOT EXISTS (
          SELECT 1 FROM public.staging_records
          WHERE batch_id = p_batch_id AND source_record_id = v_person_a
        ) THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'UNRESOLVED_REFERENCE',
            'field', 'person_a_id',
            'severity', 'WARNING',
            'message', format('Reference person_a_id "%s" does not match any source_record_id in this batch.', v_person_a)
          );
        END IF;
      END IF;

      IF v_person_b IS NOT NULL AND v_person_b !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.staging_records
          WHERE batch_id = p_batch_id AND source_record_id = v_person_b
        ) THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'UNRESOLVED_REFERENCE',
            'field', 'person_b_id',
            'severity', 'WARNING',
            'message', format('Reference person_b_id "%s" does not match any source_record_id in this batch.', v_person_b)
          );
        END IF;
      END IF;
    END IF;

    -- =========================================================================
    -- Determine Record Status from Evaluation
    -- =========================================================================
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_errors) elem WHERE elem->>'severity' = 'ERROR'
    ) THEN
      v_status := 'ERROR';
    ELSIF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_errors) elem WHERE elem->>'severity' = 'WARNING'
    ) THEN
      v_status := 'WARNING';
    ELSE
      v_status := 'VALID';
    END IF;

    -- Update staging record with evaluation results
    UPDATE public.staging_records
    SET
      validation_status = v_status,
      validation_errors = v_errors,
      updated_at = NOW()
    WHERE id = v_rec.id;
  END LOOP;

  -- 7. Re-calculate aggregate metrics from staging_records
  SELECT
    count(*),
    count(*) FILTER (WHERE validation_status = 'ERROR'),
    count(*) FILTER (WHERE validation_status = 'WARNING'),
    count(*) FILTER (WHERE validation_status = 'VALID'),
    count(*) FILTER (
      WHERE validation_errors @> '[{"code": "DUPLICATE_CANDIDATE"}]'::jsonb
    ),
    jsonb_build_object(
      'persons', count(*) FILTER (WHERE entity_type = 'PERSON'),
      'families', count(*) FILTER (WHERE entity_type = 'FAMILY'),
      'relationships', count(*) FILTER (WHERE entity_type = 'RELATIONSHIP')
    )
  INTO
    v_total_records,
    v_errors_count,
    v_warnings_count,
    v_valid_count,
    v_duplicate_count,
    v_row_counts
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  v_validation_summary := jsonb_build_object(
    'errors', v_errors_count,
    'warnings', v_warnings_count,
    'valid', v_valid_count,
    'duplicates', v_duplicate_count
  );

  -- 8. Synchronize aggregate metrics onto import_batches
  UPDATE public.import_batches
  SET
    total_records = v_total_records,
    row_counts = v_row_counts,
    validation_summary = v_validation_summary,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 9. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    NULL,
    jsonb_build_object(
      'action_type', 'VALIDATE_IMPORT_BATCH',
      'batch_id', p_batch_id,
      'total_records', v_total_records,
      'validation_summary', v_validation_summary
    ),
    jsonb_build_object(
      'caller_id', v_caller_id
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'total_records', v_total_records,
    'row_counts', v_row_counts,
    'validation_summary', v_validation_summary
  );
END;
$$;

COMMENT ON FUNCTION public.validate_import_batch(UUID) IS
  'Server-authoritative RPC: Evaluates staging records against canonical schema rules and duplicate detection, updates validation statuses, and synchronizes batch metrics. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 2. Authoritative RPC: public.set_staging_record_status
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_staging_record_status(
  p_record_id UUID,
  p_status public.staging_validation_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_rec RECORD;
  v_batch RECORD;
  v_has_blocking_errors BOOLEAN := FALSE;
  v_notes_trimmed TEXT;
  v_elem JSONB;
  v_new_errors JSONB := '[]'::jsonb;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_record_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: record_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: status is required'
      USING ERRCODE = '22023';
  END IF;

  v_notes_trimmed := NULLIF(trim(p_notes), '');

  -- 4. Retrieve staging record and its parent batch
  SELECT id, batch_id, entity_type, validation_status, validation_errors
  INTO v_rec
  FROM public.staging_records
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Staging record % does not exist', p_record_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id, status INTO v_batch
  FROM public.import_batches
  WHERE id = v_rec.batch_id
  FOR UPDATE;

  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot modify record status in batch with status %', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Enforce allowed manual status transitions
  -- PENDING records MUST NOT be manually manufactured into VALID, WARNING, or ERROR.
  -- They must be processed by validate_import_batch() or explicitly EXCLUDED.
  IF v_rec.validation_status = 'PENDING' AND p_status IN ('VALID', 'WARNING', 'ERROR') THEN
    RAISE EXCEPTION 'INVALID_STATUS: PENDING records must be processed by validate_import_batch() before they can become VALID, WARNING, or ERROR.'
      USING ERRCODE = '23514';
  END IF;

  -- EXCLUDED records MUST NOT be manually changed to VALID, WARNING, or ERROR.
  -- They must be reprocessed by validate_import_batch() before becoming VALID, WARNING, or ERROR.
  IF v_rec.validation_status = 'EXCLUDED' AND p_status IN ('VALID', 'WARNING', 'ERROR') THEN
    RAISE EXCEPTION 'INVALID_STATUS: EXCLUDED records must be reprocessed by validate_import_batch() before becoming VALID, WARNING, or ERROR.'
      USING ERRCODE = '23514';
  END IF;

  -- Disallow setting any record back to PENDING manually
  IF p_status = 'PENDING' AND v_rec.validation_status != 'PENDING' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually transition validated record back to PENDING status.'
      USING ERRCODE = '23514';
  END IF;

  -- Disallow turning VALID records into ERROR or WARNING unless through validation engine
  IF v_rec.validation_status = 'VALID' AND p_status IN ('ERROR', 'WARNING') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually downgrade VALID record to % without running validation.', p_status
      USING ERRCODE = '23514';
  END IF;

  -- Disallow turning WARNING records into ERROR without running validation
  IF v_rec.validation_status = 'WARNING' AND p_status = 'ERROR' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually downgrade WARNING record to ERROR without running validation.'
      USING ERRCODE = '23514';
  END IF;

  -- Disallow turning ERROR records into WARNING without running validation
  IF v_rec.validation_status = 'ERROR' AND p_status = 'WARNING' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually transition ERROR record to WARNING without running validation.'
      USING ERRCODE = '23514';
  END IF;

  -- 6. Inspect existing errors for blocking ERROR severity
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rec.validation_errors) elem
    WHERE elem->>'severity' = 'ERROR'
  ) INTO v_has_blocking_errors;

  -- Prevent contradictory state: validation_status = 'VALID' with unresolved ERRORs
  IF p_status = 'VALID' AND v_has_blocking_errors THEN
    -- Mandatory review reason required to resolve blocking errors
    IF v_notes_trimmed IS NULL OR length(v_notes_trimmed) < 3 THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Mandatory review notes (minimum 3 characters) required to resolve blocking validation errors to VALID status'
        USING ERRCODE = '22023';
    END IF;

    -- Transform existing ERRORs to RESOLVED, preserving the original evidence and adding resolution provenance
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
    LOOP
      IF v_elem->>'severity' = 'ERROR' THEN
        v_new_errors := v_new_errors || jsonb_build_object(
          'code', COALESCE(v_elem->>'code', 'RESOLVED_ERROR'),
          'field', v_elem->>'field',
          'severity', 'RESOLVED',
          'message', v_elem->>'message',
          'original_severity', 'ERROR',
          'resolved_by', v_caller_id,
          'resolved_at', NOW(),
          'resolution_note', v_notes_trimmed
        );
      ELSE
        v_new_errors := v_new_errors || v_elem;
      END IF;
    END LOOP;

    -- Append explicit admin review resolution note
    v_new_errors := v_new_errors || jsonb_build_object(
      'code', 'ADMIN_ERROR_RESOLVED',
      'severity', 'NOTE',
      'message', format('Blocking errors manually resolved by administrator: %s', v_notes_trimmed),
      'reviewed_by', v_caller_id,
      'reviewed_at', NOW()
    );
  ELSE
    -- Standard review update (e.g. EXCLUDED, WARNING, or VALID when no blocking errors)
    v_new_errors := v_rec.validation_errors;
    IF v_notes_trimmed IS NOT NULL THEN
      v_new_errors := v_new_errors || jsonb_build_object(
        'code', 'ADMIN_REVIEW_NOTE',
        'severity', 'NOTE',
        'message', v_notes_trimmed,
        'reviewed_by', v_caller_id,
        'reviewed_at', NOW()
      );
    END IF;
  END IF;

  -- Update staging record
  UPDATE public.staging_records
  SET
    validation_status = p_status,
    validation_errors = v_new_errors,
    updated_at = NOW()
  WHERE id = p_record_id;

  -- Re-synchronize batch summary
  UPDATE public.import_batches
  SET
    validation_summary = (
      SELECT jsonb_build_object(
        'errors', count(*) FILTER (WHERE validation_status = 'ERROR'),
        'warnings', count(*) FILTER (WHERE validation_status = 'WARNING'),
        'valid', count(*) FILTER (WHERE validation_status = 'VALID'),
        'duplicates', count(*) FILTER (WHERE validation_errors @> '[{"code": "DUPLICATE_CANDIDATE"}]'::jsonb)
      )
      FROM public.staging_records
      WHERE batch_id = v_rec.batch_id
    ),
    updated_at = NOW()
  WHERE id = v_rec.batch_id;

  RETURN jsonb_build_object(
    'record_id', p_record_id,
    'batch_id', v_rec.batch_id,
    'status', p_status
  );
END;
$$;

COMMENT ON FUNCTION public.set_staging_record_status(UUID, public.staging_validation_status, TEXT) IS
  'Server-authoritative RPC: Sets manual review status on a staging record while maintaining error integrity. Resolving ERROR to VALID requires review notes and marks errors as RESOLVED. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 3. Authoritative RPC: public.finalize_batch_validation
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_batch_validation(
  p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_error_status_count INT;
  v_pending_status_count INT;
  v_unresolved_error_count INT;
  v_eligible_count INT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock target batch
  SELECT id, status INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Only batches in STAGED status can be finalized to VALIDATED (current: %)', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Comprehensive check for unresolved errors and unvalidated records
  SELECT
    count(*) FILTER (WHERE validation_status = 'ERROR'),
    count(*) FILTER (WHERE validation_status = 'PENDING'),
    count(*) FILTER (
      WHERE validation_status != 'EXCLUDED'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(validation_errors) elem
          WHERE elem->>'severity' = 'ERROR'
        )
    ),
    count(*) FILTER (WHERE validation_status IN ('VALID', 'WARNING'))
  INTO
    v_error_status_count,
    v_pending_status_count,
    v_unresolved_error_count,
    v_eligible_count
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  -- Reject if records are still PENDING
  IF v_pending_status_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot finalize batch with % unvalidated (PENDING) records. Run validation first.', v_pending_status_count
      USING ERRCODE = '23514';
  END IF;

  -- Reject if any record has status ERROR or contains unresolved severity ERROR
  IF v_error_status_count > 0 OR v_unresolved_error_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot finalize batch with unresolved blocking errors (% with ERROR status, % with unresolved error payloads). Exclude or resolve invalid records first.', v_error_status_count, v_unresolved_error_count
      USING ERRCODE = '23514';
  END IF;

  -- Reject if batch has zero eligible records to import (e.g. all excluded or empty)
  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot finalize batch with zero valid or warning records to import.'
      USING ERRCODE = '23514';
  END IF;

  -- 6. Transition batch status to VALIDATED
  UPDATE public.import_batches
  SET
    status = 'VALIDATED',
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 7. Audit log
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    jsonb_build_object('status', 'STAGED'),
    jsonb_build_object('status', 'VALIDATED'),
    jsonb_build_object(
      'action_type', 'FINALIZE_BATCH_VALIDATION',
      'caller_id', v_caller_id,
      'eligible_records', v_eligible_count
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'status', 'VALIDATED'
  );
END;
$$;

COMMENT ON FUNCTION public.finalize_batch_validation(UUID) IS
  'Server-authoritative RPC: Transitions import batch from STAGED to VALIDATED status if zero blocking or unresolved errors exist and records are not PENDING. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- Privileges & Access Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.validate_import_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_import_batch(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_staging_record_status(UUID, public.staging_validation_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staging_record_status(UUID, public.staging_validation_status, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_batch_validation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_batch_validation(UUID) TO authenticated;
