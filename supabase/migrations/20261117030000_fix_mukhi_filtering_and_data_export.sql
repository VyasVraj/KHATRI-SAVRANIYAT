-- =============================================================================
-- Migration: 20261117030000_fix_mukhi_filtering_and_data_export.sql
-- Description:
--   Fix Mukhi-Wise Filtering and Dataset Preview in Data Export & Reports:
--   1. Authoritative Person-to-Mukhi Association:
--      - Family Selected Mukhi: Direct link via public.family_members -> public.families.selected_mukhi_id.
--      - Linked Mukhi: Person is themselves an official Mukhi (public.community_mukhis.linked_person_id).
--      - Regional Authority: Location matching against active Mukhi's gram.
--      - Unassigned Fallback: "Mukhi Not Assigned".
--   2. Mukhi Filtering:
--      - When Mukhi selected: Filter strictly by Mukhi's stable database UUID. Exclude people assigned to other Mukhis or unassigned.
--      - When no Mukhi selected: Include ALL database records matching other filters, showing each person's own correct Associated Mukhi.
--   3. Dedicated Associated Mukhi column in Dataset Preview, Excel, and PDF.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. GET_ADMIN_EXPORT_PEOPLE RPC
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
    JOIN public.families f ON f.id = fm.family_id
    JOIN public.community_mukhis cm ON cm.id = f.selected_mukhi_id
    WHERE fm.left_at IS NULL
      AND cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
    ORDER BY fm.person_id, fm.created_at DESC
  ),
  active_linked_mukhis AS (
    SELECT
      cm.linked_person_id AS person_id,
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.community_mukhis cm
    WHERE cm.linked_person_id IS NOT NULL
      AND cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
  ),
  active_mukhis_geo AS (
    SELECT
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.community_mukhis cm
    WHERE cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
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
      COALESCE(afm.mukhi_id, alm.mukhi_id, (
        SELECT geo.mukhi_id FROM active_mukhis_geo geo
        WHERE (p.city IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || p.city || '%' OR p.city ILIKE '%' || geo.mukhi_gram || '%'))
           OR (p.birth_place IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || p.birth_place || '%' OR p.birth_place ILIKE '%' || geo.mukhi_gram || '%'))
        LIMIT 1
      )) AS r_mukhi_id,
      COALESCE(afm.mukhi_name, alm.mukhi_name, (
        SELECT geo.mukhi_name FROM active_mukhis_geo geo
        WHERE (p.city IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || p.city || '%' OR p.city ILIKE '%' || geo.mukhi_gram || '%'))
           OR (p.birth_place IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || p.birth_place || '%' OR p.birth_place ILIKE '%' || geo.mukhi_gram || '%'))
        LIMIT 1
      )) AS r_mukhi_name,
      COALESCE(afm.mukhi_gram, alm.mukhi_gram, (
        SELECT geo.mukhi_gram FROM active_mukhis_geo geo
        WHERE (p.city IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || p.city || '%' OR p.city ILIKE '%' || geo.mukhi_gram || '%'))
           OR (p.birth_place IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || p.birth_place || '%' OR p.birth_place ILIKE '%' || geo.mukhi_gram || '%'))
        LIMIT 1
      )) AS r_mukhi_gram,
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
    LEFT JOIN active_linked_mukhis alm ON alm.person_id = p.id
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
    -- Mukhi filter: strict database ID match when selected; all records when null
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


-- -----------------------------------------------------------------------------
-- 2. GET_ADMIN_EXPORT_FAMILIES RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_export_families(
  p_mukhi_id UUID DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  family_id TEXT,
  family_name TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  gotra TEXT,
  nukh TEXT,
  associated_mukhi TEXT,
  associated_mukhi_id UUID,
  verification_status TEXT,
  status TEXT,
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
  WITH active_mukhis_geo AS (
    SELECT
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.community_mukhis cm
    WHERE cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
  ),
  resolved_families AS (
    SELECT
      f.id::TEXT AS r_family_id,
      f.family_name AS r_family_name,
      COALESCE(f.city, '—') AS r_city,
      COALESCE(f.state, '—') AS r_state,
      COALESCE(f.country, 'India') AS r_country,
      COALESCE(f.gotra, '—') AS r_gotra,
      COALESCE(f.nukh, '—') AS r_nukh,
      COALESCE(f.selected_mukhi_id, (
        SELECT geo.mukhi_id FROM active_mukhis_geo geo
        WHERE f.city IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || f.city || '%' OR f.city ILIKE '%' || geo.mukhi_gram || '%')
        LIMIT 1
      )) AS r_mukhi_id,
      COALESCE(cm.full_name, (
        SELECT geo.mukhi_name FROM active_mukhis_geo geo
        WHERE f.city IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || f.city || '%' OR f.city ILIKE '%' || geo.mukhi_gram || '%')
        LIMIT 1
      )) AS r_mukhi_name,
      COALESCE(cm.gram, (
        SELECT geo.mukhi_gram FROM active_mukhis_geo geo
        WHERE f.city IS NOT NULL AND (geo.mukhi_gram ILIKE '%' || f.city || '%' OR f.city ILIKE '%' || geo.mukhi_gram || '%')
        LIMIT 1
      )) AS r_mukhi_gram,
      COALESCE(f.verification_status::TEXT, 'PENDING') AS r_verification_status,
      COALESCE(f.status::TEXT, 'ACTIVE') AS r_status,
      COALESCE(TO_CHAR(f.created_at, 'YYYY-MM-DD'), '—') AS r_registration_date,
      f.created_at AS r_created_at,
      f.gotra AS raw_gotra,
      f.nukh AS raw_nukh,
      f.city AS raw_city,
      f.state AS raw_state,
      f.country AS raw_country
    FROM public.families f
    LEFT JOIN public.community_mukhis cm ON cm.id = f.selected_mukhi_id AND cm.is_active = TRUE
    WHERE f.deleted_at IS NULL
  )
  SELECT
    rf.r_family_id AS family_id,
    rf.r_family_name AS family_name,
    rf.r_city AS city,
    rf.r_state AS state,
    rf.r_country AS country,
    rf.r_gotra AS gotra,
    rf.r_nukh AS nukh,
    CASE
      WHEN rf.r_mukhi_name IS NOT NULL AND rf.r_mukhi_gram IS NOT NULL
        THEN rf.r_mukhi_name || ' (' || rf.r_mukhi_gram || ')'
      WHEN rf.r_mukhi_name IS NOT NULL
        THEN rf.r_mukhi_name
      ELSE 'Mukhi Not Assigned'
    END AS associated_mukhi,
    rf.r_mukhi_id AS associated_mukhi_id,
    rf.r_verification_status AS verification_status,
    rf.r_status AS status,
    rf.r_registration_date AS registration_date
  FROM resolved_families rf
  WHERE (
    p_mukhi_id IS NULL OR rf.r_mukhi_id = p_mukhi_id
  )
  AND (
    p_country IS NULL OR TRIM(p_country) = '' OR
    rf.raw_country ILIKE '%' || TRIM(p_country) || '%'
  )
  AND (
    p_state IS NULL OR TRIM(p_state) = '' OR
    rf.raw_state ILIKE '%' || TRIM(p_state) || '%'
  )
  AND (
    p_city IS NULL OR TRIM(p_city) = '' OR
    rf.raw_city ILIKE '%' || TRIM(p_city) || '%'
  )
  AND (
    p_gotra IS NULL OR TRIM(p_gotra) = '' OR
    rf.raw_gotra = TRIM(p_gotra)
  )
  AND (
    p_nukh IS NULL OR TRIM(p_nukh) = '' OR
    rf.raw_nukh = TRIM(p_nukh)
  )
  AND (
    p_start_date IS NULL OR rf.r_created_at >= p_start_date
  )
  AND (
    p_end_date IS NULL OR rf.r_created_at <= p_end_date
  )
  ORDER BY rf.r_family_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_export_families FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_export_families TO authenticated;

COMMIT;
