-- =============================================================================
-- Migration: 20261006090000_create_claims_and_invitations.sql
-- Purpose:   Create canonical person_claims and invitations tables, enums,
--             lifecycle transition guards, immutability guards, atomic claim
--             approval and rejection functions, RLS policies, and privileges.
-- Phase:     Phase 8 — Subtask 1 (Claim & Invitation Foundation)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY RULES:
-- 1. PERSON != USER BOUNDARY:
--    A person record (public.persons) represents a real-world human census entity.
--    A user record (auth.users / public.profiles) represents an authenticated account.
--    Claiming bridges a person to a user via persons.user_id.
--    Normal users MUST NEVER directly update persons.user_id.
--    Linkage occurs strictly via verified, authoritative workflows (approve_person_claim).
--
-- 2. ONE-TO-ONE IDENTITY INVARIANT:
--    A user account can be linked to at most ONE person record.
--    A person record can be linked to at most ONE user account.
--    Enforced at DB level by idx_persons_user_id_unique, partial unique indexes
--    on person_claims (at most 1 PENDING claim per person, at most 1 PENDING claim
--    per claimant), and atomic checks in approve_person_claim across ALL person
--    records (regardless of soft-deletion/archival status).
--
-- 3. CLAIM LIFECYCLE STATE MACHINE:
--    - PENDING: Claim submitted by claimant; awaiting review.
--    - APPROVED: Verified by authorized reviewer; atomically links persons.user_id.
--    - REJECTED: Denied by reviewer with mandatory rejection reason.
--    - CANCELLED: Withdrawn by claimant prior to review (reviewed_by, reviewed_at,
--      and rejection_reason are strictly NULL).
--    - Terminal states (APPROVED, REJECTED, CANCELLED) are strictly immutable.
--    - NO DIRECT UPDATE BYPASS: Moderators/admins MUST use approve_person_claim()
--      or reject_person_claim(); direct table UPDATE by moderators is completely blocked.
--
-- 4. HISTORICAL CLAIM PRESERVATION & TARGET INVARIANTS:
--    - person_claims.person_id uses ON DELETE RESTRICT to guarantee claim audit
--      history is never silently wiped by a cascading deletion.
--    - A claim can ONLY target an eligible census person:
--      - Must have user_id IS NULL (unclaimed).
--      - Must have deleted_at IS NULL (not soft-deleted).
--      - Must have status = 'ACTIVE' (not ARCHIVED or DRAFT).
--      - Must have date_of_death IS NULL (deceased individuals cannot be claimed).
--
-- 5. TWO-GATE ACCESS CONTROL & INVITATION TOKEN PROTECTION:
--    - Gate 1: authenticated role granted SELECT, INSERT, UPDATE on person_claims.
--      On invitations, authenticated role is granted column-level SELECT and column-level
--      INSERT strictly on metadata columns — token_hash is withheld from client SELECT
--      and INSERT queries. Token generation and secure hash storage are managed by
--      the server-side workflow.
--      anon and PUBLIC are revoked all table and function privileges (deny-by-default).
--    - Gate 2 (RLS): Strict row-level isolation for claimants, inviters, and moderators.
--
-- 6. IMMUTABLE AUDIT LOGGING:
--    All claim approvals and rejections record immutable events in public.audit_logs
--    via public.log_audit_event() with server-verified actor IDs and timestamps.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums: public.claim_status and public.invitation_status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('public.claim_status') IS NULL THEN
    CREATE TYPE public.claim_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.claim_status IS
  'Lifecycle states for person record ownership claims: '
  'PENDING (submitted, awaiting review), '
  'APPROVED (verified by moderator, person linked), '
  'REJECTED (denied with reason), '
  'CANCELLED (withdrawn by claimant).';

DO $$
BEGIN
  IF to_regtype('public.invitation_status') IS NULL THEN
    CREATE TYPE public.invitation_status AS ENUM (
      'PENDING',
      'ACCEPTED',
      'REVOKED',
      'EXPIRED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.invitation_status IS
  'Lifecycle states for family and platform invitations: '
  'PENDING (active, awaiting redemption), '
  'ACCEPTED (redeemed by invitee), '
  'REVOKED (cancelled by inviter), '
  'EXPIRED (past expiration date).';

-- -----------------------------------------------------------------------------
-- 2. Table: public.person_claims
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.person_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target person census record (ON DELETE RESTRICT preserves claim audit trail)
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,

  -- Claimant user account
  claimant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Claim workflow status
  status public.claim_status NOT NULL DEFAULT 'PENDING',

  -- Evidence and reasoning submitted by claimant
  evidence_notes TEXT,

  -- Reviewer notes on rejection
  rejection_reason TEXT,

  -- Reviewer attribution
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT person_claims_evidence_length
    CHECK (evidence_notes IS NULL OR char_length(evidence_notes) <= 1000),

  CONSTRAINT person_claims_rejection_reason_length
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),

  CONSTRAINT person_claims_reviewed_consistency
    CHECK (
      (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
      OR (status = 'CANCELLED' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
      OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
      OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL)
    )
);

COMMENT ON TABLE public.person_claims IS
  'Formal claims by authenticated users to link their user account to an existing census person record. '
  'PERSON != USER: Claim workflow controls the assignment of persons.user_id.';

COMMENT ON COLUMN public.person_claims.person_id IS 'UUID of the census person record being claimed.';
COMMENT ON COLUMN public.person_claims.claimant_id IS 'UUID of the authenticated user requesting the claim.';
COMMENT ON COLUMN public.person_claims.status IS 'Current lifecycle state (PENDING, APPROVED, REJECTED, CANCELLED).';
COMMENT ON COLUMN public.person_claims.evidence_notes IS 'Explanation or proof of relationship submitted by claimant.';
COMMENT ON COLUMN public.person_claims.rejection_reason IS 'Mandatory rationale provided by reviewer if rejected.';
COMMENT ON COLUMN public.person_claims.reviewed_by IS 'Moderator or administrator who reviewed the claim.';

-- Unique partial indexes ensuring concurrency safety:
-- 1. At most ONE pending claim per person record
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_claims_pending_person
  ON public.person_claims (person_id)
  WHERE status = 'PENDING';

-- 2. At most ONE pending claim per claimant account
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_claims_pending_claimant
  ON public.person_claims (claimant_id)
  WHERE status = 'PENDING';

-- Lookup and sorting indexes
CREATE INDEX IF NOT EXISTS idx_person_claims_person_id
  ON public.person_claims (person_id);

CREATE INDEX IF NOT EXISTS idx_person_claims_claimant_id
  ON public.person_claims (claimant_id);

CREATE INDEX IF NOT EXISTS idx_person_claims_status
  ON public.person_claims (status);

CREATE INDEX IF NOT EXISTS idx_person_claims_created_at
  ON public.person_claims (created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Table: public.invitations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Optional family scoping (family join invitation)
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,

  -- Optional person pre-assignment (seat claim invitation)
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,

  -- Invitee contact (stored normalized lowercase)
  invited_email TEXT NOT NULL,

  -- Inviter attribution
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Proposed family role if family-scoped
  role public.family_role NOT NULL DEFAULT 'EXTENDED',

  -- Cryptographically secure token hash (SHA-256)
  token_hash TEXT NOT NULL UNIQUE,

  -- Lifecycle status
  status public.invitation_status NOT NULL DEFAULT 'PENDING',

  -- Expiration and redemption
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT invitations_email_format
    CHECK (invited_email = lower(trim(invited_email)) AND char_length(invited_email) >= 3),

  CONSTRAINT invitations_expires_after_creation
    CHECK (expires_at > created_at),

  CONSTRAINT invitations_accepted_consistency
    CHECK (
      (status = 'ACCEPTED' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
      OR (status <> 'ACCEPTED' AND accepted_by IS NULL AND accepted_at IS NULL)
    )
);

COMMENT ON TABLE public.invitations IS
  'Invitations sent to email addresses to join a family unit or claim a census person record. '
  'Tokens are stored as secure hashes; plain tokens are never persisted in the database.';

COMMENT ON COLUMN public.invitations.invited_email IS 'Recipient email address (normalized to lowercase).';
COMMENT ON COLUMN public.invitations.token_hash IS 'SHA-256 hash of the secure secret invitation token.';
COMMENT ON COLUMN public.invitations.status IS 'Current lifecycle status (PENDING, ACCEPTED, REVOKED, EXPIRED).';
COMMENT ON COLUMN public.invitations.expires_at IS 'Expiration timestamp beyond which invitation cannot be accepted.';

-- Indexes for invitation queries
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash_pending
  ON public.invitations (token_hash)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_invitations_family_id
  ON public.invitations (family_id)
  WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_person_id
  ON public.invitations (person_id)
  WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_invited_email
  ON public.invitations (lower(invited_email));

CREATE INDEX IF NOT EXISTS idx_invitations_invited_by
  ON public.invitations (invited_by);

-- -----------------------------------------------------------------------------
-- 4. Triggers: Updated-At & Immutability / Lifecycle Guards
-- -----------------------------------------------------------------------------

-- 4.1 Updated-at triggers
DROP TRIGGER IF EXISTS person_claims_handle_updated_at ON public.person_claims;
CREATE TRIGGER person_claims_handle_updated_at
  BEFORE UPDATE ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS invitations_handle_updated_at ON public.invitations;
CREATE TRIGGER invitations_handle_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4.2 person_claims Immutability Guard
CREATE OR REPLACE FUNCTION public.handle_claim_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Identity and creation provenance fields are strictly immutable
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field "id" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.person_id <> OLD.person_id THEN
    RAISE EXCEPTION 'Field "person_id" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.claimant_id <> OLD.claimant_id THEN
    RAISE EXCEPTION 'Field "claimant_id" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field "created_at" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_claim_update_guard() IS
  'Trigger function: enforces immutability of id, person_id, claimant_id, and created_at on person_claims.';

DROP TRIGGER IF EXISTS trg_person_claims_update_guard ON public.person_claims;
CREATE TRIGGER trg_person_claims_update_guard
  BEFORE UPDATE ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_claim_update_guard();

-- 4.3 person_claims Status Transition Guard
CREATE OR REPLACE FUNCTION public.handle_claim_status_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- If status is not changing, permit the update (e.g. updated_at timestamp)
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot be transitioned to any other state
  IF OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Claim status cannot be changed from terminal state % to %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  -- From PENDING, only valid transitions are APPROVED, REJECTED, CANCELLED
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid claim status transition: % -> %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_claim_status_transition_guard() IS
  'Trigger function: enforces claim state machine. Only PENDING -> APPROVED/REJECTED/CANCELLED is allowed. Terminal states are immutable.';

DROP TRIGGER IF EXISTS trg_person_claims_status_guard ON public.person_claims;
CREATE TRIGGER trg_person_claims_status_guard
  BEFORE UPDATE OF status ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_claim_status_transition_guard();

-- 4.4 invitations Immutability Guard
CREATE OR REPLACE FUNCTION public.handle_invitation_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field "id" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION 'Field "family_id" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.person_id IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'Field "person_id" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.invited_by <> OLD.invited_by THEN
    RAISE EXCEPTION 'Field "invited_by" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.token_hash <> OLD.token_hash THEN
    RAISE EXCEPTION 'Field "token_hash" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field "created_at" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_invitation_update_guard() IS
  'Trigger function: enforces immutability of id, family_id, person_id, invited_by, token_hash, and created_at on invitations.';

DROP TRIGGER IF EXISTS trg_invitations_update_guard ON public.invitations;
CREATE TRIGGER trg_invitations_update_guard
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_update_guard();

-- 4.5 invitations Status Transition Guard
CREATE OR REPLACE FUNCTION public.handle_invitation_status_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('ACCEPTED', 'REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Invitation status cannot be changed from terminal state % to %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('ACCEPTED', 'REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Invalid invitation status transition: % -> %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_invitation_status_transition_guard() IS
  'Trigger function: enforces invitation state machine. Only PENDING -> ACCEPTED/REVOKED/EXPIRED is allowed.';

DROP TRIGGER IF EXISTS trg_invitations_status_guard ON public.invitations;
CREATE TRIGGER trg_invitations_status_guard
  BEFORE UPDATE OF status ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_status_transition_guard();

-- -----------------------------------------------------------------------------
-- 5. Privileged Functions: approve_person_claim & reject_person_claim
-- -----------------------------------------------------------------------------

-- 5.1 approve_person_claim
CREATE OR REPLACE FUNCTION public.approve_person_claim(p_claim_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_person RECORD;
  v_caller UUID;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot approve claims.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can approve claims.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock and fetch claim row
  SELECT * INTO v_claim
  FROM public.person_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim % does not exist.', p_claim_id USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot approve claim: claim is in % state, expected PENDING.', v_claim.status
      USING ERRCODE = '23514';
  END IF;

  -- 4. Lock and validate target person record
  SELECT * INTO v_person
  FROM public.persons
  WHERE id = v_claim.person_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target person % does not exist.', v_claim.person_id USING ERRCODE = 'P0002';
  END IF;

  -- Invariant: target person must not already be linked
  IF v_person.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Target person is already linked to user account %.', v_person.user_id
      USING ERRCODE = '23514';
  END IF;

  -- Invariant: target person must not be soft-deleted
  IF v_person.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot claim a soft-deleted person record.' USING ERRCODE = '23514';
  END IF;

  -- Invariant: target person must be active
  IF v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Cannot claim a person with status %; must be ACTIVE.', v_person.status
      USING ERRCODE = '23514';
  END IF;

  -- Invariant: deceased persons cannot be claimed
  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Deceased person records cannot be claimed.' USING ERRCODE = '23514';
  END IF;

  -- 5. Invariant: claimant must not already have ANY linked person record
  -- ONE USER = AT MOST ONE PERSON: A previously linked person (even soft-deleted)
  -- prevents claiming another person.
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE user_id = v_claim.claimant_id
  ) THEN
    RAISE EXCEPTION 'Claimant % is already linked to an existing person record.', v_claim.claimant_id
      USING ERRCODE = '23514';
  END IF;

  -- 6. Atomically update person record to link the claimant
  UPDATE public.persons
  SET
    user_id = v_claim.claimant_id,
    updated_at = NOW()
  WHERE id = v_claim.person_id;

  -- 7. Atomically update claim record to APPROVED
  UPDATE public.person_claims
  SET
    status = 'APPROVED',
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_claim.id;

  -- 8. Record immutable audit log
  PERFORM public.log_audit_event(
    'PERSON_CLAIM_APPROVED'::public.audit_action,
    'person',
    v_claim.person_id,
    jsonb_build_object('user_id', NULL),
    jsonb_build_object('user_id', v_claim.claimant_id),
    jsonb_build_object(
      'claim_id', v_claim.id,
      'claimant_id', v_claim.claimant_id,
      'reviewer_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.approve_person_claim(UUID) IS
  'Atomically approves a pending person claim, linking the claimant user ID to the target census person record. '
  'Requires community moderator or admin role. Emits an immutable audit log event.';

-- 5.2 reject_person_claim
CREATE OR REPLACE FUNCTION public.reject_person_claim(p_claim_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_caller UUID;
  v_clean_reason TEXT;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot reject claims.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can reject claims.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate rejection reason
  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF char_length(v_clean_reason) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required and cannot be empty.' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'Rejection reason must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;

  -- 4. Lock and fetch claim row
  SELECT * INTO v_claim
  FROM public.person_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim % does not exist.', p_claim_id USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot reject claim: claim is in % state, expected PENDING.', v_claim.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Atomically update claim record to REJECTED
  UPDATE public.person_claims
  SET
    status = 'REJECTED',
    rejection_reason = v_clean_reason,
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_claim.id;

  -- 6. Record immutable audit log
  PERFORM public.log_audit_event(
    'PERSON_CLAIM_REJECTED'::public.audit_action,
    'person',
    v_claim.person_id,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'REJECTED', 'rejection_reason', v_clean_reason),
    jsonb_build_object(
      'claim_id', v_claim.id,
      'claimant_id', v_claim.claimant_id,
      'reviewer_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.reject_person_claim(UUID, TEXT) IS
  'Atomically rejects a pending person claim with a mandatory reason. '
  'Requires community moderator or admin role. Emits an immutable audit log event.';

-- -----------------------------------------------------------------------------
-- 6. Row Level Security Policies
-- -----------------------------------------------------------------------------

-- 6.1 Enable RLS on person_claims
ALTER TABLE public.person_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "person_claims_select_own" ON public.person_claims;
CREATE POLICY "person_claims_select_own"
  ON public.person_claims
  FOR SELECT
  USING (auth.uid() = claimant_id);

DROP POLICY IF EXISTS "person_claims_select_admin" ON public.person_claims;
CREATE POLICY "person_claims_select_admin"
  ON public.person_claims
  FOR SELECT
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "person_claims_insert_authenticated" ON public.person_claims;
CREATE POLICY "person_claims_insert_authenticated"
  ON public.person_claims
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND claimant_id = auth.uid()
    AND status = 'PENDING'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
    -- Target person must exist, be unclaimed, active, non-deleted, and living
    AND EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_claims.person_id
        AND p.user_id IS NULL
        AND p.deleted_at IS NULL
        AND p.status = 'ACTIVE'
        AND p.date_of_death IS NULL
    )
    -- Claimant must not already be linked to ANY person record (even soft-deleted)
    AND NOT EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "person_claims_update_cancel" ON public.person_claims;
CREATE POLICY "person_claims_update_cancel"
  ON public.person_claims
  FOR UPDATE
  USING (
    auth.uid() = claimant_id
    AND status = 'PENDING'
  )
  WITH CHECK (
    auth.uid() = claimant_id
    AND status = 'CANCELLED'
  );

-- Note: No direct UPDATE policy for moderators/admins exists on person_claims.
-- Claim approval and rejection MUST proceed strictly through the controlled
-- SECURITY DEFINER functions approve_person_claim() and reject_person_claim().
DROP POLICY IF EXISTS "person_claims_update_admin" ON public.person_claims;

DROP POLICY IF EXISTS "person_claims_delete_deny" ON public.person_claims;
CREATE POLICY "person_claims_delete_deny"
  ON public.person_claims
  FOR DELETE
  USING (FALSE);

-- 6.2 Enable RLS on invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select_inviter" ON public.invitations;
CREATE POLICY "invitations_select_inviter"
  ON public.invitations
  FOR SELECT
  USING (auth.uid() = invited_by);

DROP POLICY IF EXISTS "invitations_select_family_creator" ON public.invitations;
CREATE POLICY "invitations_select_family_creator"
  ON public.invitations
  FOR SELECT
  USING (
    family_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = invitations.family_id
        AND f.created_by = auth.uid()
        AND f.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "invitations_select_admin" ON public.invitations;
CREATE POLICY "invitations_select_admin"
  ON public.invitations
  FOR SELECT
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "invitations_insert_authorized" ON public.invitations;
CREATE POLICY "invitations_insert_authorized"
  ON public.invitations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND invited_by = auth.uid()
    AND status = 'PENDING'
    AND accepted_by IS NULL
    AND accepted_at IS NULL
    AND (
      public.is_community_moderator()
      OR (
        family_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.families f
          WHERE f.id = invitations.family_id
            AND f.created_by = auth.uid()
            AND f.deleted_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "invitations_update_inviter" ON public.invitations;
CREATE POLICY "invitations_update_inviter"
  ON public.invitations
  FOR UPDATE
  USING (
    auth.uid() = invited_by
    AND status = 'PENDING'
  )
  WITH CHECK (
    auth.uid() = invited_by
    AND status = 'REVOKED'
  );

DROP POLICY IF EXISTS "invitations_update_admin" ON public.invitations;
CREATE POLICY "invitations_update_admin"
  ON public.invitations
  FOR UPDATE
  USING (
    public.is_community_moderator()
    AND status = 'PENDING'
  )
  WITH CHECK (
    public.is_community_moderator()
    AND status = 'REVOKED'
  );

DROP POLICY IF EXISTS "invitations_delete_deny" ON public.invitations;
CREATE POLICY "invitations_delete_deny"
  ON public.invitations
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 7. Gate 1 Discretionary Privileges
-- -----------------------------------------------------------------------------

-- Revoke all table privileges from PUBLIC and anon
REVOKE ALL ON public.person_claims FROM PUBLIC;
REVOKE ALL ON public.person_claims FROM anon;

REVOKE ALL ON public.invitations FROM PUBLIC;
REVOKE ALL ON public.invitations FROM anon;

-- Grant least privilege to authenticated role
GRANT SELECT, INSERT, UPDATE ON public.person_claims TO authenticated;

-- Hardened invitation privileges:
-- Ordinary authenticated clients can SELECT metadata columns on invitations,
-- but token_hash is excluded from client-level SELECT.
-- Similarly, authenticated clients are granted INSERT strictly on metadata
-- columns (excluding token_hash) so clients cannot supply arbitrary token hashes.
-- Token generation and secure hash storage will be controlled by the future
-- secure server-side workflow.
REVOKE SELECT, INSERT ON public.invitations FROM authenticated;
GRANT SELECT (
  id,
  family_id,
  person_id,
  invited_email,
  invited_by,
  role,
  status,
  expires_at,
  accepted_by,
  accepted_at,
  created_at,
  updated_at
) ON public.invitations TO authenticated;
GRANT INSERT (
  id,
  family_id,
  person_id,
  invited_email,
  invited_by,
  role,
  status,
  expires_at,
  created_at,
  updated_at
) ON public.invitations TO authenticated;
GRANT UPDATE ON public.invitations TO authenticated;

-- Hardened function execution privileges
REVOKE ALL ON FUNCTION public.approve_person_claim(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_person_claim(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_person_claim(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_person_claim(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_person_claim(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_person_claim(UUID, TEXT) TO authenticated;
