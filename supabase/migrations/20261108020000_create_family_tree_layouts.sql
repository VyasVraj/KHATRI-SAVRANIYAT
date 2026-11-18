-- =============================================================================
-- Migration: 20261108020000_create_family_tree_layouts.sql
-- Description: Additive table to persist interactive manual positioning (pos_x, pos_y)
--              for family tree visual nodes without modifying family or person records.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.family_tree_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  pos_x NUMERIC NOT NULL,
  pos_y NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (family_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_family_tree_layouts_family_id
  ON public.family_tree_layouts(family_id);

COMMENT ON TABLE public.family_tree_layouts IS
  'Stores manual visual (X, Y) canvas coordinates for family tree nodes without altering genealogical relationship data.';

ALTER TABLE public.family_tree_layouts ENABLE ROW LEVEL SECURITY;

-- Select policy: Authenticated community members can read saved tree layouts
DROP POLICY IF EXISTS "family_tree_layouts_select" ON public.family_tree_layouts;
CREATE POLICY "family_tree_layouts_select"
  ON public.family_tree_layouts
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );

-- Insert / Upsert policy: Authenticated members can persist layout coordinates
DROP POLICY IF EXISTS "family_tree_layouts_insert" ON public.family_tree_layouts;
CREATE POLICY "family_tree_layouts_insert"
  ON public.family_tree_layouts
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Update policy
DROP POLICY IF EXISTS "family_tree_layouts_update" ON public.family_tree_layouts;
CREATE POLICY "family_tree_layouts_update"
  ON public.family_tree_layouts
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
  );

-- Delete policy (used when resetting layout to default)
DROP POLICY IF EXISTS "family_tree_layouts_delete" ON public.family_tree_layouts;
CREATE POLICY "family_tree_layouts_delete"
  ON public.family_tree_layouts
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
  );

-- Function to bulk upsert tree positions atomically
CREATE OR REPLACE FUNCTION public.save_family_tree_layout(
  p_family_id UUID,
  p_positions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_pos RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required.' USING ERRCODE = '42501';
  END IF;

  IF p_positions IS NOT NULL AND jsonb_typeof(p_positions) = 'array' THEN
    FOR v_pos IN
      SELECT
        (elem->>'person_id')::UUID AS person_id,
        (elem->>'x')::NUMERIC AS pos_x,
        (elem->>'y')::NUMERIC AS pos_y
      FROM jsonb_array_elements(p_positions) AS elem
      WHERE elem->>'person_id' IS NOT NULL
        AND elem->>'x' IS NOT NULL
        AND elem->>'y' IS NOT NULL
    LOOP
      INSERT INTO public.family_tree_layouts (
        family_id,
        person_id,
        pos_x,
        pos_y,
        updated_at,
        updated_by
      ) VALUES (
        p_family_id,
        v_pos.person_id,
        v_pos.pos_x,
        v_pos.pos_y,
        NOW(),
        v_caller
      )
      ON CONFLICT (family_id, person_id)
      DO UPDATE SET
        pos_x = EXCLUDED.pos_x,
        pos_y = EXCLUDED.pos_y,
        updated_at = NOW(),
        updated_by = v_caller;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'family_id', p_family_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_family_tree_layout(UUID, JSONB) TO authenticated;

-- Function to reset family tree layout
CREATE OR REPLACE FUNCTION public.reset_family_tree_layout(p_family_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.family_tree_layouts WHERE family_id = p_family_id;

  RETURN jsonb_build_object('success', TRUE, 'family_id', p_family_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_family_tree_layout(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
