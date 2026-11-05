-- =============================================================================
-- Migration: 20261105160000_sync_person_deceased_status.sql
-- Purpose:
--   1. Automatically synchronize public.persons.status with date_of_death:
--      - When date_of_death is provided, status is set to 'DECEASED'.
--      - When date_of_death is cleared (from DECEASED), status is restored to 'ACTIVE'.
--   2. Ensures the persons_deceased_must_have_status check constraint is always satisfied
--      across all UI forms, RPCs, and API calls seamlessly.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_person_deceased_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If date_of_death is provided and not null, set status to DECEASED
  IF NEW.date_of_death IS NOT NULL THEN
    NEW.status := 'DECEASED'::public.person_status;
  -- If date_of_death was previously set and is now cleared, restore status to ACTIVE
  ELSIF TG_OP = 'UPDATE' AND OLD.date_of_death IS NOT NULL AND NEW.date_of_death IS NULL THEN
    IF NEW.status = 'DECEASED'::public.person_status THEN
      NEW.status := 'ACTIVE'::public.person_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_person_deceased_status ON public.persons;
CREATE TRIGGER trg_sync_person_deceased_status
  BEFORE INSERT OR UPDATE OF date_of_death, status ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_person_deceased_status();

GRANT EXECUTE ON FUNCTION public.sync_person_deceased_status() TO authenticated, anon;

COMMIT;
