-- =============================================================================
-- Migration: 20261017220000_create_import_promotion_rpc.sql
-- Purpose:   Authoritative RPC for transactional import promotion into canonical
--             census domain tables (persons, families, family_members, relationships,
--             and duplicate_flags) with full lineage provenance and audit trail.
-- Phase:     Phase 14 — Subtask 4 (Final Import Promotion, Provenance & Safe Completion)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. PERSON != USER:
--    - Staged and imported records represent census entities (public.persons).
--    - Promotion sets persons.user_id = NULL unconditionally.
--    - Promotion NEVER creates auth.users, NEVER creates public.profiles,
--      NEVER approves claims, and NEVER accepts invitations.
--
-- 2. DETECT != MERGE:
--    - Promotion NEVER automatically merges, overwrites, or deletes existing canonical records.
--    - Validated records with warning status (including DUPLICATE_CANDIDATE) that were NOT
--      excluded by an administrator are promoted as NEW canonical census records.
--    - Staging records flagged with DUPLICATE_CANDIDATE automatically generate an OPEN
--      entry in public.duplicate_flags linking the newly promoted canonical record
--      and the existing candidate, preserving traceability for human moderation.
--
-- 3. PROMOTION ELIGIBILITY & HARD GATES:
--    - Import batch status MUST be 'VALIDATED'.
--    - Zero records with validation_status = 'PENDING'.
--    - Zero records with validation_status = 'ERROR'.
--    - Zero non-excluded records containing an unresolved error payload.
--    - At least one eligible record with validation_status IN ('VALID', 'WARNING').
--    - Records with validation_status = 'EXCLUDED' are completely skipped and never promoted.
--    - All eligible records must have canonical_id IS NULL prior to promotion.
--
-- 4. ATOMICITY & CONCURRENCY:
--    - Single PostgreSQL transaction with row-level locks on import_batches FOR UPDATE
--      and staging_records FOR UPDATE.
--    - Any constraint or foreign key violation aborts the transaction completely;
--      zero canonical rows are committed, staging canonical_id remains NULL, and the
--      batch remains VALIDATED.
--
-- 5. DETERMINISTIC PROCESSING ORDER & CROSS-ENTITY DEPENDENCIES:
--    Order:
--      Step 1: PERSON records -> public.persons (canonical_id assigned)
--      Step 2: FAMILY records -> public.families (canonical_id assigned)
--      Step 3: FAMILY MEMBERSHIP / HEAD -> public.family_members (role=HEAD, is_head=TRUE)
--      Step 4: RELATIONSHIP records -> public.relationships (lexical ordering enforced)
--      Step 5: DUPLICATE FLAGS -> public.duplicate_flags (OPEN flags for WARNING duplicates)
--      Step 6: BATCH UPDATE -> import_batches (status = 'PROMOTED', promoted_at, promoted_by)
--      Step 7: IMMUTABLE AUDIT LOG -> public.log_audit_event()
--
-- 6. ADMIN-ONLY AUTHORIZATION:
--    - Restricted to active SUPER_ADMIN and ADMIN roles via public.is_admin().
--    - SECURITY DEFINER with safe search_path = public, auth.
--    - Executable by authenticated administrators only. Revoked from PUBLIC and anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Provenance Index on staging_records
-- -----------------------------------------------------------------------------
-- Supports bidirectional O(1) lookup: "Which import batch and source row created this canonical record?"
CREATE INDEX IF NOT EXISTS idx_staging_records_canonical_id
  ON public.staging_records (canonical_id)
  WHERE canonical_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Authoritative RPC: public.promote_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_import_batch(
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

  -- Eligibility counters
  v_pending_count INT := 0;
  v_error_count INT := 0;
  v_unresolved_error_count INT := 0;
  v_eligible_count INT := 0;
  v_already_promoted_count INT := 0;

  -- Execution counters
  v_promoted_persons INT := 0;
  v_promoted_families INT := 0;
  v_promoted_memberships INT := 0;
  v_promoted_relationships INT := 0;
  v_created_duplicate_flags INT := 0;
  v_total_promoted INT := 0;

  -- Entity variables
  v_canonical_id UUID;
  v_first_name TEXT;
  v_last_name TEXT;
  v_middle_name TEXT;
  v_maiden_name TEXT;
  v_gender public.gender;
  v_gender_str TEXT;
  v_dob DATE;
  v_dod DATE;
  v_dob_str TEXT;
  v_dod_str TEXT;
  v_birth_place TEXT;
  v_gotra TEXT;
  v_nukh TEXT;
  v_kul TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_status_str TEXT;
  v_person_status public.person_status;

  -- Family variables
  v_family_name TEXT;
  v_description TEXT;
  v_city TEXT;
  v_state TEXT;
  v_country TEXT;
  v_head_ref TEXT;
  v_head_canonical_id UUID;

  -- Relationship variables
  v_rel_person_a_ref TEXT;
  v_rel_person_b_ref TEXT;
  v_rel_type_str TEXT;
  v_rel_type public.relationship_type;
  v_canonical_person_a UUID;
  v_canonical_person_b UUID;
  v_swap_temp UUID;

  -- Duplicate candidate variables
  v_dup_candidate_id UUID;
  v_dup_confidence public.duplicate_confidence;
  v_dup_confidence_str TEXT;
  v_dup_signals JSONB;
  v_dup_rec_a UUID;
  v_dup_rec_b UUID;
  v_error_elem JSONB;

  -- Temporary mapping table name check
  v_promoted_at TIMESTAMPTZ;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to promote import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to promote import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock target batch exclusively
  SELECT id, status, file_name, total_records, row_counts, validation_summary, promoted_at, promoted_by
  INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency Check: if batch has already been promoted, return controlled idempotent response
  IF v_batch.status = 'PROMOTED' THEN
    SELECT
      count(*) FILTER (WHERE entity_type = 'PERSON' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE entity_type = 'FAMILY' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE entity_type = 'RELATIONSHIP' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE canonical_id IS NOT NULL)
    INTO
      v_promoted_persons,
      v_promoted_families,
      v_promoted_relationships,
      v_total_promoted
    FROM public.staging_records
    WHERE batch_id = p_batch_id;

    RETURN jsonb_build_object(
      'batchId', p_batch_id,
      'status', 'PROMOTED',
      'alreadyPromoted', TRUE,
      'promotedAt', v_batch.promoted_at,
      'promotedBy', v_batch.promoted_by,
      'promotedCounts', jsonb_build_object(
        'persons', v_promoted_persons,
        'families', v_promoted_families,
        'relationships', v_promoted_relationships,
        'total', v_total_promoted
      ),
      'familyMemberships', 0,
      'duplicateFlags', 0,
      'total', v_total_promoted
    );
  END IF;

  -- Lifecycle status check: Only VALIDATED batches may be promoted
  IF v_batch.status != 'VALIDATED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot promote import batch % with status %. Batch must be VALIDATED.', p_batch_id, v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Lock all staging records for this batch deterministically
  PERFORM 1
  FROM public.staging_records
  WHERE batch_id = p_batch_id
  ORDER BY source_row_number ASC, id ASC
  FOR UPDATE;

  -- 6. Rigorous Eligibility Verification
  SELECT
    count(*) FILTER (WHERE validation_status = 'PENDING'),
    count(*) FILTER (WHERE validation_status = 'ERROR'),
    count(*) FILTER (
      WHERE validation_status != 'EXCLUDED'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(validation_errors) elem
          WHERE elem->>'severity' = 'ERROR'
        )
    ),
    count(*) FILTER (WHERE validation_status IN ('VALID', 'WARNING')),
    count(*) FILTER (WHERE canonical_id IS NOT NULL)
  INTO
    v_pending_count,
    v_error_count,
    v_unresolved_error_count,
    v_eligible_count,
    v_already_promoted_count
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with % unvalidated (PENDING) records. Run validation first.', v_pending_count
      USING ERRCODE = '23514';
  END IF;

  IF v_error_count > 0 OR v_unresolved_error_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with unresolved errors (% with ERROR status, % with unresolved error payloads).', v_error_count, v_unresolved_error_count
      USING ERRCODE = '23514';
  END IF;

  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with zero valid or warning records.'
      USING ERRCODE = '23514';
  END IF;

  IF v_already_promoted_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Batch contains % records that have already been assigned a canonical_id.', v_already_promoted_count
      USING ERRCODE = '23514';
  END IF;

  -- 7. Create temporary in-transaction source-to-canonical mapping table
  CREATE TEMP TABLE temp_import_id_map (
    staging_id UUID PRIMARY KEY,
    source_record_id TEXT,
    entity_type public.import_entity_type NOT NULL,
    canonical_id UUID NOT NULL
  ) ON COMMIT DROP;

  CREATE INDEX idx_temp_import_id_map_source
    ON temp_import_id_map (source_record_id)
    WHERE source_record_id IS NOT NULL;

  -- ===========================================================================
  -- STEP 1: PROMOTE PERSON RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, source_record_id, parsed_data, validation_status, validation_errors
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'PERSON'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_first_name := trim(v_rec.parsed_data->>'first_name');
    v_last_name := trim(v_rec.parsed_data->>'last_name');
    v_middle_name := NULLIF(trim(v_rec.parsed_data->>'middle_name'), '');
    v_maiden_name := NULLIF(trim(v_rec.parsed_data->>'maiden_name'), '');

    v_gender_str := upper(trim(COALESCE(v_rec.parsed_data->>'gender', '')));
    IF v_gender_str = 'MALE' THEN
      v_gender := 'MALE'::public.gender;
    ELSIF v_gender_str = 'FEMALE' THEN
      v_gender := 'FEMALE'::public.gender;
    ELSIF v_gender_str = 'OTHER' THEN
      v_gender := 'OTHER'::public.gender;
    ELSIF v_gender_str = 'PREFER_NOT_TO_SAY' THEN
      v_gender := 'PREFER_NOT_TO_SAY'::public.gender;
    ELSE
      v_gender := NULL;
    END IF;

    v_dob_str := NULLIF(trim(v_rec.parsed_data->>'date_of_birth'), '');
    v_dob := CASE WHEN v_dob_str IS NOT NULL THEN v_dob_str::DATE ELSE NULL END;

    v_dod_str := NULLIF(trim(v_rec.parsed_data->>'date_of_death'), '');
    v_dod := CASE WHEN v_dod_str IS NOT NULL THEN v_dod_str::DATE ELSE NULL END;

    v_birth_place := NULLIF(trim(v_rec.parsed_data->>'birth_place'), '');
    v_gotra := NULLIF(trim(v_rec.parsed_data->>'gotra'), '');
    v_nukh := NULLIF(trim(v_rec.parsed_data->>'nukh'), '');
    v_kul := NULLIF(trim(v_rec.parsed_data->>'kul'), '');
    v_phone := NULLIF(trim(v_rec.parsed_data->>'phone'), '');
    v_email := NULLIF(trim(v_rec.parsed_data->>'email'), '');

    -- Determine canonical person status: ACTIVE | DECEASED
    v_status_str := upper(trim(COALESCE(v_rec.parsed_data->>'status', '')));
    IF v_dod IS NOT NULL OR v_status_str = 'DECEASED' THEN
      v_person_status := 'DECEASED'::public.person_status;
    ELSE
      v_person_status := 'ACTIVE'::public.person_status;
    END IF;

    -- Insert into public.persons (PERSON != USER: user_id is strictly NULL)
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      date_of_death,
      birth_place,
      gotra,
      nukh,
      kul,
      phone,
      email_contact,
      status,
      verification_status,
      profile_privacy,
      dob_privacy,
      contact_privacy,
      user_id,
      created_by,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      v_first_name,
      v_middle_name,
      v_last_name,
      v_maiden_name,
      v_gender,
      v_dob,
      v_dod,
      v_birth_place,
      v_gotra,
      v_nukh,
      v_kul,
      v_phone,
      v_email,
      v_person_status,
      'UNVERIFIED'::public.verification_status,
      'COMMUNITY'::public.privacy_level,
      'FAMILY'::public.privacy_level,
      'PRIVATE'::public.privacy_level,
      NULL,
      v_caller_id,
      NOW(),
      NOW(),
      NULL
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    -- Record mapping for downstream resolution
    INSERT INTO temp_import_id_map (staging_id, source_record_id, entity_type, canonical_id)
    VALUES (v_rec.id, v_rec.source_record_id, 'PERSON', v_canonical_id);

    v_promoted_persons := v_promoted_persons + 1;

    -- Duplicate Review Traceability:
    -- If record was flagged with DUPLICATE_CANDIDATE and left as WARNING, create an OPEN duplicate flag
    IF v_rec.validation_status = 'WARNING' THEN
      FOR v_error_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
      LOOP
        IF v_error_elem->>'code' = 'DUPLICATE_CANDIDATE' AND v_error_elem->>'canonical_candidate_id' IS NOT NULL THEN
          v_dup_candidate_id := (v_error_elem->>'canonical_candidate_id')::UUID;
          v_dup_confidence_str := upper(trim(COALESCE(v_error_elem->>'confidence', 'POSSIBLE')));
          IF v_dup_confidence_str = 'STRONG' THEN
            v_dup_confidence := 'STRONG'::public.duplicate_confidence;
          ELSIF v_dup_confidence_str = 'WEAK' THEN
            v_dup_confidence := 'WEAK'::public.duplicate_confidence;
          ELSE
            v_dup_confidence := 'POSSIBLE'::public.duplicate_confidence;
          END IF;
          v_dup_signals := COALESCE(v_error_elem->'match_signals', '["IMPORT_VALIDATION_MATCH"]'::jsonb);

          -- Enforce canonical pair ordering (record_a_id < record_b_id)
          IF v_canonical_id < v_dup_candidate_id THEN
            v_dup_rec_a := v_canonical_id;
            v_dup_rec_b := v_dup_candidate_id;
          ELSE
            v_dup_rec_a := v_dup_candidate_id;
            v_dup_rec_b := v_canonical_id;
          END IF;

          -- Insert duplicate flag if not already existing
          IF NOT EXISTS (
            SELECT 1 FROM public.duplicate_flags
            WHERE entity_type = 'PERSON'
              AND record_a_id = v_dup_rec_a
              AND record_b_id = v_dup_rec_b
          ) THEN
            INSERT INTO public.duplicate_flags (
              entity_type,
              record_a_id,
              record_b_id,
              confidence,
              match_signals,
              status,
              notes,
              flagged_by,
              created_at,
              updated_at
            ) VALUES (
              'PERSON'::public.duplicate_entity_type,
              v_dup_rec_a,
              v_dup_rec_b,
              v_dup_confidence,
              v_dup_signals,
              'OPEN'::public.duplicate_flag_status,
              format('Flagged during import promotion for batch %s (source row %s). DETECT != MERGE: distinct canonical records preserved.', p_batch_id, v_rec.source_row_number),
              v_caller_id,
              NOW(),
              NOW()
            );
            v_created_duplicate_flags := v_created_duplicate_flags + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 2: PROMOTE FAMILY RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, source_record_id, parsed_data, validation_status, validation_errors
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'FAMILY'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_family_name := trim(v_rec.parsed_data->>'family_name');
    v_description := NULLIF(trim(v_rec.parsed_data->>'description'), '');
    v_gotra := NULLIF(trim(v_rec.parsed_data->>'gotra'), '');
    v_nukh := NULLIF(trim(v_rec.parsed_data->>'nukh'), '');
    v_kul := NULLIF(trim(v_rec.parsed_data->>'kul'), '');
    v_city := NULLIF(trim(v_rec.parsed_data->>'city'), '');
    v_state := NULLIF(trim(v_rec.parsed_data->>'state'), '');
    v_country := COALESCE(NULLIF(trim(v_rec.parsed_data->>'country'), ''), 'India');

    -- Insert into public.families
    INSERT INTO public.families (
      family_name,
      description,
      gotra,
      nukh,
      kul,
      city,
      state,
      country,
      status,
      verification_status,
      profile_privacy,
      members_privacy,
      created_by,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      v_family_name,
      v_description,
      v_gotra,
      v_nukh,
      v_kul,
      v_city,
      v_state,
      v_country,
      'ACTIVE'::public.family_status,
      'UNVERIFIED'::public.verification_status,
      'COMMUNITY'::public.privacy_level,
      'COMMUNITY'::public.privacy_level,
      v_caller_id,
      NOW(),
      NOW(),
      NULL
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    -- Record mapping for downstream resolution
    INSERT INTO temp_import_id_map (staging_id, source_record_id, entity_type, canonical_id)
    VALUES (v_rec.id, v_rec.source_record_id, 'FAMILY', v_canonical_id);

    v_promoted_families := v_promoted_families + 1;

    -- Duplicate Review Traceability for Family:
    IF v_rec.validation_status = 'WARNING' THEN
      FOR v_error_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
      LOOP
        IF v_error_elem->>'code' = 'DUPLICATE_CANDIDATE' AND v_error_elem->>'canonical_candidate_id' IS NOT NULL THEN
          v_dup_candidate_id := (v_error_elem->>'canonical_candidate_id')::UUID;
          v_dup_confidence_str := upper(trim(COALESCE(v_error_elem->>'confidence', 'POSSIBLE')));
          IF v_dup_confidence_str = 'STRONG' THEN
            v_dup_confidence := 'STRONG'::public.duplicate_confidence;
          ELSIF v_dup_confidence_str = 'WEAK' THEN
            v_dup_confidence := 'WEAK'::public.duplicate_confidence;
          ELSE
            v_dup_confidence := 'POSSIBLE'::public.duplicate_confidence;
          END IF;
          v_dup_signals := COALESCE(v_error_elem->'match_signals', '["IMPORT_VALIDATION_MATCH"]'::jsonb);

          IF v_canonical_id < v_dup_candidate_id THEN
            v_dup_rec_a := v_canonical_id;
            v_dup_rec_b := v_dup_candidate_id;
          ELSE
            v_dup_rec_a := v_dup_candidate_id;
            v_dup_rec_b := v_canonical_id;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM public.duplicate_flags
            WHERE entity_type = 'FAMILY'
              AND record_a_id = v_dup_rec_a
              AND record_b_id = v_dup_rec_b
          ) THEN
            INSERT INTO public.duplicate_flags (
              entity_type,
              record_a_id,
              record_b_id,
              confidence,
              match_signals,
              status,
              notes,
              flagged_by,
              created_at,
              updated_at
            ) VALUES (
              'FAMILY'::public.duplicate_entity_type,
              v_dup_rec_a,
              v_dup_rec_b,
              v_dup_confidence,
              v_dup_signals,
              'OPEN'::public.duplicate_flag_status,
              format('Flagged during import promotion for batch %s (source row %s). DETECT != MERGE: distinct canonical records preserved.', p_batch_id, v_rec.source_row_number),
              v_caller_id,
              NOW(),
              NOW()
            );
            v_created_duplicate_flags := v_created_duplicate_flags + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 3: FAMILY HEAD MEMBERSHIP LINKAGE (APPROVED BUSINESS DECISION)
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, parsed_data, canonical_id
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'FAMILY'
      AND canonical_id IS NOT NULL
    ORDER BY source_row_number ASC
  LOOP
    v_head_ref := NULLIF(trim(v_rec.parsed_data->>'head_id'), '');
    IF v_head_ref IS NOT NULL THEN
      -- Resolve head reference: MUST resolve ONLY to an in-batch promoted person
      SELECT canonical_id INTO v_head_canonical_id
      FROM temp_import_id_map
      WHERE entity_type = 'PERSON'
        AND (source_record_id = v_head_ref OR staging_id::TEXT = v_head_ref);

      -- If head reference cannot be resolved to a same-batch promoted person: FAIL ENTIRE PROMOTION TRANSACTION
      IF v_head_canonical_id IS NULL THEN
        RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Family row % specifies head_id "%" which could not be resolved to any promoted person in this batch. Family head reference must belong to the same import batch.', v_rec.source_row_number, v_head_ref
          USING ERRCODE = '23503';
      END IF;

      -- Insert family membership (role = HEAD, is_head = TRUE)
      INSERT INTO public.family_members (
        family_id,
        person_id,
        role,
        is_head,
        joined_at,
        added_by,
        created_at
      ) VALUES (
        v_rec.canonical_id,
        v_head_canonical_id,
        'HEAD'::public.family_role,
        TRUE,
        NOW(),
        v_caller_id,
        NOW()
      );

      v_promoted_memberships := v_promoted_memberships + 1;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 4: PROMOTE RELATIONSHIP RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, parsed_data, validation_status
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'RELATIONSHIP'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_rel_person_a_ref := NULLIF(trim(v_rec.parsed_data->>'person_a_id'), '');
    v_rel_person_b_ref := NULLIF(trim(v_rec.parsed_data->>'person_b_id'), '');
    v_rel_type_str := upper(trim(COALESCE(v_rec.parsed_data->>'relationship_type', '')));

    -- 1. Validate relationship type (canonical: PARENT, SPOUSE, SIBLING only; CHILD is disallowed)
    IF v_rel_type_str = 'PARENT' THEN
      v_rel_type := 'PARENT'::public.relationship_type;
    ELSIF v_rel_type_str = 'SPOUSE' THEN
      v_rel_type := 'SPOUSE'::public.relationship_type;
    ELSIF v_rel_type_str = 'SIBLING' THEN
      v_rel_type := 'SIBLING'::public.relationship_type;
    ELSE
      RAISE EXCEPTION 'INVALID_ARGUMENT: Unsupported relationship type "%" in row % (canonical types: PARENT, SPOUSE, SIBLING).', v_rel_type_str, v_rec.source_row_number
        USING ERRCODE = '23514';
    END IF;

    -- 2. Resolve Person A endpoint
    v_canonical_person_a := NULL;
    SELECT canonical_id INTO v_canonical_person_a
    FROM temp_import_id_map
    WHERE entity_type = 'PERSON'
      AND (source_record_id = v_rel_person_a_ref OR staging_id::TEXT = v_rel_person_a_ref);

    IF v_canonical_person_a IS NULL AND v_rel_person_a_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_canonical_person_a
      FROM public.persons
      WHERE id = v_rel_person_a_ref::UUID AND deleted_at IS NULL;
    END IF;

    IF v_canonical_person_a IS NULL THEN
      RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Relationship row % person_a_id "%" cannot be resolved to any canonical person in this batch or database.', v_rec.source_row_number, v_rel_person_a_ref
        USING ERRCODE = '23503';
    END IF;

    -- 3. Resolve Person B endpoint
    v_canonical_person_b := NULL;
    SELECT canonical_id INTO v_canonical_person_b
    FROM temp_import_id_map
    WHERE entity_type = 'PERSON'
      AND (source_record_id = v_rel_person_b_ref OR staging_id::TEXT = v_rel_person_b_ref);

    IF v_canonical_person_b IS NULL AND v_rel_person_b_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_canonical_person_b
      FROM public.persons
      WHERE id = v_rel_person_b_ref::UUID AND deleted_at IS NULL;
    END IF;

    IF v_canonical_person_b IS NULL THEN
      RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Relationship row % person_b_id "%" cannot be resolved to any canonical person in this batch or database.', v_rec.source_row_number, v_rel_person_b_ref
        USING ERRCODE = '23503';
    END IF;

    -- 4. Disallow self-reference
    IF v_canonical_person_a = v_canonical_person_b THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Relationship in row % connects person % to themselves.', v_rec.source_row_number, v_canonical_person_a
        USING ERRCODE = '23514';
    END IF;

    -- 5. Canonical Lexical Ordering for symmetric types (SPOUSE, SIBLING)
    IF v_rel_type IN ('SPOUSE', 'SIBLING') AND v_canonical_person_a > v_canonical_person_b THEN
      v_swap_temp := v_canonical_person_a;
      v_canonical_person_a := v_canonical_person_b;
      v_canonical_person_b := v_swap_temp;
    END IF;

    -- 6. Insert canonical relationship
    INSERT INTO public.relationships (
      person_a_id,
      person_b_id,
      relationship_type,
      notes,
      verification_status,
      created_by,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      v_canonical_person_a,
      v_canonical_person_b,
      v_rel_type,
      NULLIF(trim(v_rec.parsed_data->>'notes'), ''),
      'UNVERIFIED'::public.verification_status,
      v_caller_id,
      NOW(),
      NOW(),
      NULL
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    v_promoted_relationships := v_promoted_relationships + 1;
  END LOOP;

  v_total_promoted := v_promoted_persons + v_promoted_families + v_promoted_relationships;

  -- ===========================================================================
  -- STEP 5: UPDATE IMPORT BATCH STATUS TO PROMOTED
  -- ===========================================================================
  v_promoted_at := NOW();

  UPDATE public.import_batches
  SET
    status = 'PROMOTED',
    promoted_at = v_promoted_at,
    promoted_by = v_caller_id,
    updated_at = v_promoted_at
  WHERE id = p_batch_id;

  -- ===========================================================================
  -- STEP 6: IMMUTABLE AUDIT LOGGING
  -- ===========================================================================
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    jsonb_build_object('status', 'VALIDATED'),
    jsonb_build_object(
      'status', 'PROMOTED',
      'promoted_counts', jsonb_build_object(
        'persons', v_promoted_persons,
        'families', v_promoted_families,
        'relationships', v_promoted_relationships,
        'family_memberships', v_promoted_memberships,
        'duplicate_flags', v_created_duplicate_flags,
        'total', v_total_promoted
      )
    ),
    jsonb_build_object(
      'action_type', 'PROMOTE_IMPORT_BATCH',
      'batch_id', p_batch_id,
      'file_name', v_batch.file_name,
      'promoted_by', v_caller_id,
      'promoted_at', v_promoted_at
    )
  );

  -- Return structured completion payload
  RETURN jsonb_build_object(
    'batchId', p_batch_id,
    'status', 'PROMOTED',
    'alreadyPromoted', FALSE,
    'promotedAt', v_promoted_at,
    'promotedBy', v_caller_id,
    'promotedCounts', jsonb_build_object(
      'persons', v_promoted_persons,
      'families', v_promoted_families,
      'relationships', v_promoted_relationships,
      'total', v_total_promoted
    ),
    'familyMemberships', v_promoted_memberships,
    'duplicateFlags', v_created_duplicate_flags,
    'total', v_total_promoted
  );
END;
$$;

COMMENT ON FUNCTION public.promote_import_batch(UUID) IS
  'Server-authoritative RPC: Promotes validated staging records into canonical census domain tables (persons, families, family_members, relationships) with strict dependency ordering, head linkage, duplicate flag tracking, and audit trail. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 3. Privileges & Access Grants
-- -----------------------------------------------------------------------------
-- Revoke all direct execution from PUBLIC and anon
REVOKE ALL ON FUNCTION public.promote_import_batch(UUID) FROM PUBLIC, anon;

-- Grant execution to authenticated (function verifies public.is_admin() internally)
GRANT EXECUTE ON FUNCTION public.promote_import_batch(UUID) TO authenticated;
