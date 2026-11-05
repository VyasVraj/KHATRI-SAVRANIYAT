-- =============================================================================
-- Migration: 20261103220000_create_gotra_nukh_master_registry.sql
-- Purpose:   Master Gotra & Nukh tables, case-insensitive uniqueness indexes,
--            seed data (authoritative 29 Gotras & Nukhs), integrity triggers,
--            restricted administrative RLS policies, pre-existing data validation,
--            and database-level canonicalization & validation triggers on persons and families.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Gotra Registry Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gotras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness index on Gotra name
CREATE UNIQUE INDEX IF NOT EXISTS idx_gotras_name_lower_unique ON public.gotras (lower(name));

-- -----------------------------------------------------------------------------
-- 2. Nukh Registry Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nukhs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gotra_id UUID NOT NULL REFERENCES public.gotras(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness index on (gotra_id, lower(name))
CREATE UNIQUE INDEX IF NOT EXISTS idx_nukhs_gotra_name_lower_unique ON public.nukhs (gotra_id, lower(name));

-- -----------------------------------------------------------------------------
-- 3. Row Level Security & Access Control
-- -----------------------------------------------------------------------------
ALTER TABLE public.gotras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nukhs ENABLE ROW LEVEL SECURITY;

-- Revoke default public and anon privileges
REVOKE ALL ON TABLE public.gotras, public.nukhs FROM PUBLIC, anon;

-- Public / Authenticated read-only access (master catalog is visible to all community users)
DROP POLICY IF EXISTS gotras_select_policy ON public.gotras;
CREATE POLICY gotras_select_policy ON public.gotras
  FOR SELECT USING (true);

DROP POLICY IF EXISTS nukhs_select_policy ON public.nukhs;
CREATE POLICY nukhs_select_policy ON public.nukhs
  FOR SELECT USING (true);

-- Restrictive Administrative Mutation Policies (Only active ADMIN or SUPER_ADMIN via public.is_admin())
DROP POLICY IF EXISTS gotras_admin_insert ON public.gotras;
CREATE POLICY gotras_admin_insert ON public.gotras
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS gotras_admin_update ON public.gotras;
CREATE POLICY gotras_admin_update ON public.gotras
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS gotras_admin_delete ON public.gotras;
CREATE POLICY gotras_admin_delete ON public.gotras
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS nukhs_admin_insert ON public.nukhs;
CREATE POLICY nukhs_admin_insert ON public.nukhs
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS nukhs_admin_update ON public.nukhs;
CREATE POLICY nukhs_admin_update ON public.nukhs
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS nukhs_admin_delete ON public.nukhs;
CREATE POLICY nukhs_admin_delete ON public.nukhs
  FOR DELETE USING (public.is_admin());

-- Explicit grants: SELECT for client roles; mutations guarded by RLS
GRANT SELECT ON TABLE public.gotras, public.nukhs TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.gotras, public.nukhs TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Integrity Guard Triggers (Prevent deleting, renaming, or reassigning active entries)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_gotra_master_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND lower(NEW.name) != lower(OLD.name)) THEN
    IF EXISTS (
      SELECT 1 FROM public.persons WHERE lower(gotra) = lower(OLD.name)
    ) OR EXISTS (
      SELECT 1 FROM public.families WHERE lower(gotra) = lower(OLD.name)
    ) THEN
      RAISE EXCEPTION 'RESTRICT: Cannot delete or rename Gotra "%" because active community records reference it.', OLD.name USING ERRCODE = '23001';
    END IF;
  END IF;

  -- For BEFORE DELETE triggers, return OLD to allow row removal.
  -- Returning NEW (which is NULL on DELETE) silences/suppresses deletion.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_gotra_master_integrity ON public.gotras;
CREATE TRIGGER trg_guard_gotra_master_integrity
  BEFORE UPDATE OF name OR DELETE ON public.gotras
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gotra_master_integrity();

CREATE OR REPLACE FUNCTION public.guard_nukh_master_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_gotra_name TEXT;
BEGIN
  -- Retrieve Gotra name for OLD.gotra_id to scope check specifically to this Gotra+Nukh pair
  SELECT name INTO v_old_gotra_name FROM public.gotras WHERE id = OLD.gotra_id;

  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND (lower(NEW.name) != lower(OLD.name) OR NEW.gotra_id != OLD.gotra_id)) THEN

    IF EXISTS (
      SELECT 1 FROM public.persons
      WHERE lower(gotra) = lower(v_old_gotra_name)
        AND lower(nukh) = lower(OLD.name)
    ) OR EXISTS (
      SELECT 1 FROM public.families
      WHERE lower(gotra) = lower(v_old_gotra_name)
        AND lower(nukh) = lower(OLD.name)
    ) THEN
      RAISE EXCEPTION 'RESTRICT: Cannot delete, rename, or reassign Nukh "%" in Gotra "%" because active community records reference this association.', OLD.name, v_old_gotra_name USING ERRCODE = '23001';
    END IF;
  END IF;

  -- For BEFORE DELETE triggers, return OLD to allow row removal.
  -- Returning NEW (which is NULL on DELETE) silences/suppresses deletion.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_nukh_master_integrity ON public.nukhs;
CREATE TRIGGER trg_guard_nukh_master_integrity
  BEFORE UPDATE OF name, gotra_id OR DELETE ON public.nukhs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_nukh_master_integrity();

-- -----------------------------------------------------------------------------
-- 5. Gotra and Nukh columns on persons and families
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS gotra TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS nukh TEXT;

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS gotra TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS nukh TEXT;

-- -----------------------------------------------------------------------------
-- 6. Seed Data: Authoritative 29 Gotras and Dependent Nukhs
--    Uses ON CONFLICT ((lower(name))) and ON CONFLICT (gotra_id, (lower(name)))
--    ensuring complete idempotency while restoring exact canonical casing on reruns.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_gid UUID;
  v_nukh TEXT;
BEGIN
  FOR r IN
    SELECT g.name AS g_name, g.disp_order, g.nukhs
    FROM (VALUES
      ('Agastya', 1, ARRAY['Agasti', 'Dixit', 'Pandya', 'Pathak']),
      ('Alambayan', 2, ARRAY['Alamb', 'Bhatt', 'Rawal']),
      ('Angiras', 3, ARRAY['Angira', 'Brihaspati', 'Dave', 'Sharma']),
      ('Atri', 4, ARRAY['Atre', 'Bhatt', 'Joshi', 'Sukla']),
      ('Audala', 5, ARRAY['Audichya', 'Dholakia', 'Trivedi']),
      ('Bharadwaj', 6, ARRAY['Bharadwaj', 'Dwivedi', 'Kapadia', 'Pattani', 'Tripathi', 'Upadhyaya']),
      ('Bhrigu', 7, ARRAY['Bhargav', 'Bhrigu', 'Chhaya', 'Shukla']),
      ('Dhananjaya', 8, ARRAY['Arjuna', 'Dhanani', 'Parikh']),
      ('Garg', 9, ARRAY['Garga', 'Gargya', 'Jani', 'Pandya']),
      ('Garga', 10, ARRAY['Garg', 'Gargeya', 'Upadhyaya']),
      ('Gautam', 11, ARRAY['Chauhan', 'Gautam', 'Panchal', 'Rathod', 'Solanki']),
      ('Harita', 12, ARRAY['Harit', 'Haritasya', 'Vyas']),
      ('Jamadagni', 13, ARRAY['Jamadagni', 'Mankad', 'Mehta']),
      ('Kanva', 14, ARRAY['Kanva', 'Kashyap', 'Thakar']),
      ('Kapil', 15, ARRAY['Kapila', 'Munshi', 'Trivedi']),
      ('Kashyap', 16, ARRAY['Aditya', 'Chauhan', 'Dholakia', 'Kashyap', 'Khatri', 'Naik', 'Parekh', 'Solanki', 'Varun']),
      ('Katyayan', 17, ARRAY['Katya', 'Katyayan', 'Mehta']),
      ('Kaundinya', 18, ARRAY['Kaundinya', 'Majmudar', 'Pathak']),
      ('Kaushik', 19, ARRAY['Gadhavi', 'Kaushik', 'Viswamitra']),
      ('Mudgala', 20, ARRAY['Modh', 'Mudgal', 'Pujara']),
      ('Parashar', 21, ARRAY['Parashar', 'Parasharya', 'Shastri']),
      ('Rohit', 22, ARRAY['Rohita', 'Surti', 'Vyas']),
      ('Sankriti', 23, ARRAY['Sankrit', 'Vaidya']),
      ('Shandilya', 24, ARRAY['Mehta', 'Nanavati', 'Pandit', 'Shandilya', 'Shukla']),
      ('Shaunak', 25, ARRAY['Shaunaka', 'Thaker', 'Vyas']),
      ('Sudarshan', 26, ARRAY['Keria', 'Khatri', 'Mulchandani', 'Sudarshan', 'Vaswani']),
      ('Upamanyu', 27, ARRAY['Upamanyu', 'Upadhyay']),
      ('Vashistha', 28, ARRAY['Solanki', 'Vashisth', 'Vashistha']),
      ('Vatsa', 29, ARRAY['Bakshi', 'Munshi', 'Vats', 'Vatsa'])
    ) AS g(name, disp_order, nukhs)
  LOOP
    -- 1. Insert or update Gotra targeting lower(name) unique index, restoring canonical casing
    INSERT INTO public.gotras (name, display_order)
    VALUES (r.g_name, r.disp_order)
    ON CONFLICT ((lower(name))) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order;

    -- 2. Case-insensitively resolve the canonical Gotra ID (never NULL)
    SELECT id INTO v_gid
    FROM public.gotras
    WHERE lower(name) = lower(r.g_name);

    IF v_gid IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: Failed to retrieve canonical Gotra ID for "%"', r.g_name;
    END IF;

    -- 3. Insert Nukhs targeting (gotra_id, lower(name)) unique index, restoring canonical casing
    FOREACH v_nukh IN ARRAY r.nukhs
    LOOP
      INSERT INTO public.nukhs (gotra_id, name)
      VALUES (v_gid, v_nukh)
      ON CONFLICT (gotra_id, (lower(name))) DO UPDATE
      SET name = EXCLUDED.name;
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Existing Data Inspection & Canonicalization
--    Validates existing non-null records against master registry.
--    Aborts immediately with a detailed list if invalid or ambiguous records exist.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_unmatched_persons TEXT;
  v_unmatched_families TEXT;
BEGIN
  -- 0. Normalize empty or whitespace-only Gotra and Nukh values to NULL in existing records
  UPDATE public.persons
  SET gotra = NULL
  WHERE gotra IS NOT NULL AND trim(gotra) = '';

  UPDATE public.persons
  SET nukh = NULL
  WHERE nukh IS NOT NULL AND trim(nukh) = '';

  UPDATE public.families
  SET gotra = NULL
  WHERE gotra IS NOT NULL AND trim(gotra) = '';

  UPDATE public.families
  SET nukh = NULL
  WHERE nukh IS NOT NULL AND trim(nukh) = '';

  -- Also trim leading/trailing whitespace on populated entries
  UPDATE public.persons
  SET gotra = trim(gotra)
  WHERE gotra IS NOT NULL AND gotra != trim(gotra);

  UPDATE public.persons
  SET nukh = trim(nukh)
  WHERE nukh IS NOT NULL AND nukh != trim(nukh);

  UPDATE public.families
  SET gotra = trim(gotra)
  WHERE gotra IS NOT NULL AND gotra != trim(gotra);

  UPDATE public.families
  SET nukh = trim(nukh)
  WHERE nukh IS NOT NULL AND nukh != trim(nukh);

  -- 1. Canonicalize existing Gotras in persons using case-insensitive match
  UPDATE public.persons p
  SET gotra = g.name
  FROM public.gotras g
  WHERE p.gotra IS NOT NULL
    AND lower(trim(p.gotra)) = lower(g.name)
    AND p.gotra != g.name;

  -- 2. Canonicalize existing Nukhs in persons using case-insensitive match scoped to their Gotra
  UPDATE public.persons p
  SET nukh = n.name
  FROM public.gotras g
  JOIN public.nukhs n ON n.gotra_id = g.id
  WHERE p.gotra IS NOT NULL
    AND p.nukh IS NOT NULL
    AND lower(trim(p.gotra)) = lower(g.name)
    AND lower(trim(p.nukh)) = lower(n.name)
    AND p.nukh != n.name;

  -- 3. Canonicalize existing Gotras in families
  UPDATE public.families f
  SET gotra = g.name
  FROM public.gotras g
  WHERE f.gotra IS NOT NULL
    AND lower(trim(f.gotra)) = lower(g.name)
    AND f.gotra != g.name;

  -- 4. Canonicalize existing Nukhs in families
  UPDATE public.families f
  SET nukh = n.name
  FROM public.gotras g
  JOIN public.nukhs n ON n.gotra_id = g.id
  WHERE f.gotra IS NOT NULL
    AND f.nukh IS NOT NULL
    AND lower(trim(f.gotra)) = lower(g.name)
    AND lower(trim(f.nukh)) = lower(n.name)
    AND f.nukh != n.name;

  -- 5. Inspect for any remaining invalid or unmatched Gotra/Nukh values in persons
  SELECT string_agg(
    'Person ID ' || p.id || ': Gotra="' || COALESCE(p.gotra, 'NULL') || '", Nukh="' || COALESCE(p.nukh, 'NULL') || '"',
    E'\n'
  )
  INTO v_unmatched_persons
  FROM public.persons p
  WHERE (p.gotra IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g WHERE lower(g.name) = lower(trim(p.gotra))
  )) OR (p.nukh IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g
    JOIN public.nukhs n ON n.gotra_id = g.id
    WHERE lower(g.name) = lower(trim(p.gotra))
      AND lower(n.name) = lower(trim(p.nukh))
  ));

  IF v_unmatched_persons IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Found existing persons with invalid or unmatched Gotra/Nukh records:%',
      E'\n' || v_unmatched_persons
      USING ERRCODE = '22023';
  END IF;

  -- 6. Inspect for any remaining invalid or unmatched Gotra/Nukh values in families
  SELECT string_agg(
    'Family ID ' || f.id || ': Gotra="' || COALESCE(f.gotra, 'NULL') || '", Nukh="' || COALESCE(f.nukh, 'NULL') || '"',
    E'\n'
  )
  INTO v_unmatched_families
  FROM public.families f
  WHERE (f.gotra IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g WHERE lower(g.name) = lower(trim(f.gotra))
  )) OR (f.nukh IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g
    JOIN public.nukhs n ON n.gotra_id = g.id
    WHERE lower(g.name) = lower(trim(f.gotra))
      AND lower(n.name) = lower(trim(f.nukh))
  ));

  IF v_unmatched_families IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Found existing families with invalid or unmatched Gotra/Nukh records:%',
      E'\n' || v_unmatched_families
      USING ERRCODE = '22023';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Database-Level Canonicalization & Validation Trigger Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_gotra_nukh()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gotra_id UUID;
  v_canonical_gotra TEXT;
  v_canonical_nukh TEXT;
BEGIN
  -- Normalize empty strings to NULL
  NEW.gotra := NULLIF(trim(NEW.gotra), '');
  NEW.nukh := NULLIF(trim(NEW.nukh), '');

  -- If both are NULL, allow
  IF NEW.gotra IS NULL AND NEW.nukh IS NULL THEN
    RETURN NEW;
  END IF;

  -- If Nukh is provided without Gotra, reject
  IF NEW.gotra IS NULL AND NEW.nukh IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA_NUKH: Nukh cannot be specified without a valid Gotra.' USING ERRCODE = '22023';
  END IF;

  -- Validate Gotra exists in public.gotras and fetch canonical master spelling
  SELECT id, name INTO v_gotra_id, v_canonical_gotra
  FROM public.gotras
  WHERE lower(name) = lower(NEW.gotra);

  IF v_gotra_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA_NUKH: "%" is not a registered Gotra.', NEW.gotra USING ERRCODE = '22023';
  END IF;

  -- Canonicalize stored Gotra spelling from master table
  NEW.gotra := v_canonical_gotra;

  -- If Nukh is provided, validate it belongs to that Gotra and canonicalize stored Nukh spelling
  IF NEW.nukh IS NOT NULL THEN
    SELECT name INTO v_canonical_nukh
    FROM public.nukhs
    WHERE gotra_id = v_gotra_id AND lower(name) = lower(NEW.nukh);

    IF v_canonical_nukh IS NULL THEN
      RAISE EXCEPTION 'INVALID_GOTRA_NUKH: Nukh "%" does not belong to Gotra "%".', NEW.nukh, v_canonical_gotra USING ERRCODE = '22023';
    END IF;

    -- Canonicalize stored Nukh spelling from master table
    NEW.nukh := v_canonical_nukh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_gotra_nukh() IS
  'Guarantees database-level master data integrity and canonical casing for Gotra and Nukh across persons and families.';

-- Attach triggers to persons and families
DROP TRIGGER IF EXISTS trg_validate_person_gotra_nukh ON public.persons;
CREATE TRIGGER trg_validate_person_gotra_nukh
  BEFORE INSERT OR UPDATE OF gotra, nukh ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_gotra_nukh();

DROP TRIGGER IF EXISTS trg_validate_family_gotra_nukh ON public.families;
CREATE TRIGGER trg_validate_family_gotra_nukh
  BEFORE INSERT OR UPDATE OF gotra, nukh ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_gotra_nukh();

COMMIT;
