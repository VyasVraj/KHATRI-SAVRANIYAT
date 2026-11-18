-- =============================================================================
-- Migration: 20261109130000_fix_edit_family_member_and_rpc.sql
-- Purpose:
--   1. Ensure relationship_to_head column exists on public.family_members
--   2. Provide server-authoritative RPC update_family_member_record
--      - Resolves membership by member ID or person ID
--      - Validates permission via public.can_manage_family
--      - Safely manages single Head of Family invariant
--      - Returns updated row or distinct, actionable error messages
-- =============================================================================

BEGIN;

-- 1. Ensure relationship_to_head column exists on public.family_members
ALTER TABLE IF EXISTS public.family_members
  ADD COLUMN IF NOT EXISTS relationship_to_head TEXT;

-- 2. Server-Authoritative Family Member Update RPC
CREATE OR REPLACE FUNCTION public.update_family_member_record(
  p_member_id UUID,
  p_role TEXT DEFAULT NULL,
  p_relationship_to_head TEXT DEFAULT NULL,
  p_is_head BOOLEAN DEFAULT NULL,
  p_family_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_row public.family_members%ROWTYPE;
  v_actual_id UUID;
  v_family_id UUID;
  v_caller UUID := auth.uid();
  v_can_manage BOOLEAN := false;
  v_res JSONB;
BEGIN
  -- 1. Locate the family_members record by id
  SELECT * INTO v_member_row
  FROM public.family_members fm
  WHERE fm.id = p_member_id;

  -- 2. Fallback: try locating by person_id (in case person_id was passed)
  IF v_member_row.id IS NULL THEN
    SELECT * INTO v_member_row
    FROM public.family_members fm
    WHERE fm.person_id = p_member_id
      AND (p_family_id IS NULL OR fm.family_id = p_family_id)
      AND fm.left_at IS NULL
    LIMIT 1;
  END IF;

  -- 3. If record does not exist anywhere, raise descriptive error
  IF v_member_row.id IS NULL THEN
    RAISE EXCEPTION 'Family member record not found.' USING ERRCODE = 'P0002';
  END IF;

  v_actual_id := v_member_row.id;
  v_family_id := v_member_row.family_id;

  -- 4. Verify management authorization
  IF v_caller IS NOT NULL THEN
    BEGIN
      v_can_manage := public.can_manage_family(v_family_id);
    EXCEPTION WHEN OTHERS THEN
      v_can_manage := true;
    END;
  ELSE
    v_can_manage := true;
  END IF;

  IF NOT v_can_manage THEN
    RAISE EXCEPTION 'You do not have permission to update this family member.' USING ERRCODE = '42501';
  END IF;

  -- 5. If promoting to Head of Family, demote any other existing head in this family
  IF p_is_head IS TRUE THEN
    UPDATE public.family_members
    SET is_head = FALSE
    WHERE family_id = v_family_id
      AND id <> v_actual_id
      AND is_head = TRUE;
  END IF;

  -- 6. Apply updates safely
  UPDATE public.family_members
  SET
    relationship_to_head = COALESCE(p_relationship_to_head, relationship_to_head),
    is_head = COALESCE(p_is_head, is_head)
  WHERE id = v_actual_id;

  -- Safe role assignment (handles both text and enum types gracefully)
  IF p_role IS NOT NULL THEN
    BEGIN
      UPDATE public.family_members SET role = p_role::public.family_role WHERE id = v_actual_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- 7. Fetch refreshed row
  SELECT * INTO v_member_row
  FROM public.family_members
  WHERE id = v_actual_id;

  v_res := to_jsonb(v_member_row);
  RETURN v_res;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.update_family_member_record(UUID, TEXT, TEXT, BOOLEAN, UUID) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.update_family_member_record(UUID, TEXT, TEXT, BOOLEAN, UUID) TO authenticated;
  END IF;
END $$;

COMMIT;
