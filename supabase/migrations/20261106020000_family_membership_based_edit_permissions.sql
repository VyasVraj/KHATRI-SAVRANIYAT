-- =============================================================================
-- Migration: 20261106020000_family_membership_based_edit_permissions.sql
-- Description: Implement family membership-based edit permissions and RLS.
--
-- RULES:
-- 1. Family Members can manage and edit their own family and member profiles:
--    - An active registered family member (persons.user_id = auth.uid()) of
--      Family A can edit Family A details and edit any member of Family A.
--    - Designated Family Manager or Family Creator can also manage Family A.
--    - System Administrators (ADMIN, SUPER_ADMIN) have global management.
-- 2. Unauthorized users CANNOT edit unrelated families or persons:
--    - Mukhis (COMMUNITY_MODERATOR) and unrelated members do NOT have edit
--      access to families they do not belong to.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. can_manage_family(p_family_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_family(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_family_id IS NOT NULL AND (
      -- 1. System Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Designated Family Manager or Creator (when manager unset or matching)
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id
          AND f.deleted_at IS NULL
          AND (
            f.manager_user_id = auth.uid()
            OR (f.manager_user_id IS NULL AND f.created_by = auth.uid())
          )
      )
      OR
      -- 3. Any active registered member belonging to this family
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = p_family_id
          AND fm.left_at IS NULL
          AND p.user_id = auth.uid()
          AND p.deleted_at IS NULL
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_manage_family(UUID) IS
  'Returns true if caller is admin, manager/creator, or an active registered member of the family.';

-- -----------------------------------------------------------------------------
-- 2. can_edit_person(p_target_person_id UUID)
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
      -- 1. System Admin or Super Admin
      public.is_admin()
      OR
      -- 2. The person themselves
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      -- 3. Unlinked person created by caller
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND user_id IS NULL AND deleted_at IS NULL
      )
      OR
      -- 4. Family Manager or Creator of any family containing the target person
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
      )
      OR
      -- 5. Any active registered member sharing a family with target person
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

COMMENT ON FUNCTION public.can_edit_person(UUID) IS
  'Returns true if caller is admin, self, unlinked creator, family manager, or active family member.';

-- -----------------------------------------------------------------------------
-- 3. Recreate public.community_persons security barrier view
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
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.maiden_name
    ELSE NULL
  END AS maiden_name,
  p.gender,
  public.calculate_person_age(p.date_of_birth) AS age,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,
  EXTRACT(YEAR FROM p.date_of_birth)::integer AS dob_year,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.birth_place
    ELSE NULL
  END AS birth_place,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.blood_group
    ELSE NULL
  END AS blood_group,
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
  ) AS city,
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
  ) AS state,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_death
    ELSE NULL
  END AS date_of_death,
  p.avatar_url,
  COALESCE(
    p.gotra,
    (
      SELECT f.gotra
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    )
  ) AS gotra,
  COALESCE(
    p.nukh,
    (
      SELECT f.nukh
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    )
  ) AS nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at,
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
  (public.is_admin() OR public.is_same_family_member(p.id)) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit
FROM public.persons p
WHERE p.deleted_at IS NULL;

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

-- Recreate get_my_linked_person() dropped by CASCADE
CREATE OR REPLACE FUNCTION public.get_my_linked_person()
RETURNS SETOF public.community_persons
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cp.*
  FROM public.community_persons cp
  JOIN public.persons p ON p.id = cp.id
  WHERE p.user_id = auth.uid()
    AND p.deleted_at IS NULL
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_linked_person() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. Update RLS policies on public.families
-- -----------------------------------------------------------------------------
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_update_creator" ON public.families;
DROP POLICY IF EXISTS "families_update_admin" ON public.families;
DROP POLICY IF EXISTS "families_update_authorized" ON public.families;
CREATE POLICY "families_update_authorized" ON public.families
  FOR UPDATE
  USING (public.can_manage_family(families.id))
  WITH CHECK (public.can_manage_family(families.id));

-- -----------------------------------------------------------------------------
-- 5. Update RLS policies on public.persons
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "persons_update_own" ON public.persons;
DROP POLICY IF EXISTS "persons_update_admin" ON public.persons;
DROP POLICY IF EXISTS "persons_update_authorized" ON public.persons;
CREATE POLICY "persons_update_authorized" ON public.persons
  FOR UPDATE
  USING (public.can_edit_person(persons.id))
  WITH CHECK (public.can_edit_person(persons.id));

-- -----------------------------------------------------------------------------
-- 6. Update RLS policies on public.family_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_insert_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_insert_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_insert_authorized" ON public.family_members;
CREATE POLICY "family_members_insert_authorized" ON public.family_members
  FOR INSERT
  WITH CHECK (public.can_manage_family(family_members.family_id));

DROP POLICY IF EXISTS "family_members_update_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_update_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_update_authorized" ON public.family_members;
CREATE POLICY "family_members_update_authorized" ON public.family_members
  FOR UPDATE
  USING (public.can_manage_family(family_members.family_id))
  WITH CHECK (public.can_manage_family(family_members.family_id));

DROP POLICY IF EXISTS "family_members_delete_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_delete_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_delete_authorized" ON public.family_members;
CREATE POLICY "family_members_delete_authorized" ON public.family_members
  FOR DELETE
  USING (public.can_manage_family(family_members.family_id));

-- -----------------------------------------------------------------------------
-- 7. Privileges
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.can_manage_family(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_person(UUID) TO authenticated, anon;

COMMIT;
