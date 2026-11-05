-- =============================================================================
-- Migration: 20261105173000_rename_nukh_karotala_to_karatela.sql
-- Purpose:
--   In Gotra Krishna (Shishan), replace Nukh "Karotala" with "Karatela".
--   Updates:
--     1. Any active public.persons records referencing Karotala in Krishna (Shishan)
--     2. Any active public.families records referencing Karotala in Krishna (Shishan)
--     3. The canonical public.nukhs master registry entry for Krishna (Shishan)
--   Safely handles the guard_nukh_master_integrity check so updates proceed cleanly.
-- =============================================================================

BEGIN;

-- 1. Update any existing community person records referencing Karotala
UPDATE public.persons
SET nukh = 'Karatela'
WHERE lower(nukh) = 'karotala'
  AND (
    lower(gotra) LIKE '%krishna%'
    OR lower(gotra) LIKE '%shishan%'
    OR gotra IS NULL
  );

-- 2. Update any existing community family records referencing Karotala
UPDATE public.families
SET nukh = 'Karatela'
WHERE lower(nukh) = 'karotala'
  AND (
    lower(gotra) LIKE '%krishna%'
    OR lower(gotra) LIKE '%shishan%'
    OR gotra IS NULL
  );

-- 3. Update public.nukhs master registry entry for Gotra Krishna (Shishan)
DO $$
DECLARE
  v_gotra_id UUID;
BEGIN
  -- Locate Gotra ID for Krishna (Shishan)
  SELECT id INTO v_gotra_id
  FROM public.gotras
  WHERE lower(name) LIKE '%krishna%'
  LIMIT 1;

  IF v_gotra_id IS NOT NULL THEN
    -- Temporarily disable guard trigger during migration rename
    ALTER TABLE public.nukhs DISABLE TRIGGER trg_guard_nukh_master_integrity;

    -- If Karatela already exists under this Gotra, remove old Karotala entry
    IF EXISTS (
      SELECT 1 FROM public.nukhs
      WHERE gotra_id = v_gotra_id
        AND lower(name) = 'karatela'
    ) THEN
      DELETE FROM public.nukhs
      WHERE gotra_id = v_gotra_id
        AND lower(name) = 'karotala';
    ELSE
      -- Otherwise rename Karotala to Karatela
      UPDATE public.nukhs
      SET name = 'Karatela'
      WHERE gotra_id = v_gotra_id
        AND lower(name) = 'karotala';

      -- If neither existed, ensure Karatela exists
      IF NOT FOUND AND NOT EXISTS (
        SELECT 1 FROM public.nukhs
        WHERE gotra_id = v_gotra_id
          AND lower(name) = 'karatela'
      ) THEN
        INSERT INTO public.nukhs (gotra_id, name)
        VALUES (v_gotra_id, 'Karatela')
        ON CONFLICT (gotra_id, lower(name)) DO NOTHING;
      END IF;
    END IF;

    -- Re-enable guard trigger
    ALTER TABLE public.nukhs ENABLE TRIGGER trg_guard_nukh_master_integrity;
  END IF;
END $$;

COMMIT;
