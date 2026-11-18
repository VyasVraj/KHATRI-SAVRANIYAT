-- Migration: 20261108060000_fix_relationship_notes_edit_authorization.sql
-- Description: Authorize family members, Family Head, record creator, and Admins to edit relationship notes
-- Fixes PGRST116 ("Relationship record not found") error on relationship notes updates.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helper function: public.can_edit_relationship(p_relationship_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_relationship(p_relationship_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_relationship_id IS NOT NULL AND (
      -- 1. System Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Creator of the relationship
      EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.id = p_relationship_id
          AND r.deleted_at IS NULL
          AND r.created_by = auth.uid()
      )
      OR
      -- 3. Any active registered member belonging to the same family as either endpoint
      EXISTS (
        SELECT 1
        FROM public.relationships r
        JOIN public.family_members fm_target ON (fm_target.person_id = r.person_a_id OR fm_target.person_id = r.person_b_id)
        JOIN public.family_members fm_caller ON fm_caller.family_id = fm_target.family_id
        JOIN public.persons p_caller ON p_caller.id = fm_caller.person_id
        WHERE r.id = p_relationship_id
          AND r.deleted_at IS NULL
          AND p_caller.user_id = auth.uid()
          AND p_caller.deleted_at IS NULL
          AND fm_caller.left_at IS NULL
          AND fm_target.left_at IS NULL
      )
      OR
      -- 4. Family creator / designated manager of the family containing either endpoint
      EXISTS (
        SELECT 1
        FROM public.relationships r
        JOIN public.family_members fm_target ON (fm_target.person_id = r.person_a_id OR fm_target.person_id = r.person_b_id)
        JOIN public.families f ON f.id = fm_target.family_id
        WHERE r.id = p_relationship_id
          AND r.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.created_by = auth.uid() OR f.manager_user_id = auth.uid())
          AND fm_target.left_at IS NULL
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_edit_relationship(UUID) IS
  'Returns true if caller is admin, creator of relationship, or an active family member/creator of either relationship endpoint.';

-- -----------------------------------------------------------------------------
-- 2. Update RLS policy on public.relationships
-- -----------------------------------------------------------------------------
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "relationships_update_creator" ON public.relationships;
DROP POLICY IF EXISTS "relationships_update_authorized" ON public.relationships;

CREATE POLICY "relationships_update_authorized" ON public.relationships
  FOR UPDATE
  USING (public.can_edit_relationship(relationships.id))
  WITH CHECK (public.can_edit_relationship(relationships.id));

-- -----------------------------------------------------------------------------
-- 3. Dedicated Server-Authoritative RPC: public.update_relationship_notes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_relationship_notes(
  p_relationship_id UUID,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated_row RECORD;
BEGIN
  -- Authenticated session required
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to edit relationship notes.' USING ERRCODE = '42501';
  END IF;

  -- Verify authorization
  IF NOT public.can_edit_relationship(p_relationship_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to edit this relationship.' USING ERRCODE = '42501';
  END IF;

  -- Length constraint
  IF p_notes IS NOT NULL AND length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Notes cannot exceed 1000 characters.' USING ERRCODE = '22023';
  END IF;

  -- Perform update
  UPDATE public.relationships
  SET notes = NULLIF(trim(p_notes), ''),
      updated_at = timezone('utc', now())
  WHERE id = p_relationship_id
    AND deleted_at IS NULL
  RETURNING * INTO v_updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Relationship record not found or has been removed.' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(v_updated_row);
END;
$$;

COMMENT ON FUNCTION public.update_relationship_notes(UUID, TEXT) IS
  'Safely updates relationship notes for authorized family members, Family Head, relationship creator, or administrators.';

-- -----------------------------------------------------------------------------
-- 4. Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.can_edit_relationship(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_relationship_notes(UUID, TEXT) TO authenticated;

COMMIT;
