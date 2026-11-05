-- =============================================================================
-- Migration: 20261105173000_rename_nukh_karotala_to_karatela.sql
-- Purpose:
--   In Gotra Krishna (Shishan), replace Nukh "Karotala" with "Karatela".
--   Updates:
--     1. The canonical public.nukhs master registry entry for Krishna (Shishan)
--     2. Any active public.persons records referencing Karotala in Krishna (Shishan)
--     3. Any active public.families records referencing Karotala in Krishna (Shishan)
--   Temporarily suspends validation triggers during the transaction to avoid
--   chicken-and-egg validation errors (22023 INVALID_GOTRA_NUKH & 23001 RESTRICT).
-- =============================================================================

BEGIN;

-- Temporarily disable validation triggers for the atomic rename
ALTER TABLE public.persons DISABLE TRIGGER trg_validate_person_gotra_nukh;
ALTER TABLE public.families DISABLE TRIGGER trg_validate_family_gotra_nukh;
ALTER TABLE public.nukhs DISABLE TRIGGER trg_guard_nukh_master_integrity;

-- 1. Ensure Karatela exists in public.nukhs for Gotra Krishna (Shishan)
DO $$
DECLARE
  v_gotra_id UUID;
BEGIN
  SELECT id INTO v_gotra_id
  FROM public.gotras
  WHERE lower(name) LIKE '%krishna%'
  LIMIT 1;

  IF v_gotra_id IS NOT NULL THEN
    -- Insert Karatela if it does not exist
    IF NOT EXISTS (
      SELECT 1 FROM public.nukhs
      WHERE gotra_id = v_gotra_id AND lower(name) = 'karatela'
    ) THEN
      INSERT INTO public.nukhs (gotra_id, name)
      VALUES (v_gotra_id, 'Karatela')
      ON CONFLICT (gotra_id, lower(name)) DO NOTHING;
    END IF;
  END IF;
END $$;

-- 2. Update any existing community persons records referencing Karotala
UPDATE public.persons
SET nukh = 'Karatela'
WHERE lower(nukh) = 'karotala'
  AND (
    lower(gotra) LIKE '%krishna%'
    OR lower(gotra) LIKE '%shishan%'
    OR gotra IS NULL
  );

-- 3. Update any existing community families records referencing Karotala
UPDATE public.families
SET nukh = 'Karatela'
WHERE lower(nukh) = 'karotala'
  AND (
    lower(gotra) LIKE '%krishna%'
    OR lower(gotra) LIKE '%shishan%'
    OR gotra IS NULL
  );

-- 4. Clean up old Karotala entry from public.nukhs
DO $$
DECLARE
  v_gotra_id UUID;
BEGIN
  SELECT id INTO v_gotra_id
  FROM public.gotras
  WHERE lower(name) LIKE '%krishna%'
  LIMIT 1;

  IF v_gotra_id IS NOT NULL THEN
    DELETE FROM public.nukhs
    WHERE gotra_id = v_gotra_id
      AND lower(name) = 'karotala';
  END IF;
END $$;

-- Re-enable all validation triggers
ALTER TABLE public.persons ENABLE TRIGGER trg_validate_person_gotra_nukh;
ALTER TABLE public.families ENABLE TRIGGER trg_validate_family_gotra_nukh;
ALTER TABLE public.nukhs ENABLE TRIGGER trg_guard_nukh_master_integrity;

COMMIT;
