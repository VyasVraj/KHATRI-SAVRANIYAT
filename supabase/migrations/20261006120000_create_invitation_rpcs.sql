-- =============================================================================
-- Migration: 20261006120000_create_invitation_rpcs.sql
-- Purpose:   Create secure, atomic server-side RPC functions for the family
--             invitation lifecycle:
--             1. public.create_family_invitation
--             2. public.get_invitation_by_token
--             3. public.accept_invitation
-- Phase:     Phase 8 — Subtask 4A (Invitation RPC Hardening & Migration)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER BOUNDARY:
--    A census Person record represents a real-world human census entity.
--    A user account (auth.users / public.profiles) represents an authenticated account.
--    Accepting a family invitation adds the specified person to family_members.
--    Accepting an invitation DOES NOT claim the Person record.
--    persons.user_id is NEVER modified as part of invitation acceptance.
--    The claim workflow (approve_person_claim) remains the ONLY path to link user_id.
--
-- 2. FAMILY MEMBERSHIP != PERSON OWNERSHIP:
--    Adding a person to family_members does not grant ownership of that Person record.
--
-- 3. INVITATION != CLAIM:
--    Invitations are family-scoped membership mechanisms, not identity claims.
--
-- 4. FAMILY MEMBERSHIP != GENEALOGICAL RELATIONSHIP:
--    Invitations do not create or alter rows in public.relationships.
--
-- 5. NO SYNTHETIC PEOPLE:
--    A family invitation requires an existing, active, living census Person record.
--    No Person records are fabricated.
--
-- 6. TOKEN SECURITY & PRIVILEGE HARDENING:
--    Plaintext tokens are NEVER stored in the database.
--    Clients generate a 256-bit cryptographically secure token, compute its
--    SHA-256 hash, and pass only the 64-character hex hash to the database.
--    The stored token_hash is NEVER exposed to clients or returned by functions.
--
-- 7. ATOMICITY:
--    Acceptance validates, locks, handles family membership, marks the invitation
--    ACCEPTED, and logs audit events in a single atomic transaction.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Database Integrity: Unique Active Pending Invitation Constraint
-- -----------------------------------------------------------------------------
-- Enforces at the database engine level that at most one active PENDING
-- invitation can exist for any (family_id, person_id) pair.
-- Historical invitations (ACCEPTED, REVOKED, EXPIRED) are excluded from the index
-- predicate and do not block subsequent invitations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_pending_per_person
  ON public.invitations (family_id, person_id)
  WHERE status = 'PENDING';

-- -----------------------------------------------------------------------------
-- 1. Function: public.create_family_invitation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_invitation(
  p_family_id UUID,
  p_person_id UUID,
  p_invited_email TEXT,
  p_role public.family_role,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invitation_id UUID;
  v_clean_email TEXT;
  v_family RECORD;
  v_person RECORD;
  v_existing_pending RECORD;
BEGIN
  -- 1. Authenticate caller
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a family invitation.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate family_id is supplied (family-scoped invitation requirement)
  IF p_family_id IS NULL THEN
    RAISE EXCEPTION 'family_id is required for family invitations.'
      USING ERRCODE = '23514';
  END IF;

  -- 3. Validate target family exists, is active, and caller is authorized
  SELECT id, family_name, created_by, status, deleted_at INTO v_family
  FROM public.families
  WHERE id = p_family_id;

  IF v_family.id IS NULL OR v_family.deleted_at IS NOT NULL OR v_family.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target family % does not exist or is not active.', p_family_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Authorization check: caller must be community moderator or family creator
  IF NOT (
    public.is_community_moderator()
    OR v_family.created_by = v_caller
  ) THEN
    RAISE EXCEPTION 'You are not authorized to create invitations for family %.', p_family_id
      USING ERRCODE = '42501';
  END IF;

  -- 4. Validate person_id is supplied (concrete census seat requirement)
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'person_id is required for family invitations.'
      USING ERRCODE = '23514';
  END IF;

  SELECT id, status, deleted_at, date_of_death INTO v_person
  FROM public.persons
  WHERE id = p_person_id;

  IF v_person.id IS NULL OR v_person.deleted_at IS NOT NULL OR v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target person % does not exist or is not an active census record.', p_person_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot issue an invitation for a deceased person record.'
      USING ERRCODE = '23514';
  END IF;

  -- 5. Validate existing family membership
  -- If person already has an active membership in the family, reject duplicate invitation
  IF EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = p_family_id
      AND person_id = p_person_id
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person % is already an active member of family %.', p_person_id, p_family_id
      USING ERRCODE = '23505';
  END IF;

  -- 6. Check for duplicate pending invitation for this person in this family
  -- Lock any existing pending invitation FOR UPDATE to handle expiration safely under concurrency
  SELECT id, expires_at INTO v_existing_pending
  FROM public.invitations
  WHERE family_id = p_family_id
    AND person_id = p_person_id
    AND status = 'PENDING'
  FOR UPDATE;

  IF v_existing_pending.id IS NOT NULL THEN
    IF v_existing_pending.expires_at > NOW() THEN
      -- A. Active pending invitation exists -> reject as duplicate
      RAISE EXCEPTION 'An active pending invitation already exists for person % in family %.', p_person_id, p_family_id
        USING ERRCODE = '23505';
    ELSE
      -- B. Expired pending invitation exists -> transition to EXPIRED to free the unique constraint and allow replacement
      UPDATE public.invitations
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE id = v_existing_pending.id;
    END IF;
  END IF;

  -- 7. Validate email format
  v_clean_email := lower(trim(p_invited_email));
  IF v_clean_email IS NULL OR char_length(v_clean_email) < 3 OR position('@' in v_clean_email) = 0 THEN
    RAISE EXCEPTION 'A valid recipient email address is required.'
      USING ERRCODE = '23514';
  END IF;

  -- 8. Validate role
  IF p_role IS NULL THEN
    RAISE EXCEPTION 'family_role is required.'
      USING ERRCODE = '23514';
  END IF;

  -- 9. Validate token hash format (must be 64 lowercase hex characters for SHA-256)
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Token hash must be a valid 64-character SHA-256 hexadecimal string.'
      USING ERRCODE = '23514';
  END IF;

  -- 10. Validate expiration timestamp
  IF p_expires_at IS NULL OR p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation expiration must be in the future.'
      USING ERRCODE = '23514';
  END IF;

  -- 11. Insert invitation row with secure token_hash under SECURITY DEFINER
  -- Guarded by idx_invitations_one_pending_per_person unique index against concurrent races
  BEGIN
    INSERT INTO public.invitations (
      family_id,
      person_id,
      invited_email,
      invited_by,
      role,
      token_hash,
      status,
      expires_at
    ) VALUES (
      p_family_id,
      p_person_id,
      v_clean_email,
      v_caller,
      p_role,
      p_token_hash,
      'PENDING'::public.invitation_status,
      p_expires_at
    )
    RETURNING id INTO v_invitation_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'A pending invitation already exists for person % in family %.', p_person_id, p_family_id
        USING ERRCODE = '23505';
  END;

  -- 12. Record audit event (token hash and plain tokens are NEVER logged)
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'invitation',
    v_invitation_id,
    NULL,
    jsonb_build_object(
      'family_id', p_family_id,
      'person_id', p_person_id,
      'invited_email', v_clean_email,
      'role', p_role,
      'expires_at', p_expires_at,
      'status', 'PENDING'
    ),
    jsonb_build_object(
      'action_type', 'CREATE_FAMILY_INVITATION',
      'invited_by', v_caller
    )
  );

  RETURN v_invitation_id;
END;
$$;

COMMENT ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) IS
  'Securely creates a family-scoped member invitation with a validated SHA-256 token hash. '
  'Requires caller to be family creator or community moderator. Plain tokens are never stored.';

-- -----------------------------------------------------------------------------
-- 2. Function: public.get_invitation_by_token
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token_hash TEXT)
RETURNS TABLE (
  id UUID,
  family_id UUID,
  family_name TEXT,
  person_id UUID,
  person_name TEXT,
  invited_email TEXT,
  role public.family_role,
  status public.invitation_status,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strict input validation on hash format
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN; -- Return 0 rows for malformed or empty token hashes
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.family_id,
    f.family_name,
    i.person_id,
    TRIM(CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name)) AS person_name,
    i.invited_email,
    i.role,
    i.status,
    i.expires_at,
    (i.expires_at <= NOW()) AS is_expired
  FROM public.invitations i
  LEFT JOIN public.families f ON f.id = i.family_id
  LEFT JOIN public.persons p ON p.id = i.person_id
  WHERE i.token_hash = p_token_hash;
END;
$$;

COMMENT ON FUNCTION public.get_invitation_by_token(TEXT) IS
  'Resolves an invitation token hash for redemption preview. '
  'Exposes only safe preview fields without returning the token hash or sensitive census data.';

-- -----------------------------------------------------------------------------
-- 3. Function: public.accept_invitation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_inv RECORD;
  v_family RECORD;
  v_person RECORD;
  v_existing_member RECORD;
BEGIN
  -- 1. Caller authentication
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required to accept an invitation.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Token hash format validation
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation token.'
      USING ERRCODE = '23514';
  END IF;

  -- 3. Lock invitation row FOR UPDATE to prevent concurrent redemptions
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Status validation
  IF v_inv.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Invitation is no longer active (status: %).', v_inv.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Expiration validation
  IF v_inv.expires_at <= NOW() THEN
    -- Transition status to EXPIRED
    UPDATE public.invitations
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE id = v_inv.id;

    RAISE EXCEPTION 'Invitation has expired.'
      USING ERRCODE = '23514';
  END IF;

  -- 6. Family validation
  SELECT id, family_name, status, deleted_at INTO v_family
  FROM public.families
  WHERE id = v_inv.family_id;

  IF v_family.id IS NULL OR v_family.deleted_at IS NOT NULL OR v_family.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target family does not exist or is inactive.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 7. Person validation (PERSON != USER: person is NOT claimed by this operation)
  SELECT id, status, deleted_at, date_of_death INTO v_person
  FROM public.persons
  WHERE id = v_inv.person_id;

  IF v_person.id IS NULL OR v_person.deleted_at IS NOT NULL OR v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target person record does not exist or is inactive.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot accept an invitation for a deceased person record.'
      USING ERRCODE = '23514';
  END IF;

  -- 8. Existing family membership handling (family_members uses UNIQUE (family_id, person_id))
  SELECT id, role, is_head, joined_at, left_at, added_by INTO v_existing_member
  FROM public.family_members
  WHERE family_id = v_inv.family_id
    AND person_id = v_inv.person_id;

  IF v_existing_member.id IS NOT NULL THEN
    IF v_existing_member.left_at IS NULL THEN
      -- Case A: Active membership already exists.
      -- Person is already an active member. Satisfy invitation without inserting duplicate.
      NULL;
    ELSE
      -- Case B: Historical membership exists with left_at set.
      -- Re-activate membership under the invited role while respecting UNIQUE constraint
      -- and ensuring is_head = FALSE so active-head uniqueness cannot be violated.
      UPDATE public.family_members
      SET
        role = v_inv.role,
        is_head = FALSE,
        left_at = NULL,
        joined_at = NOW(),
        added_by = v_caller
      WHERE id = v_existing_member.id;
    END IF;
  ELSE
    -- Case C: No prior membership exists. Insert new family member row.
    INSERT INTO public.family_members (
      family_id,
      person_id,
      role,
      is_head,
      joined_at,
      left_at,
      added_by
    ) VALUES (
      v_inv.family_id,
      v_inv.person_id,
      v_inv.role,
      FALSE,
      NOW(),
      NULL,
      v_caller
    );
  END IF;

  -- 9. Atomically mark invitation ACCEPTED
  UPDATE public.invitations
  SET
    status = 'ACCEPTED',
    accepted_by = v_caller,
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_inv.id;

  -- 10. Record immutable audit log
  PERFORM public.log_audit_event(
    'FAMILY_MEMBER_ADDED'::public.audit_action,
    'family',
    v_inv.family_id,
    NULL,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'person_id', v_inv.person_id,
      'role', v_inv.role,
      'accepted_by', v_caller
    ),
    jsonb_build_object(
      'action_type', 'INVITATION_ACCEPTED',
      'accepted_by', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.accept_invitation(TEXT) IS
  'Atomically accepts an invitation and adds the target person to family_members. '
  'Requires authenticated session. PERSON != USER: does NOT modify persons.user_id.';

-- -----------------------------------------------------------------------------
-- 4. Gate 1 Privilege Hardening on Invitation RPCs & Tables
-- -----------------------------------------------------------------------------

-- 4.1 Direct client insertion on invitations table is revoked in favor of the RPC.
-- All invitation creation MUST route through public.create_family_invitation.
REVOKE INSERT ON public.invitations FROM authenticated;

-- 4.2 create_family_invitation: authenticated only (least privilege: service_role omitted)
REVOKE ALL ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) TO authenticated;

-- 4.3 get_invitation_by_token: anon and authenticated can resolve token hashes for redemption preview
-- (least privilege: service_role omitted)
REVOKE ALL ON FUNCTION public.get_invitation_by_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invitation_by_token(TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO authenticated;

-- 4.4 accept_invitation: authenticated only (least privilege: service_role omitted)
REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;
