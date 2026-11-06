-- =============================================================================
-- Migration: 20261106070000_mukhi_gotra_nukh_and_serial_seq.sql
-- Description: Add Gotra and Nukh fields to community_mukhis and enable
--              auto-incrementing source_serial_number for newly added Mukhis.
-- =============================================================================

BEGIN;

-- 1. Add Gotra and Nukh columns to community_mukhis
ALTER TABLE public.community_mukhis
  ADD COLUMN IF NOT EXISTS gotra TEXT,
  ADD COLUMN IF NOT EXISTS nukh TEXT;

CREATE INDEX IF NOT EXISTS idx_community_mukhis_gotra ON public.community_mukhis(gotra);
CREATE INDEX IF NOT EXISTS idx_community_mukhis_nukh ON public.community_mukhis(nukh);

-- 2. Sequence for source_serial_number for new Mukhis (defaults starting after official 118 records)
DO $$
DECLARE
  v_max_serial INTEGER;
BEGIN
  SELECT COALESCE(MAX(source_serial_number), 118) INTO v_max_serial FROM public.community_mukhis;
  CREATE SEQUENCE IF NOT EXISTS public.community_mukhis_serial_seq START WITH 119;
  PERFORM setval('public.community_mukhis_serial_seq', GREATEST(v_max_serial, 118));
  ALTER TABLE public.community_mukhis
    ALTER COLUMN source_serial_number
    SET DEFAULT nextval('public.community_mukhis_serial_seq');
END $$;

-- 3. Update public directory view to include gotra and nukh
CREATE OR REPLACE VIEW public.community_mukhis_directory AS
SELECT
  id,
  source_serial_number,
  full_name,
  gram,
  mobile_number,
  gotra,
  nukh,
  mukhi_unique_id,
  official_email,
  authority_status,
  account_linking_status,
  linked_user_id,
  linked_person_id,
  is_active,
  created_at,
  updated_at
FROM public.community_mukhis
WHERE is_active = TRUE;

GRANT SELECT ON public.community_mukhis_directory TO authenticated, anon;

-- 4. Admin RPC to atomically upsert Community Mukhis with Gotra and Nukh
CREATE OR REPLACE FUNCTION public.admin_upsert_community_mukhi(
  p_id UUID DEFAULT NULL,
  p_full_name TEXT DEFAULT '',
  p_gram TEXT DEFAULT '',
  p_mobile_number TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_official_email TEXT DEFAULT NULL,
  p_authority_status TEXT DEFAULT 'ACTIVE',
  p_linked_person_id UUID DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS public.community_mukhis
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mukhi public.community_mukhis;
  v_serial INTEGER;
  v_unique_id TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only ADMIN or SUPER_ADMIN can manage official community Mukhis';
  END IF;

  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Mukhi full name is mandatory';
  END IF;

  IF p_gram IS NULL OR trim(p_gram) = '' THEN
    RAISE EXCEPTION 'Region / Gram / City is mandatory';
  END IF;

  IF p_id IS NOT NULL THEN
    -- Update existing Mukhi
    UPDATE public.community_mukhis
    SET
      full_name = trim(p_full_name),
      gram = trim(p_gram),
      mobile_number = NULLIF(trim(COALESCE(p_mobile_number, '')), ''),
      gotra = NULLIF(trim(COALESCE(p_gotra, '')), ''),
      nukh = NULLIF(trim(COALESCE(p_nukh, '')), ''),
      official_email = NULLIF(trim(COALESCE(p_official_email, '')), ''),
      authority_status = COALESCE(p_authority_status, authority_status),
      linked_person_id = COALESCE(p_linked_person_id, linked_person_id),
      is_active = p_is_active,
      updated_at = NOW()
    WHERE id = p_id
    RETURNING * INTO v_mukhi;
  ELSE
    -- Calculate next serial number if not present
    SELECT COALESCE(MAX(source_serial_number), 118) + 1 INTO v_serial FROM public.community_mukhis;
    v_unique_id := 'MUK-' || LPAD(v_serial::TEXT, 4, '0');

    INSERT INTO public.community_mukhis (
      source_serial_number,
      mukhi_unique_id,
      full_name,
      gram,
      mobile_number,
      gotra,
      nukh,
      official_email,
      authority_status,
      account_linking_status,
      linked_person_id,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      v_serial,
      v_unique_id,
      trim(p_full_name),
      trim(p_gram),
      NULLIF(trim(COALESCE(p_mobile_number, '')), ''),
      NULLIF(trim(COALESCE(p_gotra, '')), ''),
      NULLIF(trim(COALESCE(p_nukh, '')), ''),
      NULLIF(trim(COALESCE(p_official_email, '')), ''),
      COALESCE(p_authority_status, 'ACTIVE'),
      CASE WHEN p_linked_person_id IS NOT NULL THEN 'LINKED' ELSE 'NOT_REGISTERED' END,
      p_linked_person_id,
      p_is_active,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_mukhi;
  END IF;

  RETURN v_mukhi;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_community_mukhi TO authenticated;

-- 5. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
