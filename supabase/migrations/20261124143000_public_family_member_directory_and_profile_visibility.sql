-- Migration: 20261124143000_public_family_member_directory_and_profile_visibility.sql
-- Description: Allow all authenticated community users to view family rosters in read-only mode,
-- conceal individual birthplace (city, state, country) from normal users, and expose family association
-- and family location (family name, city, state, country) in the community_persons view.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Update RLS Policies on public.family_members
-- -----------------------------------------------------------------------------
-- Allow all authenticated community users to view the membership roster of non-deleted families.
DROP POLICY IF EXISTS "family_members_select_community" ON public.family_members;
DROP POLICY IF EXISTS "family_members_select_authorized" ON public.family_members;

CREATE POLICY "family_members_select_community"
  ON public.family_members
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.deleted_at IS NULL
    )
  );

COMMENT ON POLICY "family_members_select_community" ON public.family_members IS
  'Permits all authenticated community members to view the family member roster for registered families in read-only mode.';

-- -----------------------------------------------------------------------------
-- 2. Recreate public.community_persons View (Conceal Birthplace & Expose Family Location)
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
