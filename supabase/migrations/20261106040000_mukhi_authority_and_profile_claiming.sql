-- =============================================================================
-- Migration: 20261106040000_mukhi_authority_and_profile_claiming.sql
-- Description:
--   1. Admin-controlled Mukhi Master Directory with MUK-XXXX unique ID generation,
--      official email, authority status, and automatic verified email matching.
--   2. Four-level authority hierarchy (NORMAL_USER < MUKHI < ADMIN < SUPER_ADMIN)
--      and regional census management permissions.
--   3. Claim My Profile system:
--      - Authenticated user submits claim on unclaimed person record in a family.
--      - Target family's Head of Family receives notification and review dashboard.
--      - Head of Family (or Admin) approves/rejects claim atomically.
--      - On approval, links claimant auth.users.id to persons.user_id without
--        creating duplicate person records or modifying family ownership.
--      - Enforces strict concurrency, self-approval prevention, and full audit logs.
--   4. Restricted birthday greetings matrix (Normal User denied; Mukhi/Admin allowed
--      only to other Mukhis and Community Heads; self-wishes blocked).
--   5. User-level accessibility font size preference persistence.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure user_role enum supports MUKHI
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'MUKHI';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Mukhi Master Directory Extensions on public.community_mukhis
-- -----------------------------------------------------------------------------
ALTER TABLE public.community_mukhis
  ADD COLUMN IF NOT EXISTS mukhi_unique_id TEXT,
  ADD COLUMN IF NOT EXISTS official_email TEXT,
  ADD COLUMN IF NOT EXISTS account_linking_status TEXT NOT NULL DEFAULT 'NOT_REGISTERED',
  ADD COLUMN IF NOT EXISTS authority_status TEXT NOT NULL DEFAULT 'ACTIVE';

-- Add constraints if not already present
DO $$ BEGIN
  ALTER TABLE public.community_mukhis
    ADD CONSTRAINT community_mukhis_unique_mukhi_id UNIQUE (mukhi_unique_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.community_mukhis
    ADD CONSTRAINT community_mukhis_authority_status_check
    CHECK (authority_status IN ('ACTIVE', 'INACTIVE', 'REVOKED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.community_mukhis
    ADD CONSTRAINT community_mukhis_account_linking_status_check
    CHECK (account_linking_status IN ('NOT_REGISTERED', 'LINKED', 'UNLINKED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Populate mukhi_unique_id for existing 118 records (MUK-0001 through MUK-0118)
UPDATE public.community_mukhis
SET mukhi_unique_id = 'MUK-' || lpad(source_serial_number::text, 4, '0')
WHERE mukhi_unique_id IS NULL;

-- Sequence for auto-generating unique IDs for newly added Mukhis (starting at 119)
CREATE SEQUENCE IF NOT EXISTS public.mukhi_unique_id_seq START WITH 119;

-- Trigger function: immediate admin authorization, ID generation, and automatic email matching
CREATE OR REPLACE FUNCTION public.handle_community_mukhi_before_save()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matching_user_id UUID;
BEGIN
  -- Normalize email
  IF NEW.official_email IS NOT NULL THEN
    NEW.official_email := lower(trim(NEW.official_email));
    IF NEW.official_email = '' THEN
      NEW.official_email := NULL;
    END IF;
  END IF;

  -- Auto-generate MUK-XXXX ID if missing
  IF NEW.mukhi_unique_id IS NULL OR trim(NEW.mukhi_unique_id) = '' THEN
    NEW.mukhi_unique_id := 'MUK-' || lpad(nextval('public.mukhi_unique_id_seq')::text, 4, '0');
  END IF;

  -- Default authority status to ACTIVE (No second approval step required for Admin creation)
  IF NEW.authority_status IS NULL THEN
    NEW.authority_status := 'ACTIVE';
  END IF;

  -- Automatic Mukhi Identification through verified Supabase Auth email
  IF NEW.official_email IS NOT NULL AND NEW.authority_status = 'ACTIVE' THEN
    SELECT id INTO v_matching_user_id
    FROM auth.users
    WHERE lower(trim(email)) = NEW.official_email;

    IF v_matching_user_id IS NOT NULL THEN
      NEW.linked_user_id := v_matching_user_id;
      NEW.account_linking_status := 'LINKED';

      -- Automatically upgrade role to MUKHI in profiles
      UPDATE public.profiles
      SET role = 'MUKHI', updated_at = NOW()
      WHERE id = v_matching_user_id
        AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');
    ELSE
      IF NEW.linked_user_id IS NULL THEN
        NEW.account_linking_status := 'NOT_REGISTERED';
      END IF;
    END IF;
  ELSE
    IF NEW.linked_user_id IS NULL THEN
      NEW.account_linking_status := 'NOT_REGISTERED';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_mukhis_before_save ON public.community_mukhis;
CREATE TRIGGER trg_community_mukhis_before_save
  BEFORE INSERT OR UPDATE ON public.community_mukhis
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_community_mukhi_before_save();

-- -----------------------------------------------------------------------------
-- 3. Four-Level Authority Helper Functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_authority_level(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_is_mukhi BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'ANONYMOUS';
  END IF;

  SELECT role::text INTO v_role
  FROM public.profiles
  WHERE id = p_user_id AND is_active = TRUE;

  IF v_role = 'SUPER_ADMIN' THEN
    RETURN 'SUPER_ADMIN';
  ELSIF v_role = 'ADMIN' THEN
    RETURN 'ADMIN';
  ELSIF v_role IN ('MUKHI', 'COMMUNITY_MUKHI') THEN
    RETURN 'MUKHI';
  END IF;

  -- Check if actively linked in community_mukhis
  SELECT EXISTS (
    SELECT 1 FROM public.community_mukhis
    WHERE linked_user_id = p_user_id
      AND is_active = TRUE
      AND authority_status = 'ACTIVE'
  ) INTO v_is_mukhi;

  IF v_is_mukhi THEN
    RETURN 'MUKHI';
  END IF;

  RETURN 'NORMAL_USER';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_mukhi_or_above(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.get_user_authority_level(p_user_id) IN ('MUKHI', 'ADMIN', 'SUPER_ADMIN');
$$;

-- RPC for client to synchronize Mukhi status upon login/session refresh
CREATE OR REPLACE FUNCTION public.sync_my_mukhi_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_mukhi RECORD;
  v_current_level TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  SELECT lower(trim(email)) INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NOT NULL THEN
    SELECT * INTO v_mukhi
    FROM public.community_mukhis
    WHERE lower(trim(official_email)) = v_email
      AND authority_status = 'ACTIVE'
      AND is_active = TRUE
    LIMIT 1;

    IF FOUND THEN
      -- Link user ID to Mukhi record
      UPDATE public.community_mukhis
      SET linked_user_id = v_user_id,
          account_linking_status = 'LINKED',
          updated_at = NOW()
      WHERE id = v_mukhi.id;

      -- Update user profile role
      UPDATE public.profiles
      SET role = 'MUKHI', updated_at = NOW()
      WHERE id = v_user_id
        AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');
    END IF;
  END IF;

  v_current_level := public.get_user_authority_level(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'authority_level', v_current_level,
    'is_mukhi', (v_current_level IN ('MUKHI', 'ADMIN', 'SUPER_ADMIN'))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_mukhi_status() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Font Size / Accessibility Preference on Profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS font_size_preference VARCHAR(10) NOT NULL DEFAULT 'DEFAULT';

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_font_size_preference_check
    CHECK (font_size_preference IN ('SMALL', 'DEFAULT', 'LARGE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.update_my_font_size_preference(p_font_size VARCHAR(10))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller' USING ERRCODE = '42501';
  END IF;

  IF p_font_size NOT IN ('SMALL', 'DEFAULT', 'LARGE') THEN
    RAISE EXCEPTION 'Invalid font size. Allowed: SMALL, DEFAULT, LARGE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET font_size_preference = p_font_size,
      updated_at = NOW()
  WHERE id = auth.uid();

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_font_size_preference(VARCHAR) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Extend public.person_claims for Family-Head Scoped Profile Claiming
-- -----------------------------------------------------------------------------
ALTER TABLE public.person_claims
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_family_head_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS declaration_confirmed BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_person_claims_family_id ON public.person_claims(family_id);
CREATE INDEX IF NOT EXISTS idx_person_claims_assigned_head ON public.person_claims(assigned_family_head_id);

-- RLS Policy: Family Heads and Family Managers can view claims in their family
DROP POLICY IF EXISTS "person_claims_select_family_head" ON public.person_claims;
CREATE POLICY "person_claims_select_family_head"
  ON public.person_claims
  FOR SELECT
  USING (
    family_id IS NOT NULL AND (
      -- Caller is designated Head of Family
      EXISTS (
        SELECT 1 FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = person_claims.family_id
          AND fm.is_head = TRUE
          AND fm.left_at IS NULL
          AND p.user_id = auth.uid()
      )
      OR
      -- Caller is family manager or creator
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = person_claims.family_id
          AND (f.created_by = auth.uid() OR f.manager_user_id = auth.uid())
          AND f.deleted_at IS NULL
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Atomic Profile Claim Submission RPC (submit_profile_claim)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_profile_claim(
  p_person_id UUID,
  p_family_id UUID,
  p_evidence_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_person RECORD;
  v_family RECORD;
  v_head_member RECORD;
  v_head_user_id UUID;
  v_head_person_id UUID;
  v_claim_id UUID;
  v_claimant_name TEXT;
  v_person_name TEXT;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit a profile claim.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate caller does not already have ANY linked person record
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE user_id = v_caller AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Your account is already linked to a community person profile.' USING ERRCODE = '23514';
  END IF;

  -- 3. Check for existing PENDING claim by this claimant
  IF EXISTS (
    SELECT 1 FROM public.person_claims
    WHERE claimant_id = v_caller AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'You already have a pending profile claim request under review.' USING ERRCODE = '23505';
  END IF;

  -- 4. Lock & validate target person record
  SELECT * INTO v_person
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected community person record does not exist or has been removed.' USING ERRCODE = 'P0002';
  END IF;

  IF v_person.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'This profile has already been claimed by another community account.' USING ERRCODE = '23514';
  END IF;

  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Deceased person records cannot be claimed.' USING ERRCODE = '23514';
  END IF;

  IF v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Only active census person records can be claimed.' USING ERRCODE = '23514';
  END IF;

  -- Check for existing PENDING claim for this target person
  IF EXISTS (
    SELECT 1 FROM public.person_claims
    WHERE person_id = p_person_id AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'Another claim request is already pending for this person profile.' USING ERRCODE = '23505';
  END IF;

  -- 5. Lock & validate selected family record
  SELECT * INTO v_family
  FROM public.families
  WHERE id = p_family_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The specified family record does not exist.' USING ERRCODE = 'P0002';
  END IF;

  -- Verify target person is a member of this family
  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = p_family_id AND person_id = p_person_id AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The selected person is not a member of the specified family.' USING ERRCODE = '23514';
  END IF;

  -- 6. Identify the Head of Family
  SELECT fm.person_id, p.user_id INTO v_head_member
  FROM public.family_members fm
  JOIN public.persons p ON p.id = fm.person_id
  WHERE fm.family_id = p_family_id
    AND fm.is_head = TRUE
    AND fm.left_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    v_head_person_id := v_head_member.person_id;
    v_head_user_id := v_head_member.user_id;
  END IF;

  -- Fallback to family creator / manager if head user is unlinked
  IF v_head_user_id IS NULL THEN
    v_head_user_id := COALESCE(v_family.manager_user_id, v_family.created_by);
  END IF;

  -- 7. Rule 5: Self-Approval Prevention
  -- If claimant is themselves the family head, self-approval is prohibited!
  -- In that case, claim must be routed to Admin for exceptional review.
  IF v_head_user_id = v_caller THEN
    -- Leave assigned head person id for reference, but reviewer will be Admin
    v_head_user_id := NULL;
  END IF;

  -- 8. Insert the person claim
  INSERT INTO public.person_claims (
    person_id,
    claimant_id,
    family_id,
    assigned_family_head_id,
    status,
    evidence_notes,
    declaration_confirmed
  ) VALUES (
    p_person_id,
    v_caller,
    p_family_id,
    v_head_person_id,
    'PENDING',
    trim(COALESCE(p_evidence_notes, '')),
    TRUE
  ) RETURNING id INTO v_claim_id;

  -- 9. Create in-app notification for the Family Head if user exists
  SELECT display_name INTO v_claimant_name FROM public.profiles WHERE id = v_caller;
  v_person_name := v_person.first_name || ' ' || v_person.last_name;

  IF v_head_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      category,
      type,
      title,
      body,
      action_url,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      v_head_user_id,
      v_caller,
      'CLAIM'::public.notification_category,
      'PROFILE_CLAIM_SUBMITTED',
      'Profile Claim Request',
      COALESCE(v_claimant_name, 'A user') || ' has requested to claim the existing person profile "' || v_person_name || '" in your family record. Please review and approve or reject this request.',
      '/families/' || p_family_id::text,
      'person_claims',
      v_claim_id,
      jsonb_build_object(
        'claim_id', v_claim_id,
        'family_id', p_family_id,
        'person_id', p_person_id,
        'person_name', v_person_name,
        'claimant_name', v_claimant_name
      )
    );
  END IF;

  -- 10. Record audit log
  PERFORM public.log_audit_event(
    'INSERT'::public.audit_action,
    'person_claims',
    v_claim_id,
    NULL,
    jsonb_build_object(
      'claim_id', v_claim_id,
      'person_id', p_person_id,
      'family_id', p_family_id,
      'claimant_id', v_caller,
      'assigned_head_person_id', v_head_person_id
    ),
    jsonb_build_object('action', 'SUBMIT_PROFILE_CLAIM')
  );

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'message', 'Your profile claim request has been submitted successfully. It is waiting for approval from your Head of Family.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_profile_claim(UUID, UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Update approve_person_claim to allow Family Head Approval
-- -----------------------------------------------------------------------------
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
  v_is_head BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_family RECORD;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot approve claims.' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock & fetch claim row
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

  -- 3. Authorization check:
  -- Caller must be either:
  -- (a) The Family Head / Manager of the claim's family, OR
  -- (b) Admin or Super Admin
  v_is_admin := public.is_admin();

  IF v_claim.family_id IS NOT NULL THEN
    -- Check if caller is active Family Head of that family
    SELECT EXISTS (
      SELECT 1 FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = v_claim.family_id
        AND fm.is_head = TRUE
        AND fm.left_at IS NULL
        AND p.user_id = v_caller
    ) INTO v_is_head;

    -- Check if caller is designated family manager or creator
    IF NOT v_is_head THEN
      SELECT EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = v_claim.family_id
          AND (f.created_by = v_caller OR f.manager_user_id = v_caller)
          AND f.deleted_at IS NULL
      ) INTO v_is_head;
    END IF;
  END IF;

  IF NOT (v_is_head OR v_is_admin) THEN
    RAISE EXCEPTION 'Unauthorized: only the Head of Family or community administrators can approve this claim.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Rule 5: Self-Approval Prevention
  -- A user cannot approve their own claim request
  IF v_claim.claimant_id = v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Self-approval is prohibited. Family heads claiming their own profile require administrative review.'
      USING ERRCODE = '42501';
  END IF;

  -- 5. Lock and validate target person record
  SELECT * INTO v_person
  FROM public.persons
  WHERE id = v_claim.person_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target person % does not exist.', v_claim.person_id USING ERRCODE = 'P0002';
  END IF;

  IF v_person.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Target person is already linked to user account %.', v_person.user_id
      USING ERRCODE = '23514';
  END IF;

  IF v_person.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot claim a soft-deleted person record.' USING ERRCODE = '23514';
  END IF;

  IF v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Cannot claim a person with status %; must be ACTIVE.', v_person.status
      USING ERRCODE = '23514';
  END IF;

  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Deceased person records cannot be claimed.' USING ERRCODE = '23514';
  END IF;

  -- 6. Invariant: claimant must not already have ANY linked person record
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE user_id = v_claim.claimant_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Claimant is already linked to an existing person record.'
      USING ERRCODE = '23514';
  END IF;

  -- 7. Atomically link person record to the claimant
  UPDATE public.persons
  SET
    user_id = v_claim.claimant_id,
    updated_at = NOW()
  WHERE id = v_claim.person_id;

  -- 8. Atomically update claim record to APPROVED
  UPDATE public.person_claims
  SET
    status = 'APPROVED',
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_claim.id;

  -- 9. Send in-app notification to claimant
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    v_claim.claimant_id,
    v_caller,
    'CLAIM'::public.notification_category,
    'PROFILE_CLAIM_APPROVED',
    'Profile Claim Approved',
    'Your profile claim for "' || v_person.first_name || ' ' || v_person.last_name || '" has been approved. You can now access and manage your profile.',
    '/people/' || v_claim.person_id::text,
    'person_claims',
    v_claim.id,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'person_id', v_claim.person_id,
      'status', 'APPROVED'
    )
  );

  -- 10. Record immutable audit log
  PERFORM public.log_audit_event(
    'UPDATE'::public.audit_action,
    'person_claims',
    v_claim.id,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'APPROVED', 'user_id', v_claim.claimant_id),
    jsonb_build_object(
      'claim_id', v_claim.id,
      'claimant_id', v_claim.claimant_id,
      'reviewer_id', v_caller,
      'action', 'APPROVE_PROFILE_CLAIM'
    )
  );

  RETURN TRUE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Update reject_person_claim to allow Family Head Rejection
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_person_claim(p_claim_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_person RECORD;
  v_caller UUID;
  v_clean_reason TEXT;
  v_is_head BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot reject claims.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate rejection reason
  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF char_length(v_clean_reason) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required and cannot be empty.' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'Rejection reason must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;

  -- 3. Lock & fetch claim row
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

  -- 4. Authorization check: Family Head or Admin
  v_is_admin := public.is_admin();

  IF v_claim.family_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = v_claim.family_id
        AND fm.is_head = TRUE
        AND fm.left_at IS NULL
        AND p.user_id = v_caller
    ) INTO v_is_head;

    IF NOT v_is_head THEN
      SELECT EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = v_claim.family_id
          AND (f.created_by = v_caller OR f.manager_user_id = v_caller)
          AND f.deleted_at IS NULL
      ) INTO v_is_head;
    END IF;
  END IF;

  IF NOT (v_is_head OR v_is_admin) THEN
    RAISE EXCEPTION 'Unauthorized: only the Head of Family or community administrators can reject this claim.'
      USING ERRCODE = '42501';
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

  SELECT first_name, last_name INTO v_person FROM public.persons WHERE id = v_claim.person_id;

  -- 6. Send in-app notification to claimant
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    v_claim.claimant_id,
    v_caller,
    'CLAIM'::public.notification_category,
    'PROFILE_CLAIM_REJECTED',
    'Profile Claim Rejected',
    'Your profile claim for "' || COALESCE(v_person.first_name || ' ' || v_person.last_name, 'the requested record') || '" was not approved. Reason: ' || v_clean_reason,
    '/people/' || v_claim.person_id::text,
    'person_claims',
    v_claim.id,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'person_id', v_claim.person_id,
      'status', 'REJECTED',
      'reason', v_clean_reason
    )
  );

  -- 7. Record immutable audit log
  PERFORM public.log_audit_event(
    'UPDATE'::public.audit_action,
    'person_claims',
    v_claim.id,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'REJECTED', 'rejection_reason', v_clean_reason),
    jsonb_build_object(
      'claim_id', v_claim.id,
      'claimant_id', v_claim.claimant_id,
      'reviewer_id', v_caller,
      'action', 'REJECT_PROFILE_CLAIM'
    )
  );

  RETURN TRUE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Restricted Birthday Greeting RPC (send_birthday_greeting)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_birthday_greeting(
  p_recipient_person_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_caller_role TEXT;
  v_recipient_person RECORD;
  v_is_recipient_mukhi BOOLEAN := FALSE;
  v_is_recipient_community_head BOOLEAN := FALSE;
BEGIN
  -- 1. Validate authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to send birthday greetings.' USING ERRCODE = '42501';
  END IF;

  -- 2. Determine caller's authoritative role
  v_caller_role := public.get_user_authority_level(v_caller);

  -- Matrix Rule 1: Normal User is DENIED from sending birthday greetings
  IF v_caller_role = 'NORMAL_USER' THEN
    RAISE EXCEPTION 'Normal Users are not permitted to send birthday greetings. Only Mukhis, Admins, and Super Admins may send official greetings.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock & validate recipient person
  SELECT * INTO v_recipient_person
  FROM public.persons
  WHERE id = p_recipient_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient person record does not exist.' USING ERRCODE = 'P0002';
  END IF;

  -- Rule: Self-wishes are DENIED
  IF v_recipient_person.user_id = v_caller THEN
    RAISE EXCEPTION 'You cannot send a birthday greeting to yourself.' USING ERRCODE = '23514';
  END IF;

  -- 4. Check if recipient is a Mukhi
  SELECT EXISTS (
    SELECT 1 FROM public.community_mukhis
    WHERE (linked_person_id = p_recipient_person_id OR (linked_user_id IS NOT NULL AND linked_user_id = v_recipient_person.user_id))
      AND authority_status = 'ACTIVE'
      AND is_active = TRUE
  ) INTO v_is_recipient_mukhi;

  -- 5. Check if recipient is a Community Head (e.g. Panchayat / Committee head / Executive committee member)
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE person_id = p_recipient_person_id AND is_head = TRUE AND left_at IS NULL
  ) INTO v_is_recipient_community_head;

  -- Matrix Rule 2: Allowed ONLY for other Mukhis and Community Heads
  IF NOT (v_is_recipient_mukhi OR v_is_recipient_community_head) THEN
    RAISE EXCEPTION 'Birthday greetings can only be sent to Mukhis and Community Heads.'
      USING ERRCODE = '42501';
  END IF;

  -- 6. Send notification if recipient has a linked account
  IF v_recipient_person.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      category,
      type,
      title,
      body,
      action_url,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      v_recipient_person.user_id,
      v_caller,
      'COMMUNITY'::public.notification_category,
      'BIRTHDAY_GREETING',
      'Warm Birthday Wishes!',
      COALESCE(trim(p_message), 'Wishing you a very happy birthday filled with health, joy, and prosperity from the Community Leadership!'),
      '/people/' || p_recipient_person_id::text,
      'persons',
      p_recipient_person_id,
      jsonb_build_object(
        'sender_role', v_caller_role,
        'recipient_person_id', p_recipient_person_id
      )
    );
  END IF;

  -- 7. Record audit log
  PERFORM public.log_audit_event(
    'INSERT'::public.audit_action,
    'persons',
    p_recipient_person_id,
    NULL,
    jsonb_build_object(
      'sender_user_id', v_caller,
      'sender_role', v_caller_role,
      'recipient_person_id', p_recipient_person_id,
      'message', p_message
    ),
    jsonb_build_object('action', 'SEND_BIRTHDAY_GREETING')
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Birthday greeting sent successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_birthday_greeting(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. Update Directory View to include mukhi_unique_id and authority_status
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.community_mukhis_directory;
CREATE OR REPLACE VIEW public.community_mukhis_directory AS
SELECT
  id,
  source_serial_number,
  mukhi_unique_id,
  full_name,
  gram,
  mobile_number,
  official_email,
  authority_status,
  account_linking_status,
  linked_user_id,
  linked_person_id,
  is_active,
  created_at,
  updated_at
FROM public.community_mukhis
WHERE is_active = TRUE AND authority_status = 'ACTIVE';

GRANT SELECT ON public.community_mukhis_directory TO authenticated;

COMMIT;
