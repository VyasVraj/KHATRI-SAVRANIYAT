-- =============================================================================
-- Migration: 20261105190000_fix_family_directory_and_person_privacy.sql
-- Description: Fix Family Directory visibility for all created families &
--              enforce strict family-based person data visibility (name + age only
--              for other families; full details for same family).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Family Directory Discovery RLS Policy on public.families
-- -----------------------------------------------------------------------------
-- The Family Directory is a discovery/listing feature for authenticated members.
-- All active, non-archived, non-deleted families must be discoverable regardless
-- of which authenticated account originally created them or manages them.

DROP POLICY IF EXISTS "families_select_community" ON public.families;
CREATE POLICY "families_select_community"
  ON public.families
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

COMMENT ON POLICY "families_select_community" ON public.families IS
  'Allows authenticated community members to discover all active, non-archived, non-deleted families in the directory.';

-- Update handle_family_privacy_update_guard to permit SQL migrations/admin operations
CREATE OR REPLACE FUNCTION public.handle_family_privacy_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect modifications to either family privacy column
  IF (NEW.profile_privacy IS DISTINCT FROM OLD.profile_privacy) OR
     (NEW.members_privacy IS DISTINCT FROM OLD.members_privacy) THEN

    -- Verify caller authorization when called from an authenticated user session
    IF auth.uid() IS NOT NULL AND NOT public.can_manage_privacy_settings() THEN
      RAISE EXCEPTION 'Unauthorized: Normal users cannot modify family privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
        USING ERRCODE = '42501';
    END IF;

    -- Record immutable audit log entry if an authenticated session exists
    IF auth.uid() IS NOT NULL THEN
      PERFORM public.log_audit_event(
        'ADMIN_ACTION'::public.audit_action,
        'family',
        NEW.id,
        jsonb_build_object(
          'profile_privacy', OLD.profile_privacy,
          'members_privacy', OLD.members_privacy
        ),
        jsonb_build_object(
          'profile_privacy', NEW.profile_privacy,
          'members_privacy', NEW.members_privacy
        ),
        jsonb_build_object(
          'action_type', 'PRIVACY_SETTING_CHANGED',
          'actor_role', public.get_my_role()
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Temporarily disable the privacy update guard trigger for migration normalization
ALTER TABLE public.families DISABLE TRIGGER trg_family_privacy_update_guard;

-- Backfill pre-existing families created with PRIVATE to COMMUNITY
UPDATE public.families
SET profile_privacy = 'COMMUNITY', members_privacy = 'COMMUNITY'
WHERE profile_privacy = 'PRIVATE' OR profile_privacy IS NULL;

-- Re-enable the privacy update guard trigger immediately after normalization
ALTER TABLE public.families ENABLE TRIGGER trg_family_privacy_update_guard;

-- -----------------------------------------------------------------------------
-- 2. Family Members Discovery RLS Policy on public.family_members
-- -----------------------------------------------------------------------------
-- Authenticated community members can view membership roster rows for all active families.
-- Field-level privacy of the individual persons is strictly enforced via community_persons view.

DROP POLICY IF EXISTS "family_members_select_community" ON public.family_members;
CREATE POLICY "family_members_select_community"
  ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.deleted_at IS NULL
        AND f.status != 'ARCHIVED'
    )
  );

COMMENT ON POLICY "family_members_select_community" ON public.family_members IS
  'Allows authenticated members to view membership rows of active community families.';

-- -----------------------------------------------------------------------------
-- 3. Update create_family_with_head RPC Privacy Defaults
-- -----------------------------------------------------------------------------
-- Ensure new families default to COMMUNITY privacy so they are discoverable in directory.

CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_members_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_existing_person_id UUID DEFAULT NULL,
  p_new_person_first_name TEXT DEFAULT NULL,
  p_new_person_middle_name TEXT DEFAULT NULL,
  p_new_person_last_name TEXT DEFAULT NULL,
  p_new_person_maiden_name TEXT DEFAULT NULL,
  p_new_person_gender public.gender_type DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  family_id UUID,
  head_person_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF trim(p_family_name) = '' THEN
    RAISE EXCEPTION 'Family name cannot be empty.' USING ERRCODE = '22023';
  END IF;

  -- 1. Create or resolve the head person
  IF p_existing_person_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_existing_person_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Specified head person does not exist.' USING ERRCODE = 'P0002';
    END IF;
    v_head_person_id := p_existing_person_id;
  ELSE
    IF p_new_person_first_name IS NULL OR trim(p_new_person_first_name) = '' OR
       p_new_person_last_name IS NULL OR trim(p_new_person_last_name) = '' THEN
      RAISE EXCEPTION 'First name and last name are required for new family head.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      birth_place,
      gotra,
      nukh,
      created_by
    )
    VALUES (
      trim(p_new_person_first_name),
      p_new_person_middle_name,
      trim(p_new_person_last_name),
      p_new_person_maiden_name,
      p_new_person_gender,
      p_new_person_dob,
      p_new_person_birth_place,
      p_gotra,
      p_nukh,
      v_caller_id
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 2. Create the family record
  INSERT INTO public.families (
    family_name,
    city,
    state,
    country,
    description,
    gotra,
    nukh,
    profile_privacy,
    members_privacy,
    created_by,
    manager_user_id
  )
  VALUES (
    trim(p_family_name),
    p_city,
    p_state,
    p_country,
    p_description,
    p_gotra,
    p_nukh,
    COALESCE(p_profile_privacy, 'COMMUNITY'::public.privacy_level),
    COALESCE(p_members_privacy, 'COMMUNITY'::public.privacy_level),
    v_caller_id,
    v_caller_id
  )
  RETURNING id INTO v_family_id;

  -- 3. Add the head person to family_members
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    added_by
  )
  VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    v_caller_id
  );

  RETURN QUERY SELECT v_family_id, v_head_person_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Update Same Family Member Helper Function
-- -----------------------------------------------------------------------------
-- Identifies if the caller belongs to the same family as the target person.
-- Same family includes:
--   - Self (caller linked to target person)
--   - Creator of the target person record
--   - Creator or designated manager of the family containing target person
--   - Family Head of the family containing target person
--   - Active member sharing an active family unit with target person

CREATE OR REPLACE FUNCTION public.is_same_family_member(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      -- 1. Caller is the target person themselves (linked user)
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      -- 2. Caller is the creator of the target person record
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND deleted_at IS NULL
      )
      OR
      -- 3. Caller is designated Family Manager or Creator of an active family containing target person
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR f.created_by = auth.uid())
      )
      OR
      -- 4. Caller is active Head of an active family containing target person
      EXISTS (
        SELECT 1
        FROM public.family_members head_fm
        JOIN public.persons head_p ON head_p.id = head_fm.person_id
        JOIN public.family_members target_fm ON target_fm.family_id = head_fm.family_id
        WHERE head_p.user_id = auth.uid()
          AND head_fm.is_head = TRUE
          AND head_fm.left_at IS NULL
          AND target_fm.person_id = p_target_person_id
          AND target_fm.left_at IS NULL
      )
      OR
      -- 5. Caller's linked person shares an active family unit with p_target_person_id
      EXISTS (
        SELECT 1
        FROM public.persons my_p
        JOIN public.family_members my_fm ON my_fm.person_id = my_p.id AND my_fm.left_at IS NULL
        JOIN public.family_members target_fm ON target_fm.family_id = my_fm.family_id AND target_fm.left_at IS NULL
        JOIN public.families f ON f.id = my_fm.family_id AND f.deleted_at IS NULL
        WHERE my_p.user_id = auth.uid()
          AND my_p.deleted_at IS NULL
          AND target_fm.person_id = p_target_person_id
      )
    )
  );
$$;

COMMENT ON FUNCTION public.is_same_family_member(UUID) IS
  'Returns TRUE if auth.uid() shares an active family unit with target person, or manages/created their family.';

-- -----------------------------------------------------------------------------
-- 5. Field-Level Privacy via Security Barrier View (public.community_persons)
-- -----------------------------------------------------------------------------
-- Invariant:
-- - Other families see ONLY: first_name, middle_name, last_name, gender, avatar_url, calculated age.
-- - Other families NEVER see: full DOB, birth year, date of death, birth place, city, state,
--   contact info (phone, email), Gotra, Nukh, Kul, user_id, created_by.
-- - Same family & Admin see full authorized personal information.

DROP VIEW IF EXISTS public.community_persons CASCADE;

CREATE OR REPLACE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.maiden_name
    ELSE NULL
  END AS maiden_name,
  p.gender,

  -- Calculated age: visible to all authenticated community members
  public.calculate_person_age(p.date_of_birth) AS age,

  -- Date of birth & birth year: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.dob_year
    ELSE NULL
  END AS dob_year,

  -- Birth place: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.birth_place
    ELSE NULL
  END AS birth_place,

  -- Contact details: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.email_contact
    ELSE NULL
  END AS email_contact,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone
    ELSE NULL
  END AS phone,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone_secondary
    ELSE NULL
  END AS phone_secondary,

  -- City and State: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
      COALESCE(
        (
          SELECT f.city
          FROM public.family_members fm
          JOIN public.families f ON f.id = fm.family_id
          WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
          ORDER BY fm.is_head DESC, fm.created_at ASC
          LIMIT 1
        ),
        NULLIF(trim(split_part(p.birth_place, ',', 1)), '')
      )
    ELSE NULL
  END AS city,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
      COALESCE(
        (
          SELECT f.state
          FROM public.family_members fm
          JOIN public.families f ON f.id = fm.family_id
          WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
          ORDER BY fm.is_head DESC, fm.created_at ASC
          LIMIT 1
        ),
        NULLIF(trim(split_part(p.birth_place, ',', 2)), '')
      )
    ELSE NULL
  END AS state,

  -- Date of death: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_death
    ELSE NULL
  END AS date_of_death,

  p.avatar_url,

  -- Gotra, Nukh, Kul: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.gotra
    ELSE NULL
  END AS gotra,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.nukh
    ELSE NULL
  END AS nukh,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.kul
    ELSE NULL
  END AS kul,

  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at,

  -- User & Creator IDs: ONLY visible to Admin or same-family
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.user_id
    ELSE NULL
  END AS user_id,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.created_by
    ELSE NULL
  END AS created_by,

  p.profile_privacy,
  p.contact_privacy,
  p.dob_privacy,

  -- Privacy & Management Flags for frontend consumption
  (public.is_admin() OR public.is_same_family_member(p.id)) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit

FROM public.persons p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW public.community_persons IS
  'Security barrier view enforcing strict same-family vs other-family data masking. Other families receive ONLY names and calculated age.';

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: public.get_person_protected_details
-- -----------------------------------------------------------------------------
-- Re-assert protected details security gate: other-family access strictly rejected.

CREATE OR REPLACE FUNCTION public.get_person_protected_details(p_person_id UUID)
RETURNS TABLE (
  date_of_birth DATE,
  phone TEXT,
  phone_secondary TEXT,
  email_contact TEXT,
  is_owner BOOLEAN,
  is_moderator BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_person_user_id UUID;
  v_is_owner BOOLEAN;
  v_is_same_family BOOLEAN;
  v_is_manager BOOLEAN;
  v_is_moderator BOOLEAN;
  v_caller_uid UUID;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT user_id INTO v_person_user_id
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_owner := (v_person_user_id IS NOT NULL AND v_caller_uid = v_person_user_id);
  v_is_same_family := public.is_same_family_member(p_person_id);
  v_is_manager := public.can_edit_person(p_person_id);
  v_is_moderator := public.is_community_moderator() OR public.is_admin();

  IF NOT (v_is_owner OR v_is_same_family OR v_is_manager OR v_is_moderator) THEN
    RAISE EXCEPTION 'Access denied: not authorized to view protected details for other families' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.date_of_birth,
    p.phone,
    p.phone_secondary,
    p.email_contact,
    v_is_owner,
    v_is_moderator
  FROM public.persons p
  WHERE p.id = p_person_id AND p.deleted_at IS NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Privileges and Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_same_family_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_person_protected_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_family_with_head(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.privacy_level, public.privacy_level, UUID, TEXT, TEXT, TEXT, TEXT, public.gender_type, DATE, TEXT) TO authenticated;

COMMIT;
