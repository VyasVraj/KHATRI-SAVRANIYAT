-- Migration: 20261124150000_family_tree_visibility_and_scope_access_control.sql
-- Description: Restrict Family Tree visibility and access strictly to authorized users
-- (Family Creator, Approved Family Claimant, Approved Member Profile Claimant, Admin, Super Admin,
-- and Active Authorized Mukhi within assigned regional/family scope).
-- Unrelated normal users, pending/rejected claimants, and deactivated Mukhis are strictly denied access.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Function: can_view_family_tree(p_family_id UUID)
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
      -- 1. Admin or Super Admin (full platform access)
      public.is_admin()
      OR
      -- 2. Active Authorized Mukhi within assigned regional/family scope
      EXISTS (
        SELECT 1 FROM public.community_mukhis cm
        JOIN public.families f ON f.id = p_family_id
        WHERE (
          cm.linked_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.persons p
            WHERE p.id = cm.linked_person_id
              AND p.user_id = auth.uid()
              AND p.deleted_at IS NULL
          )
        )
          AND cm.is_active = TRUE
          AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
          AND (
            f.selected_mukhi_id = cm.id
            OR (
              f.city IS NOT NULL AND cm.gram IS NOT NULL AND (
                lower(trim(cm.gram)) = lower(trim(f.city))
                OR lower(trim(cm.gram)) LIKE '%' || lower(trim(f.city)) || '%'
                OR lower(trim(f.city)) LIKE '%' || lower(trim(cm.gram)) || '%'
              )
            )
          )
      )
      OR
      -- 3. Family Creator
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id
          AND f.created_by = auth.uid()
          AND f.deleted_at IS NULL
      )
      OR
      -- 4. Approved Family Claimant / Manager
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
  'Authorization check for family tree viewing: allows only family creator, approved family claimants/members, active scoped Mukhis, and Admins.';

GRANT EXECUTE ON FUNCTION public.can_view_family_tree(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 2. Function: can_view_person_tree(p_person_id UUID)
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
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Self or Creator of the person record
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id
          AND (p.user_id = auth.uid() OR p.created_by = auth.uid())
          AND p.deleted_at IS NULL
      )
      OR
      -- 3. Approved claimant of this person record
      EXISTS (
        SELECT 1 FROM public.person_claims pc
        WHERE pc.person_id = p_person_id
          AND pc.claimant_id = auth.uid()
          AND pc.status = 'APPROVED'
      )
      OR
      -- 4. Person belongs to a family tree the user is authorized to view
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
  'Authorization check for person-anchored tree viewing: allowed only if user is authorized to view that person family tree, creator, self, approved claimant, or admin.';

GRANT EXECUTE ON FUNCTION public.can_view_person_tree(UUID) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. Update RLS Policies on public.relationships (Family Tree Edges)
-- -----------------------------------------------------------------------------
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
      -- 2. Authorized for family tree of either person
      EXISTS (
        SELECT 1 FROM public.family_members fm
        WHERE (fm.person_id = relationships.person_a_id OR fm.person_id = relationships.person_b_id)
          AND fm.left_at IS NULL
          AND public.can_view_family_tree(fm.family_id)
      )
      OR
      -- 3. Creator or self of either person
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE (p.id = relationships.person_a_id OR p.id = relationships.person_b_id)
          AND (p.created_by = auth.uid() OR p.user_id = auth.uid())
          AND p.deleted_at IS NULL
      )
    )
  );

COMMENT ON POLICY "relationships_select_family_authorized" ON public.relationships IS
  'Restricts viewing relationship edges (tree connections) to authorized family members/claimants, creators, and Admins.';

-- -----------------------------------------------------------------------------
-- 4. Recreate public.community_persons View (Includes can_view_tree and family_id)
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
  -- Individual Birthplace: concealed from unrelated ordinary users
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.birth_place
    ELSE NULL
  END AS birth_place,
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
  -- Individual birth city/state/country: concealed from unrelated ordinary users
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.city
    ELSE NULL
  END AS city,
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.state
    ELSE NULL
  END AS state,
  CASE
    WHEN public.can_view_person_private_details(p.id) THEN p.country
    ELSE NULL
  END AS country,
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
  public.can_view_person_tree(p.id) AS can_view_tree,
  -- Authoritative active family association and registered family location
  (
    SELECT fm.family_id
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p.id
      AND fm.left_at IS NULL
      AND f.deleted_at IS NULL
    ORDER BY fm.is_head DESC, fm.created_at ASC
    LIMIT 1
  ) AS family_id,
  (
    SELECT f.family_name
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p.id
      AND fm.left_at IS NULL
      AND f.deleted_at IS NULL
    ORDER BY fm.is_head DESC, fm.created_at ASC
    LIMIT 1
  ) AS family_name,
  (
    SELECT f.city
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p.id
      AND fm.left_at IS NULL
      AND f.deleted_at IS NULL
    ORDER BY fm.is_head DESC, fm.created_at ASC
    LIMIT 1
  ) AS family_city,
  (
    SELECT f.state
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p.id
      AND fm.left_at IS NULL
      AND f.deleted_at IS NULL
    ORDER BY fm.is_head DESC, fm.created_at ASC
    LIMIT 1
  ) AS family_state,
  (
    SELECT f.country
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p.id
      AND fm.left_at IS NULL
      AND f.deleted_at IS NULL
    ORDER BY fm.is_head DESC, fm.created_at ASC
    LIMIT 1
  ) AS family_country
FROM public.persons p
WHERE p.deleted_at IS NULL;

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMIT;
