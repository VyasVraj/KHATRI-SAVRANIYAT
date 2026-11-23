-- Migration: 20261123213000_family_tree_access_control_and_privacy.sql
-- Description: Implement strict role-based Family Tree access control, member privacy, and profile editing permissions.

BEGIN;

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
          AND (f.manager_user_id = auth.uid() OR f.claimed_by_user_id = auth.uid())
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
      -- 2. Successfully verified claimant (linked user_id = auth.uid() or APPROVED person_claim)
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
      OR
      -- 3. Original creator of the person record
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id
          AND created_by = auth.uid()
          AND deleted_at IS NULL
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_edit_person(UUID) IS
  'Strict profile editing rule: Only profile creator, approved claimant, or Admin can edit. Ordinary community members cannot edit.';

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
      public.is_admin()
      OR public.is_mukhi_or_above()
      OR EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id
          AND (
            p.user_id = auth.uid()
            OR p.created_by = auth.uid()
          )
          AND p.deleted_at IS NULL
      )
      OR public.is_same_family_member(p_person_id)
      OR public.is_person_in_my_created_family(p_person_id)
      OR EXISTS (
        SELECT 1 FROM public.person_claims pc
        WHERE pc.person_id = p_person_id
          AND pc.claimant_id = auth.uid()
          AND pc.status = 'APPROVED'
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_view_person_private_details(UUID) IS
  'Access control for sensitive personal details (exact birth date, phone, email): accessible only to self, creator, family members, active Mukhis, and Admins.';

GRANT EXECUTE ON FUNCTION public.can_view_person_private_details(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. Update RLS Policies on public.persons
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "persons_update_authorized" ON public.persons;
CREATE POLICY "persons_update_authorized" ON public.persons
  FOR UPDATE
  USING (public.can_edit_person(persons.id))
  WITH CHECK (public.can_edit_person(persons.id));

-- -----------------------------------------------------------------------------
-- 6. Update RLS Policies on public.relationships (Family Tree Edges)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "relationships_select_dual_endpoint" ON public.relationships;
DROP POLICY IF EXISTS "relationships_select_family_authorized" ON public.relationships;

CREATE POLICY "relationships_select_family_authorized"
  ON public.relationships
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Active Authorized Mukhi
      public.is_mukhi_or_above()
      OR
      -- 3. Authorized for family tree of either person
      EXISTS (
        SELECT 1 FROM public.family_members fm
        WHERE (fm.person_id = relationships.person_a_id OR fm.person_id = relationships.person_b_id)
          AND fm.left_at IS NULL
          AND public.can_view_family_tree(fm.family_id)
      )
      OR
      -- 4. Creator or self of either person
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE (p.id = relationships.person_a_id OR p.id = relationships.person_b_id)
          AND (p.created_by = auth.uid() OR p.user_id = auth.uid())
          AND p.deleted_at IS NULL
      )
    )
  );

COMMENT ON POLICY "relationships_select_family_authorized" ON public.relationships IS
  'Restricts viewing relationship edges (tree connections) to authorized family members, creators, active Mukhis, and Admins.';

-- -----------------------------------------------------------------------------
-- 7. Update RLS Policies on public.family_members (Member Rosters)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_members_select_community" ON public.family_members;
DROP POLICY IF EXISTS "family_members_select_authorized" ON public.family_members;

CREATE POLICY "family_members_select_authorized"
  ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Admin or Active Mukhi
      public.is_admin()
      OR public.is_mukhi_or_above()
      OR
      -- Authorized Family Viewer
      public.can_view_family_tree(family_members.family_id)
      OR
      -- Family Head is public for directory cards
      family_members.is_head = TRUE
    )
  );

COMMENT ON POLICY "family_members_select_authorized" ON public.family_members IS
  'Restricts complete family roster viewing to authorized family members/creators, Mukhis, and Admins. Only designated family head is public.';

-- -----------------------------------------------------------------------------
-- 8. Recreate public.community_persons View (Privacy Masking)
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
    ELSE NULL
  END AS age,
  -- Exact Date of Birth: concealed from unrelated ordinary users
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,
  CASE
    WHEN p.date_of_birth IS NOT NULL THEN
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
  public.can_view_person_private_details(p.id) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit,
  public.can_view_person_tree(p.id) AS can_view_tree
FROM public.persons p
WHERE p.deleted_at IS NULL;

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 9. Recreate public.community_birthdays View (Conceal Unrelated Birthdays)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.community_birthdays CASCADE;

CREATE OR REPLACE VIEW public.community_birthdays
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.avatar_url,
  EXTRACT(DAY FROM p.date_of_birth)::INTEGER AS birth_day,
  EXTRACT(MONTH FROM p.date_of_birth)::INTEGER AS birth_month,
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,
  p.dob_privacy,
  p.profile_privacy,
  p.status,
  p.date_of_death,
  p.user_id,
  p.created_by,
  p.deleted_at
FROM public.persons p
WHERE p.deleted_at IS NULL
  AND p.status != 'DECEASED'
  AND p.date_of_death IS NULL
  AND p.date_of_birth IS NOT NULL
  AND (
    -- Only Admins, Active Mukhis, or Authorized Family Members can view birthdays
    public.is_admin()
    OR public.is_mukhi_or_above()
    OR public.can_view_person_private_details(p.id)
  );

COMMENT ON VIEW public.community_birthdays IS
  'Security barrier view for birthdays: limits birthday listings strictly to authorized family members, active Mukhis, and Admins.';

GRANT SELECT ON public.community_birthdays TO authenticated, anon;

COMMIT;
