-- =============================================================================
-- Migration: 20261108080000_fix_family_head_relationship_independence.sql
-- Purpose:
--   1. Separate Family Head administrative designation from interpersonal relationships:
--      - Changing or transferring the Family Head (is_head) must NEVER delete,
--        demote, or alter existing family relationships in public.relationships.
--      - When updating a family_members record where only is_head changes,
--        the relationship sync trigger skips execution immediately.
--   2. Ensures the Family Tree and Roster preserve true interpersonal relationships
--      (Father, Mother, Son, Daughter, Spouse) regardless of who is designated Head.
-- =============================================================================

BEGIN;

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
  -- If this is an UPDATE and role did NOT change and left_at did NOT change,
  -- changing is_head or other metadata must NEVER alter interpersonal relationships.
  IF TG_OP = 'UPDATE' AND OLD.role = NEW.role AND OLD.left_at IS NOT DISTINCT FROM NEW.left_at THEN
    RETURN NEW;
  END IF;

  -- Resolve family creator
  SELECT created_by INTO v_creator_id
  FROM public.families
  WHERE id = NEW.family_id;

  -- Resolve family head person ID from active head member in family_members
  SELECT person_id INTO v_head_person_id
  FROM public.family_members
  WHERE family_id = NEW.family_id AND is_head = TRUE AND left_at IS NULL
  LIMIT 1;

  -- If head is unknown or this member IS the head, no relative edge to head needed
  IF v_head_person_id IS NULL OR v_head_person_id = NEW.person_id THEN
    RETURN NEW;
  END IF;

  -- 1. If role changed or member departed, only modify the relationship if role actually changed
  IF TG_OP = 'UPDATE' AND OLD.role <> NEW.role THEN
    UPDATE public.relationships
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE deleted_at IS NULL
      AND (
        (person_a_id = v_head_person_id AND person_b_id = NEW.person_id)
        OR (person_a_id = NEW.person_id AND person_b_id = v_head_person_id)
      );
  END IF;

  -- If member has departed (left_at IS NOT NULL), soft-delete relationship
  IF NEW.left_at IS NOT NULL THEN
    UPDATE public.relationships
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE deleted_at IS NULL
      AND (
        (person_a_id = v_head_person_id AND person_b_id = NEW.person_id)
        OR (person_a_id = NEW.person_id AND person_b_id = v_head_person_id)
      );
    RETURN NEW;
  END IF;

  -- 2. Insert new relationship based on updated/inserted role relative to the family head
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

COMMIT;
