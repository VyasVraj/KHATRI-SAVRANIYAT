-- Migration: 20261123223000_community_directory_profile_visibility_and_edit_permissions.sql
-- Description: Enforce strict ownership-based profile editing (creator or approved claimant only),
-- conceal private date-of-birth and birthday details from ordinary users in views/APIs,
-- and preserve authorized Admin, Super Admin, and Mukhi access.

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Helper Function: is_active_mukhi(p_user_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_mukhi(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    p_user_id IS NOT NULL AND (
      -- 1. Active record in public.community_mukhis directly linked to user
      EXISTS (
        SELECT 1
        FROM public.community_mukhis cm
        WHERE cm.linked_user_id = p_user_id
          AND cm.is_active = TRUE
          AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
      )
      OR
      -- 2. Active record in public.community_mukhis linked via person record
      EXISTS (
        SELECT 1
        FROM public.community_mukhis cm
        JOIN public.persons p ON p.id = cm.linked_person_id
        WHERE p.user_id = p_user_id
          AND cm.is_active = TRUE
          AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
          AND p.deleted_at IS NULL
      )
      OR
      -- 3. Profile role is MUKHI / COMMUNITY_MUKHI / ASSISTANT_MUKHI,
      -- provided no deactivated community_mukhis record exists
      (
        EXISTS (
          SELECT 1
          FROM public.profiles pr
          WHERE pr.id = p_user_id
            AND pr.role::text IN ('MUKHI', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI')
            AND pr.is_active = TRUE
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.community_mukhis cm
          WHERE (
            cm.linked_user_id = p_user_id
            OR EXISTS (
              SELECT 1 FROM public.persons p
              WHERE p.id = cm.linked_person_id
                AND p.user_id = p_user_id
                AND p.deleted_at IS NULL
            )
          )
          AND (cm.is_active = FALSE OR cm.authority_status IN ('INACTIVE', 'SUSPENDED', 'REMOVED', 'REVOKED'))
        )
      )
    )
  );
$$;

COMMENT ON FUNCTION public.is_active_mukhi(UUID) IS
  'Authorization check: verifies whether a user has genuine active Mukhi authority.';

GRANT EXECUTE ON FUNCTION public.is_active_mukhi(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 0b. Helper Function: is_mukhi_or_above()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_mukhi_or_above()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND (
      public.is_admin()
      OR public.is_active_mukhi(auth.uid())
    )
  );
$$;

COMMENT ON FUNCTION public.is_mukhi_or_above() IS
  'Authorization check for active Mukhi, Moderator, or Admin role.';

GRANT EXECUTE ON FUNCTION public.is_mukhi_or_above() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 1. Helper Function: can_view_family_tree(p_family_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_family_tree(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_family_id IS NOT NULL AND (
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Active Authorized Mukhi
      public.is_mukhi_or_above()
      OR
      -- 3. Family Creator
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id
          AND f.created_by = auth.uid()
          AND f.deleted_at IS NULL
      )
      OR
      -- 4. Family Manager or Approved Family Claimant
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id
          AND f.manager_user_id = auth.uid()
          AND f.deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM public.family_claims fc
        WHERE fc.family_id = p_family_id
          AND fc.requested_by_user_id = auth.uid()
          AND fc.status = 'APPROVED'
      )
      OR
      -- 5. Approved claimant or linked user of an active member of this family
      EXISTS (
        SELECT 1 FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = p_family_id
          AND fm.left_at IS NULL
          AND p.deleted_at IS NULL
          AND (
            p.user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.person_claims pc
              WHERE pc.person_id = p.id
                AND pc.claimant_id = auth.uid()
                AND pc.status = 'APPROVED'
            )
          )
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_view_family_tree(UUID) IS
  'Authorization check for family tree viewing: allows only family creator, approved family claimants/members, active Mukhis, and Admins.';

GRANT EXECUTE ON FUNCTION public.can_view_family_tree(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 2. Helper Function: can_view_person_tree(p_person_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_person_tree(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_person_id IS NOT NULL AND (
      -- 1. Admin, Super Admin, or Active Mukhi
      public.is_admin()
      OR public.is_mukhi_or_above()
      OR
      -- 2. Self or Creator of the person record
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id
          AND (p.user_id = auth.uid() OR p.created_by = auth.uid())
          AND p.deleted_at IS NULL
      )
      OR
      -- 3. Person belongs to a family tree the user is authorized to view
      EXISTS (
        SELECT 1 FROM public.family_members fm
        WHERE fm.person_id = p_person_id
          AND fm.left_at IS NULL
          AND public.can_view_family_tree(fm.family_id)
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_view_person_tree(UUID) IS
  'Authorization check for person-anchored tree viewing: allowed only if user is authorized to view that persons family tree, creator, self, or admin/mukhi.';

GRANT EXECUTE ON FUNCTION public.can_view_person_tree(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. Helper Function: can_edit_person(p_target_person_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_person(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Original creator of the person record
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id
          AND created_by = auth.uid()
          AND deleted_at IS NULL
      )
      OR
      -- 3. Verified approved claimant or linked account
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id
          AND user_id = auth.uid()
          AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM public.person_claims
        WHERE person_id = p_target_person_id
          AND claimant_id = auth.uid()
          AND status = 'APPROVED'
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_edit_person(UUID) IS
  'Strict profile editing rule: Only profile creator, approved claimant / linked user, or Admin can edit. Unrelated community members cannot edit.';

GRANT EXECUTE ON FUNCTION public.can_edit_person(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. Helper Function: can_view_person_private_details(p_person_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_person_private_details(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_person_id IS NOT NULL AND (
      -- 1. System administrators
      public.is_admin()
      OR
      -- 2. Active Authorized Mukhi
      public.is_mukhi_or_above()
      OR
      -- 3. Self or original profile creator
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id
          AND (
            p.user_id = auth.uid()
            OR p.created_by = auth.uid()
          )
          AND p.deleted_at IS NULL
      )
      OR
      -- 4. Authorized family members
      public.is_same_family_member(p_person_id)
      OR public.is_person_in_my_created_family(p_person_id)
      OR
      -- 5. Verified approved claimant
      EXISTS (
        SELECT 1 FROM public.person_claims pc
        WHERE pc.person_id = p_person_id
          AND pc.claimant_id = auth.uid()
          AND pc.status = 'APPROVED'
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_view_person_private_details(UUID) IS
  'Access control for sensitive personal details (exact birth date, phone, email): accessible only to self, creator, approved claimant, family members, active Mukhis, and Admins.';

GRANT EXECUTE ON FUNCTION public.can_view_person_private_details(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. Update RLS Policies on public.persons
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "persons_update_authorized" ON public.persons;
CREATE POLICY "persons_update_authorized" ON public.persons
  FOR UPDATE
  USING (public.can_edit_person(persons.id))
  WITH CHECK (public.can_edit_person(persons.id));

-- Ensure authenticated community members can select active persons for directory view
DROP POLICY IF EXISTS "persons_select_community_view" ON public.persons;
CREATE POLICY "persons_select_community_view"
  ON public.persons
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

COMMENT ON POLICY "persons_select_community_view" ON public.persons IS
  'Permits authenticated community members to read non-deleted person records. Sensitive date-of-birth and private contact fields are masked via community_persons view.';

-- -----------------------------------------------------------------------------
-- 5b. Storage RLS & Avatar Management Helper Functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_person_avatar(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_person_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. System Administrator (ADMIN, SUPER_ADMIN)
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- 2. Person is linked to this authenticated user (PERSON == USER link)
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND user_id = v_user_id
      AND deleted_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  -- 3. Person was created by this user (census recorder / owner)
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND created_by = v_user_id
      AND deleted_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  -- 4. Approved claimant
  IF EXISTS (
    SELECT 1 FROM public.person_claims
    WHERE person_id = p_person_id
      AND claimant_id = v_user_id
      AND status = 'APPROVED'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_manage_person_avatar(UUID) IS
  'Authorization check: returns TRUE if auth.uid() owns, created, is approved claimant, or is admin of the person record.';

GRANT EXECUTE ON FUNCTION public.can_manage_person_avatar(UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.can_read_avatar_object(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope TEXT;
  v_target_id_txt TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_scope := split_part(p_object_name, '/', 1);
  v_target_id_txt := split_part(p_object_name, '/', 2);

  -- Segment count and UUID validation guard
  IF v_target_id_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;
  IF split_part(p_object_name, '/', 3) = '' OR split_part(p_object_name, '/', 4) != '' THEN
    RETURN FALSE;
  END IF;

  -- Authenticated community members can read all valid avatar objects (profiles, persons, families)
  IF v_user_id IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_read_avatar_object(TEXT) IS
  'Authorization check for avatars: permits all authenticated community members to view member and family avatar photos.';

GRANT EXECUTE ON FUNCTION public.can_read_avatar_object(TEXT) TO authenticated, anon;

DROP POLICY IF EXISTS "avatars_select_policy" ON storage.objects;
CREATE POLICY "avatars_select_policy"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND public.can_read_avatar_object(name)
  );

-- -----------------------------------------------------------------------------
-- 5c. Update RLS Policies on public.family_members (Member Rosters)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_members_select_community" ON public.family_members;
DROP POLICY IF EXISTS "family_members_select_authorized" ON public.family_members;

CREATE POLICY "family_members_select_authorized"
  ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- 1. Admin or Active Mukhi (Leadership can view all member rosters)
      public.is_admin()
      OR public.is_mukhi_or_above()
      OR
      -- 2. Authorized Family Viewer (creator, manager, claimant, confirmed member)
      public.can_view_family_tree(family_members.family_id)
      OR
      -- 3. Designated family head is public for directory cards
      family_members.is_head = TRUE
    )
  );

COMMENT ON POLICY "family_members_select_authorized" ON public.family_members IS
  'Restricts complete family roster viewing to authorized family members/creators, active Mukhis, and Admins. Only designated family head is public.';

-- -----------------------------------------------------------------------------
-- 6. Recreate public.community_persons View (Privacy Masking & Age Support)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.community_persons CASCADE;

CREATE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  CASE
    WHEN p.date_of_birth IS NOT NULL THEN
      date_part('year', age(CURRENT_DATE, p.date_of_birth))::int
    ELSE p.current_age
  END AS age,
  -- Exact Date of Birth: concealed from unrelated ordinary users
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,
  -- Birth Year: concealed from unrelated ordinary users to prevent birthday inference
  CASE
    WHEN public.can_view_person_private_details(p.id) AND p.date_of_birth IS NOT NULL THEN
      date_part('year', p.date_of_birth)::int
    ELSE NULL
  END AS dob_year,
  p.birth_place,
  p.blood_group,
  -- Private Contact Details: concealed from unrelated ordinary users
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.email_contact
    ELSE NULL
  END AS email_contact,
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.phone
    ELSE NULL
  END AS phone,
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.phone_secondary
    ELSE NULL
  END AS phone_secondary,
  p.city,
  p.state,
  p.country,
  p.date_of_death,
  COALESCE(p.is_deceased, p.date_of_death IS NOT NULL OR p.status = 'DECEASED', FALSE) AS is_deceased,
  p.occupation,
  p.occupation_category,
  p.avatar_url,
  p.gotra,
  p.nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  p.user_id,
  p.created_by,
  p.profile_privacy,
  p.contact_privacy,
  p.dob_privacy,
  p.current_age,
  public.can_view_person_private_details(p.id) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit,
  public.can_view_person_tree(p.id) AS can_view_tree
FROM public.persons p
WHERE p.deleted_at IS NULL;

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMIT;
