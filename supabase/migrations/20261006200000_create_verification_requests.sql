-- =============================================================================
-- Migration: 20261006200000_create_verification_requests.sql
-- Purpose:   Create verification requests schema, RLS policies, and secure
--             server-side RPC functions for record verification lifecycle:
--             1. public.verification_request_status enum
--             2. public.verification_requests table with indexes & constraints
--             3. public.handle_verification_request_update_guard trigger
--             4. public.submit_verification_request RPC
--             5. public.approve_verification_request RPC
--             6. public.reject_verification_request RPC
--             7. public.cancel_verification_request RPC
--             8. Row Level Security policies and privilege hardening
-- Phase:     Phase 9 — Subtask 1 (Verification Requests Schema, RLS & Secure Review RPCs)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER BOUNDARY:
--    A census Person record represents an immutable genealogical census identity.
--    Verification validates the authenticity and accuracy of census data.
--    Verification DOES NOT claim or link a user account to the Person record.
--    persons.user_id is NEVER modified as part of the verification lifecycle.
--
-- 2. CLAIM != VERIFICATION:
--    Claiming (public.person_claims) links user identity to a person record.
--    Verification (public.verification_requests) attests to community accuracy.
--    These are completely independent domain workflows.
--
-- 3. VERIFICATION != RECORD OWNERSHIP:
--    Verifying a person or family marks it community-approved.
--    It does not transfer ownership, change created_by, or alter family roles.
--
-- 4. SCOPE IS STRICTLY PERSON AND FAMILY:
--    entity_type is restricted to ('PERSON', 'FAMILY').
--    No synthetic entities or arbitrary types are permitted.
--
-- 5. SINGLE ACTIVE PENDING REQUEST PER ENTITY:
--    A partial unique index guarantees that at most one PENDING verification
--    request can exist per (entity_type, entity_id) target.
--
-- 6. STRICT REVIEWER AUTHORIZATION:
--    Review actions (approve/reject) are strictly guarded by public.is_community_moderator()
--    (COMMUNITY_MODERATOR, ADMIN, SUPER_ADMIN).
--
-- 7. ATOMICITY & AUDIT TRAIL:
--    All state transitions, target entity updates, and audit logging occur
--    within atomic database transactions.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum: public.verification_request_status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'verification_request_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.verification_request_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.verification_request_status IS
  'Lifecycle status for verification requests: PENDING, APPROVED, REJECTED, CANCELLED.';

-- -----------------------------------------------------------------------------
-- 2. Table: public.verification_requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target entity boundary: strictly PERSON or FAMILY
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Requester attribution
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Lifecycle status
  status public.verification_request_status NOT NULL DEFAULT 'PENDING',

  -- Optional requester explanation
  supporting_notes TEXT,

  -- Mandatory reviewer explanation on rejection
  rejection_reason TEXT,

  -- Reviewer attribution and timestamp
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT verification_requests_entity_type_check
    CHECK (entity_type IN ('PERSON', 'FAMILY')),

  CONSTRAINT verification_requests_notes_length_check
    CHECK (supporting_notes IS NULL OR char_length(supporting_notes) <= 1000),

  CONSTRAINT verification_requests_rejection_reason_length_check
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),

  CONSTRAINT verification_requests_review_consistency_check
    CHECK (
      (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
      OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL)
      OR (status IN ('PENDING', 'CANCELLED') AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
    )
);

COMMENT ON TABLE public.verification_requests IS
  'Verification requests submitted by community members to verify Person or Family census records.';

COMMENT ON COLUMN public.verification_requests.entity_type IS 'Target entity type: strictly PERSON or FAMILY.';
COMMENT ON COLUMN public.verification_requests.entity_id IS 'Target entity UUID (persons.id or families.id).';
COMMENT ON COLUMN public.verification_requests.requester_id IS 'User ID of the community member requesting verification.';
COMMENT ON COLUMN public.verification_requests.status IS 'Current lifecycle status (PENDING, APPROVED, REJECTED, CANCELLED).';
COMMENT ON COLUMN public.verification_requests.supporting_notes IS 'Optional rationale or context provided by requester (max 1000 chars).';
COMMENT ON COLUMN public.verification_requests.rejection_reason IS 'Mandatory rationale provided by reviewer if rejected (max 1000 chars).';
COMMENT ON COLUMN public.verification_requests.reviewed_by IS 'Moderator or administrator who reviewed the request.';
COMMENT ON COLUMN public.verification_requests.reviewed_at IS 'Timestamp when the request was reviewed.';

-- -----------------------------------------------------------------------------
-- 3. Indexes for Performance & Concurrency Safety
-- -----------------------------------------------------------------------------

-- Partial unique index: at most ONE pending request per target entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending
  ON public.verification_requests (entity_type, entity_id)
  WHERE status = 'PENDING';

-- Foreign key & lookup indexes
CREATE INDEX IF NOT EXISTS idx_verification_requests_requester_id
  ON public.verification_requests (requester_id);

CREATE INDEX IF NOT EXISTS idx_verification_requests_entity
  ON public.verification_requests (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_verification_requests_status
  ON public.verification_requests (status);

CREATE INDEX IF NOT EXISTS idx_verification_requests_created_at
  ON public.verification_requests (created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Trigger: Enforce Terminal State Machine Integrity
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_verification_request_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal status cannot be transitioned
  IF OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Verification request status cannot be changed from terminal state % to %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  -- Only PENDING -> APPROVED, REJECTED, CANCELLED is allowed
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid verification request status transition: % -> %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_verification_request_update_guard() IS
  'Trigger function: enforces verification request state machine. Only PENDING -> APPROVED/REJECTED/CANCELLED is allowed.';

DROP TRIGGER IF EXISTS trg_verification_requests_status_guard ON public.verification_requests;
CREATE TRIGGER trg_verification_requests_status_guard
  BEFORE UPDATE OF status ON public.verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_verification_request_update_guard();

-- -----------------------------------------------------------------------------
-- 5. RPC Functions
-- -----------------------------------------------------------------------------

-- 5.1 public.submit_verification_request
CREATE OR REPLACE FUNCTION public.submit_verification_request(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_supporting_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_clean_type TEXT;
  v_clean_notes TEXT;
  v_person RECORD;
  v_family RECORD;
  v_request_id UUID;
  v_is_moderator BOOLEAN;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot submit verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate entity type
  v_clean_type := upper(trim(COALESCE(p_entity_type, '')));
  IF v_clean_type NOT IN ('PERSON', 'FAMILY') THEN
    RAISE EXCEPTION 'Invalid entity type "%". Must be "PERSON" or "FAMILY".', p_entity_type
      USING ERRCODE = '23514';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entity ID is required.' USING ERRCODE = '23514';
  END IF;

  -- 3. Validate notes length
  v_clean_notes := trim(COALESCE(p_supporting_notes, ''));
  IF char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Supporting notes must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  END IF;

  v_is_moderator := public.is_community_moderator();

  -- 4. Entity-specific validation and authorization
  IF v_clean_type = 'PERSON' THEN
    -- Lock and validate person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = p_entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Person % does not exist.', p_entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot verify a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    IF v_person.verification_status = 'VERIFIED' THEN
      RAISE EXCEPTION 'Person is already verified.' USING ERRCODE = '23514';
    END IF;

    IF v_person.verification_status = 'PENDING' THEN
      RAISE EXCEPTION 'Person already has a pending verification.' USING ERRCODE = '23514';
    END IF;

    -- Authorization check: creator, linked individual, or moderator
    IF NOT (
      v_person.created_by = v_caller
      OR (v_person.user_id IS NOT NULL AND v_person.user_id = v_caller)
      OR v_is_moderator
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only the record creator, linked individual, or moderator can request verification.'
        USING ERRCODE = '42501';
    END IF;

    -- Update target entity verification status to PENDING
    UPDATE public.persons
    SET
      verification_status = 'PENDING',
      updated_at = NOW()
    WHERE id = v_person.id;

  ELSIF v_clean_type = 'FAMILY' THEN
    -- Lock and validate family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = p_entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Family % does not exist.', p_entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    IF v_family.verification_status = 'VERIFIED' THEN
      RAISE EXCEPTION 'Family is already verified.' USING ERRCODE = '23514';
    END IF;

    IF v_family.verification_status = 'PENDING' THEN
      RAISE EXCEPTION 'Family already has a pending verification.' USING ERRCODE = '23514';
    END IF;

    -- Authorization check: creator or moderator
    IF NOT (
      v_family.created_by = v_caller
      OR v_is_moderator
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only the family creator or moderator can request verification.'
        USING ERRCODE = '42501';
    END IF;

    -- Update target entity verification status to PENDING
    UPDATE public.families
    SET
      verification_status = 'PENDING',
      updated_at = NOW()
    WHERE id = v_family.id;
  END IF;

  -- 5. Insert verification request row
  INSERT INTO public.verification_requests (
    entity_type,
    entity_id,
    requester_id,
    status,
    supporting_notes
  ) VALUES (
    v_clean_type,
    p_entity_id,
    v_caller,
    'PENDING',
    v_clean_notes
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) IS
  'Submits a verification request for a Person or Family census record. Atomically sets target entity to PENDING.';

-- 5.2 public.approve_verification_request
CREATE OR REPLACE FUNCTION public.approve_verification_request(
  p_request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_req RECORD;
  v_person RECORD;
  v_family RECORD;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot approve verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can approve verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock and fetch request row
  SELECT * INTO v_req
  FROM public.verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request % does not exist.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot approve verification request: request is in % state, expected PENDING.', v_req.status
      USING ERRCODE = '23514';
  END IF;

  -- 4. Target entity validation and state transition
  IF v_req.entity_type = 'PERSON' THEN
    -- Lock target person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot verify a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_person.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot approve verification request: target person is in % verification status, expected PENDING.',
        v_person.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.persons
    SET
      verification_status = 'VERIFIED',
      updated_at = NOW()
    WHERE id = v_person.id;

    -- Audit log event for person verification
    PERFORM public.log_audit_event(
      'PERSON_VERIFIED'::public.audit_action,
      'person',
      v_req.entity_id,
      jsonb_build_object('verification_status', v_person.verification_status),
      jsonb_build_object('verification_status', 'VERIFIED'),
      jsonb_build_object(
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );

  ELSIF v_req.entity_type = 'FAMILY' THEN
    -- Lock target family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_family.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot approve verification request: target family is in % verification status, expected PENDING.',
        v_family.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.families
    SET
      verification_status = 'VERIFIED',
      updated_at = NOW()
    WHERE id = v_family.id;

    -- Audit log event for family verification
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      v_req.entity_id,
      jsonb_build_object('verification_status', v_family.verification_status),
      jsonb_build_object('verification_status', 'VERIFIED'),
      jsonb_build_object(
        'action_type', 'FAMILY_VERIFIED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );
  END IF;

  -- 5. Update verification request record
  UPDATE public.verification_requests
  SET
    status = 'APPROVED',
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_req.id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.approve_verification_request(UUID) IS
  'Atomically approves a verification request, updating target entity to VERIFIED and logging an audit event. Requires moderator role.';

-- 5.3 public.reject_verification_request
CREATE OR REPLACE FUNCTION public.reject_verification_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_req RECORD;
  v_person RECORD;
  v_family RECORD;
  v_clean_reason TEXT;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot reject verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can reject verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate rejection reason
  v_clean_reason := trim(COALESCE(p_rejection_reason, ''));
  IF char_length(v_clean_reason) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required and cannot be empty.' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'Rejection reason must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;

  -- 4. Lock and fetch request row
  SELECT * INTO v_req
  FROM public.verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request % does not exist.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot reject verification request: request is in % state, expected PENDING.', v_req.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Revert target entity verification status back to UNVERIFIED
  IF v_req.entity_type = 'PERSON' THEN
    -- Lock target person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot reject verification for a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot reject verification for a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_person.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot reject verification request: target person is in % verification status, expected PENDING.',
        v_person.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.persons
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_person.id;

    -- Audit log event for person verification rejection
    PERFORM public.log_audit_event(
      'PERSON_VERIFICATION_REJECTED'::public.audit_action,
      'person',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED', 'rejection_reason', v_clean_reason),
      jsonb_build_object(
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );

  ELSIF v_req.entity_type = 'FAMILY' THEN
    -- Lock target family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot reject verification for a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_family.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot reject verification request: target family is in % verification status, expected PENDING.',
        v_family.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.families
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_family.id;

    -- Audit log event for family verification rejection
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED', 'rejection_reason', v_clean_reason),
      jsonb_build_object(
        'action_type', 'FAMILY_VERIFICATION_REJECTED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );
  END IF;

  -- 6. Update verification request record
  UPDATE public.verification_requests
  SET
    status = 'REJECTED',
    rejection_reason = v_clean_reason,
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_req.id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.reject_verification_request(UUID, TEXT) IS
  'Atomically rejects a verification request with a mandatory reason, reverting target entity to UNVERIFIED. Requires moderator role.';

-- 5.4 public.cancel_verification_request
CREATE OR REPLACE FUNCTION public.cancel_verification_request(
  p_request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_req RECORD;
  v_person RECORD;
  v_family RECORD;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot cancel verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock and fetch request row
  SELECT * INTO v_req
  FROM public.verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request % does not exist.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot cancel verification request: request is in % state, expected PENDING.', v_req.status
      USING ERRCODE = '23514';
  END IF;

  -- 3. Authorization check: original requester or community moderator
  IF NOT (
    v_req.requester_id = v_caller
    OR public.is_community_moderator()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only the original requester or a community moderator can cancel a verification request.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Revert target entity verification status back to UNVERIFIED
  IF v_req.entity_type = 'PERSON' THEN
    -- Lock target person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot cancel verification request for a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot cancel verification request for a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_person.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot cancel verification request: target person is in % verification status, expected PENDING.',
        v_person.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.persons
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_person.id;

    -- Audit log event for person verification cancellation (using existing ADMIN_ACTION)
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'person',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED'),
      jsonb_build_object(
        'action_type', 'PERSON_VERIFICATION_CANCELLED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'cancelled_by', v_caller,
        'entity_type', 'PERSON',
        'entity_id', v_req.entity_id,
        'previous_status', 'PENDING',
        'resulting_status', 'UNVERIFIED'
      )
    );

  ELSIF v_req.entity_type = 'FAMILY' THEN
    -- Lock target family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot cancel verification request for a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_family.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot cancel verification request: target family is in % verification status, expected PENDING.',
        v_family.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.families
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_family.id;

    -- Audit log event for family verification cancellation (using existing ADMIN_ACTION)
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED'),
      jsonb_build_object(
        'action_type', 'FAMILY_VERIFICATION_CANCELLED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'cancelled_by', v_caller,
        'entity_type', 'FAMILY',
        'entity_id', v_req.entity_id,
        'previous_status', 'PENDING',
        'resulting_status', 'UNVERIFIED'
      )
    );
  END IF;

  -- 5. Update verification request record
  UPDATE public.verification_requests
  SET
    status = 'CANCELLED',
    updated_at = NOW()
  WHERE id = v_req.id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.cancel_verification_request(UUID) IS
  'Atomically cancels a pending verification request by the requester or moderator, reverting target entity to UNVERIFIED and logging an audit event.';

-- -----------------------------------------------------------------------------
-- 6. Row Level Security Policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- 6.1 SELECT policies: requester can read own requests; moderators can read all
DROP POLICY IF EXISTS "verification_requests_select_own" ON public.verification_requests;
CREATE POLICY "verification_requests_select_own"
  ON public.verification_requests
  FOR SELECT
  USING (auth.uid() = requester_id);

DROP POLICY IF EXISTS "verification_requests_select_moderator" ON public.verification_requests;
CREATE POLICY "verification_requests_select_moderator"
  ON public.verification_requests
  FOR SELECT
  USING (public.is_community_moderator());

-- 6.2 Direct client mutations denied (all mutations must proceed via secure RPCs)
DROP POLICY IF EXISTS "verification_requests_insert_deny" ON public.verification_requests;
CREATE POLICY "verification_requests_insert_deny"
  ON public.verification_requests
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "verification_requests_update_deny" ON public.verification_requests;
CREATE POLICY "verification_requests_update_deny"
  ON public.verification_requests
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "verification_requests_delete_deny" ON public.verification_requests;
CREATE POLICY "verification_requests_delete_deny"
  ON public.verification_requests
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 7. Privilege Hardening
-- -----------------------------------------------------------------------------

-- Revoke all table privileges from PUBLIC and anon
REVOKE ALL ON public.verification_requests FROM PUBLIC;
REVOKE ALL ON public.verification_requests FROM anon;

-- Grant SELECT only to authenticated role (subject to RLS)
GRANT SELECT ON public.verification_requests TO authenticated;

-- Function execution privileges: authenticated only; anon and PUBLIC revoked
REVOKE ALL ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_verification_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_verification_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_verification_request(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_verification_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_verification_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_verification_request(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_verification_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_verification_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_verification_request(UUID) TO authenticated;
