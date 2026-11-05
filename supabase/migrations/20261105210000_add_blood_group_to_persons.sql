-- =============================================================================
-- Migration: 20261105210000_add_blood_group_to_persons.sql
-- Description: Add Blood Group dropdown field to person registration & profile
--              with strict family-based privacy protection.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add blood_group column to public.persons with constraint
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS blood_group TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_blood_group'
  ) THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_blood_group
      CHECK (blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'));
  END IF;
END $$;

COMMENT ON COLUMN public.persons.blood_group IS
  'Standard blood group: A+, A-, B+, B-, AB+, AB-, O+, O-, or UNKNOWN. NULL if not provided.';

-- -----------------------------------------------------------------------------
-- 2. Update public.community_persons security barrier view
-- -----------------------------------------------------------------------------
-- Ensure blood_group is ONLY visible to Admin / Super Admin or same-family members.
-- Other families see NULL.
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

  -- Blood group: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.blood_group
    ELSE NULL
  END AS blood_group,

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

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Update public.create_family_with_head RPC
-- -----------------------------------------------------------------------------
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
  p_new_person_gender public.gender DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL,
  p_selected_mukhi_id UUID DEFAULT NULL,
  p_new_person_blood_group TEXT DEFAULT NULL
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
      blood_group,
      created_by
    )
    VALUES (
      trim(p_new_person_first_name),
      p_new_person_middle_name,
      trim(p_new_person_last_name),
      p_new_person_maiden_name,
      COALESCE(p_new_person_gender, 'MALE'::public.gender),
      p_new_person_dob,
      p_new_person_birth_place,
      p_gotra,
      p_nukh,
      p_new_person_blood_group,
      v_caller_id
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 2. Create the family record with selected_mukhi_id
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
    manager_user_id,
    selected_mukhi_id
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
    v_caller_id,
    p_selected_mukhi_id
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

GRANT EXECUTE ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.privacy_level, public.privacy_level, UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT, UUID, TEXT
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Update public.get_person_protected_details RPC
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_person_protected_details(UUID);

CREATE OR REPLACE FUNCTION public.get_person_protected_details(p_person_id UUID)
RETURNS TABLE (
  date_of_birth DATE,
  phone TEXT,
  phone_secondary TEXT,
  email_contact TEXT,
  blood_group TEXT,
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
    p.blood_group,
    v_is_owner,
    v_is_moderator
  FROM public.persons p
  WHERE p.id = p_person_id AND p.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_person_protected_details(UUID) TO authenticated;
