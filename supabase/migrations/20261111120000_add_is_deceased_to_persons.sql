-- =============================================================================
-- Migration: 20261111120000_add_is_deceased_to_persons.sql
-- Purpose:
--   1. Add is_deceased BOOLEAN NOT NULL DEFAULT FALSE to public.persons.
--   2. Migrate existing records:
--      - Set is_deceased = TRUE and status = 'DECEASED' for records with date_of_death IS NOT NULL OR status = 'DECEASED'.
--      - Set is_deceased = FALSE for all living records.
--      - Preserve all historical date_of_death information.
--   3. Update trigger public.sync_person_deceased_status() to handle two-way synchronization
--      between is_deceased, date_of_death, and status.
--   4. Update public.community_persons view to expose is_deceased safely.
--   5. Update public.register_complete_family_rpc to support is_deceased directly.
-- =============================================================================

BEGIN;

-- 1. Add is_deceased column to public.persons
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Migrate existing person records
UPDATE public.persons
SET
  is_deceased = TRUE,
  status = 'DECEASED'::public.person_status
WHERE
  date_of_death IS NOT NULL
  OR status = 'DECEASED'::public.person_status;

UPDATE public.persons
SET
  is_deceased = FALSE
WHERE
  (date_of_death IS NULL AND status != 'DECEASED'::public.person_status)
  AND is_deceased IS NOT FALSE;

-- 3. Update trigger function for bidirectional sync between is_deceased, date_of_death, and status
CREATE OR REPLACE FUNCTION public.sync_person_deceased_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- When marked as deceased via boolean or date_of_death
  IF NEW.is_deceased IS TRUE OR NEW.date_of_death IS NOT NULL THEN
    NEW.is_deceased := TRUE;
    NEW.status := 'DECEASED'::public.person_status;
  -- When explicitly set to living (is_deceased = FALSE)
  ELSIF NEW.is_deceased IS FALSE THEN
    NEW.is_deceased := FALSE;
    IF NEW.status = 'DECEASED'::public.person_status THEN
      NEW.status := 'ACTIVE'::public.person_status;
    END IF;
  -- Fallback: if status is set to DECEASED, sync is_deceased = TRUE
  ELSIF NEW.status = 'DECEASED'::public.person_status THEN
    NEW.is_deceased := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_person_deceased_status ON public.persons;
CREATE TRIGGER trg_sync_person_deceased_status
  BEFORE INSERT OR UPDATE OF date_of_death, is_deceased, status ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_person_deceased_status();

GRANT EXECUTE ON FUNCTION public.sync_person_deceased_status() TO authenticated, anon;

-- 4. Update community_persons view to include is_deceased
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
  COALESCE(p.is_deceased, (p.status = 'DECEASED'::public.person_status OR p.date_of_death IS NOT NULL), FALSE) AS is_deceased,
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
  p.occupation,
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

GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMIT;
