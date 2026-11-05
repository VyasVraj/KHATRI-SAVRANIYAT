-- =============================================================================
-- Migration: 20261006230000_create_duplicate_flags.sql
-- Description: Duplicate Detection Flags & Review Queue (Phase 9 Subtask 4 — Hardened)
--
-- CRITICAL ARCHITECTURAL PRINCIPLES:
-- 1. DETECT != MERGE:
--    Duplicate detection identifies and flags potential duplicate records for human review.
--    This migration NEVER performs automatic merges, overwrites, deletions, or transfers.
-- 2. PERSON != USER:
--    Duplicate flags operate strictly on public.persons and public.families census entities.
--    Never mutates persons.user_id, auth.users, or identity claim records.
-- 3. CANONICAL PAIR ORDERING:
--    Enforces record_a_id < record_b_id via CHECK constraint and unique index,
--    guaranteeing that pair (A, B) and pair (B, A) are identical and cannot produce duplicate flags.
-- 4. NON-DESTRUCTIVE AUDITING:
--    Resolving flags records reviewer identity and resolution timestamp.
--    Uses existing public.audit_action 'ADMIN_ACTION' for zero-downtime audit logging.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Custom Types
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'duplicate_entity_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.duplicate_entity_type AS ENUM ('PERSON', 'FAMILY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'duplicate_flag_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.duplicate_flag_status AS ENUM (
      'OPEN',
      'CONFIRMED_DUPLICATE',
      'NOT_DUPLICATE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'duplicate_confidence' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.duplicate_confidence AS ENUM (
      'STRONG',
      'POSSIBLE',
      'WEAK'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Table: public.duplicate_flags
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.duplicate_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target Entity Scoping
  entity_type public.duplicate_entity_type NOT NULL,
  record_a_id UUID NOT NULL,
  record_b_id UUID NOT NULL,

  -- Detection Metadata
  confidence public.duplicate_confidence NOT NULL,
  match_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  status public.duplicate_flag_status NOT NULL DEFAULT 'OPEN',

  -- Notes & Context
  notes TEXT,
  resolution_notes TEXT,

  -- Provenance & Review
  flagged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Invariant Constraints
  CONSTRAINT duplicate_flags_canonical_order
    CHECK (record_a_id < record_b_id),
  CONSTRAINT duplicate_flags_match_signals_is_array
    CHECK (jsonb_typeof(match_signals) = 'array'),
  CONSTRAINT duplicate_flags_notes_len
    CHECK (notes IS NULL OR length(notes) <= 1000),
  CONSTRAINT duplicate_flags_resolution_notes_len
    CHECK (resolution_notes IS NULL OR length(resolution_notes) <= 1000)
);

COMMENT ON TABLE public.duplicate_flags IS
  'Non-destructive duplicate detection flags for census Person and Family records. Never triggers automatic merging.';

COMMENT ON COLUMN public.duplicate_flags.record_a_id IS
  'First record in the pair. Canonical ordering ensures record_a_id < record_b_id.';

COMMENT ON COLUMN public.duplicate_flags.record_b_id IS
  'Second record in the pair. Canonical ordering ensures record_a_id < record_b_id.';

COMMENT ON COLUMN public.duplicate_flags.match_signals IS
  'JSON array of explainable match reasons (e.g. name, dob, gotra, location).';

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_duplicate_flags_canonical_pair
  ON public.duplicate_flags (entity_type, record_a_id, record_b_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_status_confidence
  ON public.duplicate_flags (status, confidence, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_record_a
  ON public.duplicate_flags (record_a_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_record_b
  ON public.duplicate_flags (record_b_id);

-- Updated-at trigger
DROP TRIGGER IF EXISTS duplicate_flags_handle_updated_at ON public.duplicate_flags;
CREATE TRIGGER duplicate_flags_handle_updated_at
  BEFORE UPDATE ON public.duplicate_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Secure RPCs
-- -----------------------------------------------------------------------------

-- 4.1 public.flag_duplicate_record
CREATE OR REPLACE FUNCTION public.flag_duplicate_record(
  p_entity_type TEXT,
  p_record_a_id UUID,
  p_record_b_id UUID,
  p_confidence TEXT,
  p_match_signals JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_clean_type public.duplicate_entity_type;
  v_clean_confidence public.duplicate_confidence;
  v_first UUID;
  v_second UUID;
  v_flag_id UUID;
  v_clean_notes TEXT;
  v_clean_signals JSONB;
  v_person_a RECORD;
  v_person_b RECORD;
  v_family_a RECORD;
  v_family_b RECORD;
  v_existing_flag RECORD;
BEGIN
  -- 1. Authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot flag duplicate records.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate entity type
  IF upper(trim(COALESCE(p_entity_type, ''))) NOT IN ('PERSON', 'FAMILY') THEN
    RAISE EXCEPTION 'Invalid entity type "%". Must be "PERSON" or "FAMILY".', p_entity_type
      USING ERRCODE = '23514';
  END IF;
  v_clean_type := upper(trim(p_entity_type))::public.duplicate_entity_type;

  -- 3. Validate confidence
  IF upper(trim(COALESCE(p_confidence, ''))) NOT IN ('STRONG', 'POSSIBLE', 'WEAK') THEN
    RAISE EXCEPTION 'Invalid confidence "%". Must be "STRONG", "POSSIBLE", or "WEAK".', p_confidence
      USING ERRCODE = '23514';
  END IF;
  v_clean_confidence := upper(trim(p_confidence))::public.duplicate_confidence;

  -- 4. Validate record IDs & canonical ordering
  IF p_record_a_id IS NULL OR p_record_b_id IS NULL THEN
    RAISE EXCEPTION 'Both record IDs are required.' USING ERRCODE = '23514';
  END IF;

  IF p_record_a_id = p_record_b_id THEN
    RAISE EXCEPTION 'Cannot flag a record as duplicate of itself.' USING ERRCODE = '23514';
  END IF;

  IF p_record_a_id < p_record_b_id THEN
    v_first := p_record_a_id;
    v_second := p_record_b_id;
  ELSE
    v_first := p_record_b_id;
    v_second := p_record_a_id;
  END IF;

  -- 5. Validate match_signals JSON structure (NULL or JSON array)
  IF p_match_signals IS NULL THEN
    v_clean_signals := '[]'::jsonb;
  ELSE
    IF jsonb_typeof(p_match_signals) <> 'array' THEN
      RAISE EXCEPTION 'Match signals must be a JSON array.' USING ERRCODE = '23514';
    END IF;
    v_clean_signals := p_match_signals;
  END IF;

  -- 6. Validate notes length
  v_clean_notes := trim(COALESCE(p_notes, ''));
  IF char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Notes must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  END IF;

  -- 7. Validate target records exist, belong to declared entity_type, and are not soft-deleted/archived
  -- Deterministically lock targets in canonical order (v_first then v_second) to prevent validation/insertion races
  IF v_clean_type = 'PERSON' THEN
    -- Lock and check Record A
    SELECT id, status, deleted_at INTO v_person_a
    FROM public.persons
    WHERE id = v_first
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_first USING ERRCODE = 'P0002';
    END IF;

    IF v_person_a.deleted_at IS NOT NULL OR v_person_a.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived person record %.', v_first
        USING ERRCODE = '23514';
    END IF;

    -- Lock and check Record B
    SELECT id, status, deleted_at INTO v_person_b
    FROM public.persons
    WHERE id = v_second
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_second USING ERRCODE = 'P0002';
    END IF;

    IF v_person_b.deleted_at IS NOT NULL OR v_person_b.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived person record %.', v_second
        USING ERRCODE = '23514';
    END IF;

  ELSIF v_clean_type = 'FAMILY' THEN
    -- Lock and check Record A
    SELECT id, status, deleted_at INTO v_family_a
    FROM public.families
    WHERE id = v_first
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_first USING ERRCODE = 'P0002';
    END IF;

    IF v_family_a.deleted_at IS NOT NULL OR v_family_a.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived family record %.', v_first
        USING ERRCODE = '23514';
    END IF;

    -- Lock and check Record B
    SELECT id, status, deleted_at INTO v_family_b
    FROM public.families
    WHERE id = v_second
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_second USING ERRCODE = 'P0002';
    END IF;

    IF v_family_b.deleted_at IS NOT NULL OR v_family_b.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived family record %.', v_second
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 8. Explicit Handling of Existing Duplicate Flags
  SELECT id, status INTO v_existing_flag
  FROM public.duplicate_flags
  WHERE entity_type = v_clean_type
    AND record_a_id = v_first
    AND record_b_id = v_second
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_flag.status = 'CONFIRMED_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as CONFIRMED_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'NOT_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as NOT_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'OPEN' THEN
      -- Re-use / update existing OPEN flag and return its ID
      UPDATE public.duplicate_flags
      SET
        confidence = v_clean_confidence,
        match_signals = v_clean_signals,
        notes = COALESCE(v_clean_notes, public.duplicate_flags.notes),
        updated_at = NOW()
      WHERE id = v_existing_flag.id
      RETURNING id INTO v_flag_id;

      RETURN v_flag_id;
    END IF;
  END IF;

  -- 9. Insert new OPEN flag with concurrency protection
  BEGIN
    INSERT INTO public.duplicate_flags (
      entity_type,
      record_a_id,
      record_b_id,
      confidence,
      match_signals,
      status,
      notes,
      flagged_by
    ) VALUES (
      v_clean_type,
      v_first,
      v_second,
      v_clean_confidence,
      v_clean_signals,
      'OPEN',
      v_clean_notes,
      v_caller
    )
    RETURNING id INTO v_flag_id;

    RETURN v_flag_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another transaction inserted concurrently: fetch and re-check status
    SELECT id, status INTO v_existing_flag
    FROM public.duplicate_flags
    WHERE entity_type = v_clean_type
      AND record_a_id = v_first
      AND record_b_id = v_second
    FOR UPDATE;

    IF v_existing_flag.status = 'CONFIRMED_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as CONFIRMED_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'NOT_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as NOT_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'OPEN' THEN
      UPDATE public.duplicate_flags
      SET
        confidence = v_clean_confidence,
        match_signals = v_clean_signals,
        notes = COALESCE(v_clean_notes, public.duplicate_flags.notes),
        updated_at = NOW()
      WHERE id = v_existing_flag.id
      RETURNING id INTO v_flag_id;

      RETURN v_flag_id;
    END IF;
  END;
END;
$$;

COMMENT ON FUNCTION public.flag_duplicate_record(TEXT, UUID, UUID, TEXT, JSONB, TEXT) IS
  'Non-destructive duplicate flagging RPC. Validates entity existence, status, signal array, canonical pair order, and lifecycle states.';

-- 4.2 public.resolve_duplicate_flag
CREATE OR REPLACE FUNCTION public.resolve_duplicate_flag(
  p_flag_id UUID,
  p_resolution TEXT,
  p_resolution_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_flag RECORD;
  v_clean_resolution public.duplicate_flag_status;
  v_clean_notes TEXT;
BEGIN
  -- 1. Authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot resolve duplicate flags.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization (Moderator only)
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators can resolve duplicate flags.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate resolution status
  IF upper(trim(COALESCE(p_resolution, ''))) NOT IN ('CONFIRMED_DUPLICATE', 'NOT_DUPLICATE') THEN
    RAISE EXCEPTION 'Invalid resolution "%". Must be "CONFIRMED_DUPLICATE" or "NOT_DUPLICATE".', p_resolution
      USING ERRCODE = '23514';
  END IF;
  v_clean_resolution := upper(trim(p_resolution))::public.duplicate_flag_status;

  -- 4. Validate notes length
  v_clean_notes := trim(COALESCE(p_resolution_notes, ''));
  IF char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Resolution notes must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  END IF;

  -- 5. Lock and check flag
  SELECT * INTO v_flag
  FROM public.duplicate_flags
  WHERE id = p_flag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplicate flag % does not exist.', p_flag_id USING ERRCODE = 'P0002';
  END IF;

  -- Strictly enforce one-way lifecycle: only OPEN flags can be resolved
  IF v_flag.status <> 'OPEN' THEN
    RAISE EXCEPTION 'Duplicate flag % has already been resolved with status "%" and cannot be modified.',
      p_flag_id, v_flag.status
      USING ERRCODE = '23514';
  END IF;

  -- 6. Update flag
  UPDATE public.duplicate_flags
  SET
    status = v_clean_resolution,
    resolution_notes = v_clean_notes,
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_flag.id;

  -- 7. Audit logging via existing ADMIN_ACTION
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'duplicate_flag',
    v_flag.id,
    jsonb_build_object('status', v_flag.status),
    jsonb_build_object(
      'status', v_clean_resolution,
      'resolution_notes', v_clean_notes,
      'action_type', 'DUPLICATE_FLAG_RESOLVED'
    ),
    jsonb_build_object(
      'reviewer_id', v_caller,
      'record_a_id', v_flag.record_a_id,
      'record_b_id', v_flag.record_b_id,
      'entity_type', v_flag.entity_type
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.resolve_duplicate_flag(UUID, TEXT, TEXT) IS
  'Resolves a duplicate flag as CONFIRMED_DUPLICATE or NOT_DUPLICATE. Never merges or deletes records.';

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.duplicate_flags ENABLE ROW LEVEL SECURITY;

-- 5.1 SELECT: Moderators can view all flags
DROP POLICY IF EXISTS "duplicate_flags_select_moderator" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_select_moderator"
  ON public.duplicate_flags
  FOR SELECT
  USING (public.is_community_moderator());

-- 5.2 SELECT: Flagger can view their own reported flags
DROP POLICY IF EXISTS "duplicate_flags_select_own" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_select_own"
  ON public.duplicate_flags
  FOR SELECT
  USING (flagged_by = auth.uid());

-- 5.3 Direct client mutations denied (all mutations proceed via secure RPCs)
DROP POLICY IF EXISTS "duplicate_flags_insert_deny" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_insert_deny"
  ON public.duplicate_flags
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "duplicate_flags_update_deny" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_update_deny"
  ON public.duplicate_flags
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "duplicate_flags_delete_deny" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_delete_deny"
  ON public.duplicate_flags
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 6. Table & RPC Privileges (Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.duplicate_flags FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.duplicate_flags TO authenticated;

REVOKE ALL ON FUNCTION public.flag_duplicate_record(TEXT, UUID, UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_duplicate_record(TEXT, UUID, UUID, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_duplicate_flag(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_duplicate_flag(UUID, TEXT, TEXT) TO authenticated;
