-- =============================================================================
-- Migration: 20261107050000_fix_claimed_person_family_visibility.sql
--
-- Description:
--   1. Updates `approve_person_claim(p_claim_id)`:
--      - Atomically links target person record to claimant user ID.
--      - Updates `families.manager_user_id` to claimant if claimed person is Head of Family.
--      - Ensures family membership association is verified and preserved.
--   2. Introduces `public.get_my_family_ids()`:
--      - Returns all family IDs where the authenticated user is creator,
--        designated manager, or has an active linked person record in family_members.
--   3. Guarantees that approved claimants immediately see their family in "My Family".
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helper function: get_my_family_ids()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_family_ids()
RETURNS TABLE (family_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT f.id AS family_id
  FROM public.families f
  WHERE f.deleted_at IS NULL
    AND (
      f.created_by = v_uid
      OR f.manager_user_id = v_uid
      OR EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = f.id
          AND fm.left_at IS NULL
          AND p.user_id = v_uid
          AND p.deleted_at IS NULL
      )
    );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_ids() IS
  'Returns the UUIDs of all families that the authenticated caller created, manages, or is an active member of.';

REVOKE ALL ON FUNCTION public.get_my_family_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_family_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_family_ids() TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. Update approve_person_claim to update family manager when Head is claimed
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

  -- 7.1 If target person is designated Head of a family, update family manager_user_id to claimant
  UPDATE public.families f
  SET
    manager_user_id = v_claim.claimant_id,
    updated_at = NOW()
  WHERE f.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_id = f.id
        AND fm.person_id = v_claim.person_id
        AND (fm.is_head = TRUE OR fm.role = 'HEAD')
        AND fm.left_at IS NULL
    );

  -- 7.2 If claim specifies a family_id and membership doesn't exist yet, associate person to family
  IF v_claim.family_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = v_claim.family_id AND person_id = v_claim.person_id AND left_at IS NULL
  ) THEN
    INSERT INTO public.family_members (
      family_id,
      person_id,
      role,
      is_head,
      added_by
    ) VALUES (
      v_claim.family_id,
      v_claim.person_id,
      'OTHER'::public.family_role,
      FALSE,
      v_caller
    );
  END IF;

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
    'Census Profile Claim Approved',
    'Your claim for "' || v_person_name || '" has been approved. Your account is now linked to this profile and your family is accessible under My Family.',
    '/families',
    'CLAIM',
    v_claim.id,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'person_id', v_claim.person_id,
      'person_name', v_person_name,
      'family_id', v_claim.family_id
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.approve_person_claim(UUID) IS
  'Atomically approves a person claim, links persons.user_id to claimant, updates family manager if Head, and notifies claimant.';

GRANT EXECUTE ON FUNCTION public.approve_person_claim(UUID) TO authenticated;

COMMIT;
