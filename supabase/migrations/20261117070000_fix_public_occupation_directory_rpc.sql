-- =============================================================================
-- Migration: 20261117070000_fix_public_occupation_directory_rpc.sql
-- Description:
--   1. Ensures is_deceased column exists safely on public.persons.
--   2. Hardens public.get_public_occupation_directory() RPC so it never fails on
--      missing column schemas and executes safely under SECURITY DEFINER for anon & authenticated.
--   3. Synchronizes public.public_occupation_directory view with EXECUTE and SELECT grants.
-- =============================================================================

BEGIN;

-- 1. Ensure is_deceased column exists on public.persons
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Ensure date_of_death syncs is_deceased safely
UPDATE public.persons
SET is_deceased = TRUE
WHERE (date_of_death IS NOT NULL OR status = 'DECEASED') AND is_deceased IS NOT TRUE;

-- 3. Robust, production-hardened get_public_occupation_directory RPC
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
SET search_path = public, pg_temp
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
    dr.d_occupation ILIKE '%' || TRIM(p_occupation) || '%'
  )
  AND (
    p_mukhi_id IS NULL OR
    dr.d_mukhi_id = p_mukhi_id
  )
  ORDER BY dr.d_full_name ASC;
END;
$$;

-- 4. Permissions
REVOKE ALL ON FUNCTION public.get_public_occupation_directory FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory TO anon, authenticated;

-- 5. Recreate View
CREATE OR REPLACE VIEW public.public_occupation_directory AS
  SELECT * FROM public.get_public_occupation_directory();

GRANT SELECT ON public.public_occupation_directory TO anon, authenticated;

COMMIT;
