-- =============================================================================
-- Migration: 20261117040000_family_level_mukhi_assignment.sql
-- Description:
--   Centralized Family-Level Mukhi Assignment System:
--   "One family = One selected Mukhi = All members of that family."
--
--   1. Authoritative effective Mukhi resolution:
--      Person -> Family Membership (left_at IS NULL) -> Family (selected_mukhi_id) -> Community Mukhi (is_active = TRUE).
--   2. Inactive authority handling:
--      If the selected Mukhi is inactive or removed, members display an inactive / unassigned status;
--      no automatic geographic guessing.
--   3. Updates public.get_person_effective_mukhi, public.get_public_occupation_directory,
--      and public.get_admin_export_people to follow the unified family-level source of truth.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. GET_PERSON_EFFECTIVE_MUKHI RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_person_effective_mukhi(
  p_person_id UUID
)
RETURNS TABLE (
  person_id UUID,
  family_id UUID,
  family_name TEXT,
  mukhi_id UUID,
  full_name TEXT,
  gram TEXT,
  mobile_number TEXT,
  source_serial_number INT,
  mukhi_unique_id TEXT,
  is_active BOOLEAN,
  authority_status TEXT,
  assignment_status TEXT,
  display_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fm_record RECORD;
  v_cm_record RECORD;
BEGIN
  -- 1. Find person's active family membership
  SELECT
    fm.family_id,
    f.family_name,
    f.selected_mukhi_id
  INTO v_fm_record
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
  WHERE fm.person_id = p_person_id
    AND fm.left_at IS NULL
  ORDER BY fm.created_at DESC
  LIMIT 1;

  -- Case A: Person has no active family membership
  IF v_fm_record IS NULL THEN
    RETURN QUERY SELECT
      p_person_id,
      NULL::UUID,
      NULL::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::INT,
      NULL::TEXT,
      FALSE,
      NULL::TEXT,
      'NO_FAMILY'::TEXT,
      'Mukhi Not Assigned'::TEXT;
    RETURN;
  END IF;

  -- Case B: Family has no selected Mukhi
  IF v_fm_record.selected_mukhi_id IS NULL THEN
    RETURN QUERY SELECT
      p_person_id,
      v_fm_record.family_id,
      v_fm_record.family_name,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::INT,
      NULL::TEXT,
      FALSE,
      NULL::TEXT,
      'UNASSIGNED'::TEXT,
      'Mukhi Not Assigned'::TEXT;
    RETURN;
  END IF;

  -- Case C: Family has a selected Mukhi; verify authority
  SELECT
    cm.id,
    cm.full_name,
    cm.gram,
    cm.mobile_number,
    cm.source_serial_number,
    cm.mukhi_unique_id,
    cm.is_active,
    cm.authority_status
  INTO v_cm_record
  FROM public.community_mukhis cm
  WHERE cm.id = v_fm_record.selected_mukhi_id;

  -- If Mukhi record not found
  IF v_cm_record IS NULL THEN
    RETURN QUERY SELECT
      p_person_id,
      v_fm_record.family_id,
      v_fm_record.family_name,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::INT,
      NULL::TEXT,
      FALSE,
      NULL::TEXT,
      'UNASSIGNED'::TEXT,
      'Mukhi Not Assigned'::TEXT;
    RETURN;
  END IF;

  -- Case D: Mukhi is inactive or authority removed
  IF v_cm_record.is_active = FALSE OR (v_cm_record.authority_status IS NOT NULL AND v_cm_record.authority_status != 'ACTIVE') THEN
    RETURN QUERY SELECT
      p_person_id,
      v_fm_record.family_id,
      v_fm_record.family_name,
      NULL::UUID,
      v_cm_record.full_name,
      v_cm_record.gram,
      NULL::TEXT,
      v_cm_record.source_serial_number,
      v_cm_record.mukhi_unique_id,
      FALSE,
      COALESCE(v_cm_record.authority_status, 'INACTIVE'),
      'INACTIVE_AUTHORITY'::TEXT,
      'Mukhi Authority Inactive'::TEXT;
    RETURN;
  END IF;

  -- Case E: Mukhi is active and valid for entire family
  RETURN QUERY SELECT
    p_person_id,
    v_fm_record.family_id,
    v_fm_record.family_name,
    v_cm_record.id,
    v_cm_record.full_name,
    v_cm_record.gram,
    v_cm_record.mobile_number,
    v_cm_record.source_serial_number,
    v_cm_record.mukhi_unique_id,
    TRUE,
    'ACTIVE'::TEXT,
    'ASSIGNED'::TEXT,
    (v_cm_record.full_name || ' (' || COALESCE(v_cm_record.gram, '') || ')')::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_person_effective_mukhi FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_person_effective_mukhi TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. UPDATE PUBLIC.GET_PUBLIC_OCCUPATION_DIRECTORY RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_occupation_directory(
  p_search TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL,
  p_mukhi_id UUID DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  occupation TEXT,
  associated_mukhi_name TEXT,
  associated_mukhi_region TEXT,
  associated_mukhi_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH active_family_mukhis AS (
    SELECT DISTINCT ON (fm.person_id)
      fm.person_id,
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
    JOIN public.community_mukhis cm ON cm.id = f.selected_mukhi_id
    WHERE fm.left_at IS NULL
      AND cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
    ORDER BY fm.person_id, fm.created_at DESC
  ),
  directory_records AS (
    SELECT
      p.id AS d_person_id,
      TRIM(CONCAT_WS(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)) AS d_full_name,
      COALESCE(NULLIF(TRIM(p.occupation), ''), 'Occupation Not Available') AS d_occupation,
      afm.mukhi_name AS d_mukhi_name,
      afm.mukhi_gram AS d_mukhi_region,
      afm.mukhi_id AS d_mukhi_id
    FROM public.persons p
    LEFT JOIN active_family_mukhis afm ON afm.person_id = p.id
    WHERE p.deleted_at IS NULL
      AND (p.status IS NULL OR p.status != 'DECEASED')
      AND (p.is_deceased IS NULL OR p.is_deceased = FALSE)
      AND p.date_of_death IS NULL
  )
  SELECT
    dr.d_person_id AS person_id,
    dr.d_full_name AS full_name,
    dr.d_occupation AS occupation,
    dr.d_mukhi_name AS associated_mukhi_name,
    dr.d_mukhi_region AS associated_mukhi_region,
    dr.d_mukhi_id AS associated_mukhi_id
  FROM directory_records dr
  WHERE (
    p_search IS NULL OR TRIM(p_search) = '' OR
    dr.d_full_name ILIKE '%' || TRIM(p_search) || '%' OR
    dr.d_occupation ILIKE '%' || TRIM(p_search) || '%' OR
    (dr.d_mukhi_name IS NOT NULL AND dr.d_mukhi_name ILIKE '%' || TRIM(p_search) || '%')
  )
  AND (
    p_occupation IS NULL OR TRIM(p_occupation) = '' OR
    dr.d_occupation = TRIM(p_occupation)
  )
  AND (
    p_mukhi_id IS NULL OR dr.d_mukhi_id = p_mukhi_id
  )
  ORDER BY dr.d_full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_occupation_directory FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory TO anon, authenticated;

CREATE OR REPLACE VIEW public.public_occupation_directory AS
  SELECT * FROM public.get_public_occupation_directory();

GRANT SELECT ON public.public_occupation_directory TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. UPDATE PUBLIC.GET_ADMIN_EXPORT_PEOPLE RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_export_people(
  p_mukhi_id UUID DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_deceased_status TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  person_id TEXT,
  full_name TEXT,
  gender TEXT,
  date_of_birth TEXT,
  deceased_status TEXT,
  birthplace TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  blood_group TEXT,
  gotra TEXT,
  nukh TEXT,
  occupation TEXT,
  associated_mukhi TEXT,
  associated_mukhi_id UUID,
  primary_phone TEXT,
  email_address TEXT,
  profile_status TEXT,
  registration_date TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security check: Administrator access required
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only administrators can export community datasets.';
  END IF;

  RETURN QUERY
  WITH active_family_mukhis AS (
    SELECT DISTINCT ON (fm.person_id)
      fm.person_id,
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
    JOIN public.community_mukhis cm ON cm.id = f.selected_mukhi_id
    WHERE fm.left_at IS NULL
      AND cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
    ORDER BY fm.person_id, fm.created_at DESC
  ),
  resolved_people AS (
    SELECT
      p.id::TEXT AS r_person_id,
      TRIM(CONCAT_WS(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)) AS r_full_name,
      COALESCE(p.gender::TEXT, '—') AS r_gender,
      COALESCE(p.date_of_birth::TEXT, '—') AS r_date_of_birth,
      CASE
        WHEN p.date_of_death IS NOT NULL THEN 'Deceased (' || p.date_of_death::TEXT || ')'
        WHEN p.is_deceased = TRUE OR p.status = 'DECEASED' THEN 'Deceased'
        ELSE 'Living'
      END AS r_deceased_status,
      COALESCE(p.birth_place, '—') AS r_birthplace,
      COALESCE(p.city, '—') AS r_city,
      COALESCE(p.state, '—') AS r_state,
      COALESCE(p.country, 'India') AS r_country,
      COALESCE(p.blood_group, '—') AS r_blood_group,
      COALESCE(p.gotra, '—') AS r_gotra,
      COALESCE(p.nukh, '—') AS r_nukh,
      COALESCE(NULLIF(TRIM(p.occupation), ''), 'Occupation Pending') AS r_occupation,
      afm.mukhi_id AS r_mukhi_id,
      afm.mukhi_name AS r_mukhi_name,
      afm.mukhi_gram AS r_mukhi_gram,
      COALESCE(p.phone, '—') AS r_primary_phone,
      COALESCE(p.email_contact, '—') AS r_email_address,
      COALESCE(p.status::TEXT, 'ACTIVE') AS r_profile_status,
      COALESCE(TO_CHAR(p.created_at, 'YYYY-MM-DD'), '—') AS r_registration_date,
      p.created_at AS r_created_at,
      p.gotra AS raw_gotra,
      p.nukh AS raw_nukh,
      p.occupation AS raw_occupation,
      p.gender::TEXT AS raw_gender,
      p.date_of_death AS raw_date_of_death,
      p.is_deceased AS raw_is_deceased,
      p.status AS raw_status,
      p.birth_place AS raw_birth_place,
      p.city AS raw_city,
      p.state AS raw_state,
      p.country AS raw_country
    FROM public.persons p
    LEFT JOIN active_family_mukhis afm ON afm.person_id = p.id
    WHERE p.deleted_at IS NULL
  )
  SELECT
    rp.r_person_id AS person_id,
    rp.r_full_name AS full_name,
    rp.r_gender AS gender,
    rp.r_date_of_birth AS date_of_birth,
    rp.r_deceased_status AS deceased_status,
    rp.r_birthplace AS birthplace,
    rp.r_city AS city,
    rp.r_state AS state,
    rp.r_country AS country,
    rp.r_blood_group AS blood_group,
    rp.r_gotra AS gotra,
    rp.r_nukh AS nukh,
    rp.r_occupation AS occupation,
    CASE
      WHEN rp.r_mukhi_name IS NOT NULL AND rp.r_mukhi_gram IS NOT NULL
        THEN rp.r_mukhi_name || ' (' || rp.r_mukhi_gram || ')'
      WHEN rp.r_mukhi_name IS NOT NULL
        THEN rp.r_mukhi_name
      ELSE 'Mukhi Not Assigned'
    END AS associated_mukhi,
    rp.r_mukhi_id AS associated_mukhi_id,
    rp.r_primary_phone AS primary_phone,
    rp.r_email_address AS email_address,
    rp.r_profile_status AS profile_status,
    rp.r_registration_date AS registration_date
  FROM resolved_people rp
  WHERE (
    p_mukhi_id IS NULL OR rp.r_mukhi_id = p_mukhi_id
  )
  AND (
    p_country IS NULL OR TRIM(p_country) = '' OR
    rp.raw_country ILIKE '%' || TRIM(p_country) || '%' OR
    rp.raw_birth_place ILIKE '%' || TRIM(p_country) || '%'
  )
  AND (
    p_state IS NULL OR TRIM(p_state) = '' OR
    rp.raw_state ILIKE '%' || TRIM(p_state) || '%' OR
    rp.raw_birth_place ILIKE '%' || TRIM(p_state) || '%'
  )
  AND (
    p_city IS NULL OR TRIM(p_city) = '' OR
    rp.raw_city ILIKE '%' || TRIM(p_city) || '%' OR
    rp.raw_birth_place ILIKE '%' || TRIM(p_city) || '%'
  )
  AND (
    p_gotra IS NULL OR TRIM(p_gotra) = '' OR
    rp.raw_gotra = TRIM(p_gotra)
  )
  AND (
    p_nukh IS NULL OR TRIM(p_nukh) = '' OR
    rp.raw_nukh = TRIM(p_nukh)
  )
  AND (
    p_occupation IS NULL OR TRIM(p_occupation) = '' OR
    rp.raw_occupation = TRIM(p_occupation)
  )
  AND (
    p_gender IS NULL OR p_gender = 'ALL' OR TRIM(p_gender) = '' OR
    rp.raw_gender = TRIM(p_gender)
  )
  AND (
    p_deceased_status IS NULL OR p_deceased_status = 'ALL' OR
    (p_deceased_status = 'LIVING' AND rp.raw_date_of_death IS NULL AND (rp.raw_is_deceased IS NULL OR rp.raw_is_deceased = FALSE)) OR
    (p_deceased_status = 'DECEASED' AND (rp.raw_date_of_death IS NOT NULL OR rp.raw_is_deceased = TRUE OR rp.raw_status = 'DECEASED'))
  )
  AND (
    p_start_date IS NULL OR rp.r_created_at >= p_start_date
  )
  AND (
    p_end_date IS NULL OR rp.r_created_at <= p_end_date
  )
  ORDER BY rp.r_full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_export_people FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_export_people TO authenticated;

COMMIT;
