-- =============================================================================
-- Migration: 20261106060000_mukhi_directory_118_records_and_anon_read.sql
-- Description: Ensure all 118 official Mukhis are active and queryable by
--              both authenticated community members and public visitors.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure columns exist on public.community_mukhis
-- -----------------------------------------------------------------------------
ALTER TABLE public.community_mukhis
  ADD COLUMN IF NOT EXISTS mukhi_unique_id TEXT,
  ADD COLUMN IF NOT EXISTS official_email TEXT,
  ADD COLUMN IF NOT EXISTS account_linking_status TEXT NOT NULL DEFAULT 'NOT_REGISTERED',
  ADD COLUMN IF NOT EXISTS authority_status TEXT NOT NULL DEFAULT 'ACTIVE';

-- -----------------------------------------------------------------------------
-- 2. Ensure all 118 records have MUK-XXXX unique IDs and ACTIVE authority status
-- -----------------------------------------------------------------------------
UPDATE public.community_mukhis
SET
  mukhi_unique_id = 'MUK-' || lpad(source_serial_number::text, 4, '0'),
  authority_status = 'ACTIVE'
WHERE source_serial_number BETWEEN 1 AND 118
  AND (mukhi_unique_id IS NULL OR authority_status IS NULL OR authority_status <> 'ACTIVE');

-- -----------------------------------------------------------------------------
-- 3. Row-Level Security for public read access
-- -----------------------------------------------------------------------------
ALTER TABLE public.community_mukhis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_mukhis_select_all" ON public.community_mukhis;
DROP POLICY IF EXISTS "community_mukhis_select_authenticated" ON public.community_mukhis;

CREATE POLICY "community_mukhis_select_all"
  ON public.community_mukhis
  FOR SELECT
  TO authenticated, anon
  USING (is_active = TRUE);

GRANT SELECT ON public.community_mukhis TO authenticated, anon;
GRANT SELECT ON public.community_mukhis_directory TO authenticated, anon;

COMMIT;
