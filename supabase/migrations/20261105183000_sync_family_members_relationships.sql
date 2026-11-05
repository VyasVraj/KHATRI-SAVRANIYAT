-- =============================================================================
-- Migration: 20261105183000_sync_family_members_relationships.sql
-- Purpose:
--   1. Automatically synchronize public.relationships with public.family_members:
--      - When a family member's role changes (e.g. CHILD -> SPOUSE, SPOUSE -> CHILD):
--        Soft-deletes the previous relationship with the Family Head and inserts
--        the new canonical relationship.
--      - When a member is soft-removed (left_at IS NOT NULL), soft-deletes
--        their active relationships with the Family Head.
--   2. Ensures the Family Tree and Family Roster always display the exact same
--      persisted relationship structure from Supabase.
--   3. Enables Realtime publication on family_members and relationships tables.
-- =============================================================================

BEGIN;

-- 1. Trigger function to synchronize interpersonal relationships with head
CREATE OR REPLACE FUNCTION public.sync_family_member_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_head_person_id UUID;
  v_creator_id UUID;
  v_p_a UUID;
  v_p_b UUID;
BEGIN
  -- If this is an UPDATE and neither role, is_head, nor left_at changed, skip
  IF TG_OP = 'UPDATE' AND OLD.role = NEW.role AND OLD.is_head = NEW.is_head AND OLD.left_at IS NOT DISTINCT FROM NEW.left_at THEN
    RETURN NEW;
  END IF;

  -- Resolve family head person ID
  SELECT head_person_id, created_by INTO v_head_person_id, v_creator_id
  FROM public.families
  WHERE id = NEW.family_id;

  IF v_head_person_id IS NULL THEN
    SELECT person_id INTO v_head_person_id
    FROM public.family_members
    WHERE family_id = NEW.family_id AND is_head = TRUE AND left_at IS NULL
    LIMIT 1;
  END IF;

  -- If head is unknown or this member IS the head, no relative edge to head needed
  IF v_head_person_id IS NULL OR v_head_person_id = NEW.person_id THEN
    RETURN NEW;
  END IF;

  -- 1. Soft-delete any existing active relationship with the head
  UPDATE public.relationships
  SET deleted_at = NOW(),
      updated_at = NOW()
  WHERE deleted_at IS NULL
    AND (
      (person_a_id = v_head_person_id AND person_b_id = NEW.person_id)
      OR (person_a_id = NEW.person_id AND person_b_id = v_head_person_id)
    );

  -- If member has departed (left_at IS NOT NULL), we stop after soft-deleting
  IF NEW.left_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Insert new relationship based on updated role
  IF NEW.role = 'SPOUSE' THEN
    IF v_head_person_id < NEW.person_id THEN
      v_p_a := v_head_person_id; v_p_b := NEW.person_id;
    ELSE
      v_p_a := NEW.person_id; v_p_b := v_head_person_id;
    END IF;

    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (v_p_a, v_p_b, 'SPOUSE', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

  ELSIF NEW.role = 'CHILD' THEN
    -- Head is Parent of Child
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (v_head_person_id, NEW.person_id, 'PARENT', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

  ELSIF NEW.role = 'PARENT' THEN
    -- Member is Parent of Head
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (NEW.person_id, v_head_person_id, 'PARENT', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

  ELSIF NEW.role = 'SIBLING' THEN
    IF v_head_person_id < NEW.person_id THEN
      v_p_a := v_head_person_id; v_p_b := NEW.person_id;
    ELSE
      v_p_a := NEW.person_id; v_p_b := v_head_person_id;
    END IF;

    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (v_p_a, v_p_b, 'SIBLING', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_family_member_relationship ON public.family_members;
CREATE TRIGGER trg_sync_family_member_relationship
  AFTER INSERT OR UPDATE OF role, is_head, left_at ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_family_member_relationship();

-- 2. Backfill: Synchronize any pre-existing active family members with public.relationships
DO $$
DECLARE
  rec RECORD;
  v_head_id UUID;
  v_creator UUID;
  v_p_a UUID;
  v_p_b UUID;
BEGIN
  FOR rec IN
    SELECT fm.family_id, fm.person_id, fm.role, f.head_person_id, f.created_by
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.left_at IS NULL
      AND fm.is_head = FALSE
      AND (f.head_person_id IS NOT NULL AND f.head_person_id <> fm.person_id)
  LOOP
    v_head_id := rec.head_person_id;
    v_creator := rec.created_by;

    IF rec.role = 'SPOUSE' THEN
      IF v_head_id < rec.person_id THEN
        v_p_a := v_head_id; v_p_b := rec.person_id;
      ELSE
        v_p_a := rec.person_id; v_p_b := v_head_id;
      END IF;

      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (v_p_a, v_p_b, 'SPOUSE', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    ELSIF rec.role = 'CHILD' THEN
      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (v_head_id, rec.person_id, 'PARENT', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    ELSIF rec.role = 'PARENT' THEN
      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (rec.person_id, v_head_id, 'PARENT', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    ELSIF rec.role = 'SIBLING' THEN
      IF v_head_id < rec.person_id THEN
        v_p_a := v_head_id; v_p_b := rec.person_id;
      ELSE
        v_p_a := rec.person_id; v_p_b := v_head_id;
      END IF;

      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (v_p_a, v_p_b, 'SIBLING', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- 3. Ensure tables are in supabase_realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.relationships;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

COMMIT;
