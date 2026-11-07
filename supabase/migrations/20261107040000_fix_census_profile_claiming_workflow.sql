-- ============================================================================
-- Migration: 20261107040000_fix_census_profile_claiming_workflow.sql
-- Description: Fix profile claiming submission, validation, and family head review.
--              1. Adds family_id, assigned_family_head_id, declaration_confirmed to public.person_claims.
--              2. Implements atomic SECURITY DEFINER RPC public.submit_profile_claim.
--              3. Updates approve_person_claim, reject_person_claim.
--              4. Updates RLS policies using SECURITY DEFINER helpers to eliminate
--                 the private-profile subquery RLS trap.
-- ============================================================================

BEGIN;

-- 1. Ensure required columns on public.person_claims
ALTER TABLE public.person_claims
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_family_head_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS declaration_confirmed BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_person_claims_family_id ON public.person_claims(family_id);
CREATE INDEX IF NOT EXISTS idx_person_claims_assigned_head ON public.person_claims(assigned_family_head_id);

-- 2. Security Definer Helper Functions for RLS and Validation
CREATE OR REPLACE FUNCTION public.check_person_claim_eligibility(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND user_id IS NULL
      AND deleted_at IS NULL
      AND status = 'ACTIVE'
      AND date_of_death IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_already_linked(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.persons
    WHERE user_id = p_user_id
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_person_claim_eligibility(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_user_already_linked(UUID) TO authenticated, anon;

-- 3. Update RLS on public.person_claims
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
    AND public.check_person_claim_eligibility(person_claims.person_id)
    AND NOT public.is_user_already_linked(auth.uid())
  );

DROP POLICY IF EXISTS "person_claims_select_family_head" ON public.person_claims;
CREATE POLICY "person_claims_select_family_head"
  ON public.person_claims
  FOR SELECT
  USING (
    family_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = person_claims.family_id
          AND fm.is_head = TRUE
          AND fm.left_at IS NULL
          AND p.user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = person_claims.family_id
          AND (f.created_by = auth.uid() OR f.manager_user_id = auth.uid())
          AND f.deleted_at IS NULL
      )
    )
  );

-- 4. Atomic Profile Claim Submission RPC (submit_profile_claim)
CREATE OR REPLACE FUNCTION public.submit_profile_claim(
  p_person_id UUID,
  p_family_id UUID DEFAULT NULL,
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
  v_inferred_family_id UUID;
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

  -- 5. Infer family if not explicitly provided
  IF p_family_id IS NULL THEN
    SELECT fm.family_id INTO v_inferred_family_id
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p_person_id AND fm.left_at IS NULL AND f.deleted_at IS NULL
    ORDER BY fm.is_head DESC, fm.created_at ASC
    LIMIT 1;

    p_family_id := v_inferred_family_id;
  END IF;

  -- 6. Lock & validate family record if present
  IF p_family_id IS NOT NULL THEN
    SELECT * INTO v_family
    FROM public.families
    WHERE id = p_family_id AND deleted_at IS NULL;

    IF FOUND THEN
      -- Identify the Head of Family
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

      -- Self-Approval Prevention: If claimant is the family head, route to Admin
      IF v_head_user_id = v_caller THEN
        v_head_user_id := NULL;
      END IF;
    ELSE
      p_family_id := NULL;
    END IF;
  END IF;

  -- 7. Insert the person claim
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

  -- 8. Create in-app notification for the Family Head if user exists
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

  -- 9. Record audit log
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'message', 'Your profile claim request has been submitted successfully. It is waiting for approval from your Head of Family.'
  );
END;
$$;

-- 5. Updated approve_person_claim (supports Family Head + Admin)
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
  v_person_name TEXT;
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
    RAISE EXCEPTION 'Claim does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot approve claim: claim is in % state, expected PENDING.', v_claim.status
      USING ERRCODE = '23514';
  END IF;

  -- 3. Authorization check: Caller is Family Head, Family Manager/Creator, or Admin
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
    RAISE EXCEPTION 'Unauthorized: only the Head of Family or community administrators can approve this claim.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Self-approval prevention
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
    RAISE EXCEPTION 'Target person does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_person.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Target person is already linked to a user account.'
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

  -- 7. Atomically link person record to claimant
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

  -- 9. Automatically cancel any other pending claims for this person
  UPDATE public.person_claims
  SET
    status = 'CANCELLED',
    rejection_reason = 'Another claim on this person was approved.',
    updated_at = NOW()
  WHERE person_id = v_claim.person_id
    AND id <> v_claim.id
    AND status = 'PENDING';

  -- 10. Notify claimant of approval
  v_person_name := v_person.first_name || ' ' || v_person.last_name;
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
    'Profile Claim Approved!',
    'Your claim request for "' || v_person_name || '" has been approved. Your account is now linked to this profile.',
    '/people/' || v_claim.person_id::text,
    'person_claims',
    v_claim.id,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'person_id', v_claim.person_id,
      'person_name', v_person_name
    )
  );

  -- 11. Record audit log
  BEGIN
    PERFORM public.log_audit_event(
      'UPDATE'::public.audit_action,
      'person_claims',
      v_claim.id,
      jsonb_build_object('status', 'PENDING'),
      jsonb_build_object(
        'status', 'APPROVED',
        'reviewed_by', v_caller,
        'person_id', v_claim.person_id,
        'claimant_id', v_claim.claimant_id
      ),
      jsonb_build_object('action', 'APPROVE_PROFILE_CLAIM')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN TRUE;
END;
$$;

-- 6. Updated reject_person_claim
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
  v_is_head BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_person_name TEXT;
  v_clean_reason TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot reject claims.' USING ERRCODE = '42501';
  END IF;

  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF length(v_clean_reason) = 0 THEN
    RAISE EXCEPTION 'A valid rejection reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_claim
  FROM public.person_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot reject claim: claim is in % state, expected PENDING.', v_claim.status
      USING ERRCODE = '23514';
  END IF;

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

  SELECT * INTO v_person FROM public.persons WHERE id = v_claim.person_id;
  v_person_name := COALESCE(v_person.first_name || ' ' || v_person.last_name, 'the community person');

  UPDATE public.person_claims
  SET
    status = 'REJECTED',
    rejection_reason = v_clean_reason,
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_claim.id;

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
    'Profile Claim Update',
    'Your claim request for "' || v_person_name || '" was rejected: ' || v_clean_reason,
    '/people/' || v_claim.person_id::text,
    'person_claims',
    v_claim.id,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'person_id', v_claim.person_id,
      'person_name', v_person_name,
      'reason', v_clean_reason
    )
  );

  BEGIN
    PERFORM public.log_audit_event(
      'UPDATE'::public.audit_action,
      'person_claims',
      v_claim.id,
      jsonb_build_object('status', 'PENDING'),
      jsonb_build_object('status', 'REJECTED', 'reason', v_clean_reason, 'reviewed_by', v_caller),
      jsonb_build_object('action', 'REJECT_PROFILE_CLAIM')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN TRUE;
END;
$$;

-- 7. Grant execution privileges
GRANT EXECUTE ON FUNCTION public.submit_profile_claim(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_person_claim(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_person_claim(UUID, TEXT) TO authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
