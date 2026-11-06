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

COMMIT;
