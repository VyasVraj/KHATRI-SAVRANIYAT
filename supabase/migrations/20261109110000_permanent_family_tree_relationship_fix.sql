-- =============================================================================
-- Migration: 20261109110000_permanent_family_tree_relationship_fix.sql
-- Purpose:
--   1. Permanent Family Tree Relationship Fix & Complete Head Independence:
--      - Decouple Family Head designation (is_head) from actual interpersonal relationships.
--      - Transferring or reassigning Head of Family must NEVER mutate, delete, or rewrite
--        relationships (Spouse, Parent, Child, Sibling).
--      - Ensure children are linked to BOTH parents (Head and Spouse).
--      - Ensure spouse is linked as parent to children in the family.
--      - Neutralize self-referencing and invalid contradictory relationships.
--   2. Authoritative Canonical Repair for Vyas Family & Existing Families:
--      - Ensure all 9 members of Vyas Family have canonical generational relationships.
--      - Verify 15 canonical edges (Grandparent couple, 2 brother couples, children).
-- =============================================================================

BEGIN;

-- 1. Create or replace the family member relationship sync trigger function
CREATE OR REPLACE FUNCTION public.sync_family_member_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_head_person_id UUID;
  v_spouse_person_id UUID;
  v_creator_id UUID;
  v_p_a UUID;
  v_p_b UUID;
  v_child_rec RECORD;
BEGIN
  -- If role did NOT change and left_at did NOT change,
  -- changing is_head or other metadata must NEVER alter interpersonal relationships.
  IF TG_OP = 'UPDATE' AND OLD.role = NEW.role AND OLD.left_at IS NOT DISTINCT FROM NEW.left_at THEN
    RETURN NEW;
  END IF;

  -- Resolve family creator
  SELECT created_by INTO v_creator_id
  FROM public.families
  WHERE id = NEW.family_id;

  -- Resolve family head person ID
  SELECT person_id INTO v_head_person_id
  FROM public.family_members
  WHERE family_id = NEW.family_id AND is_head = TRUE AND left_at IS NULL
  LIMIT 1;

  -- Resolve spouse of head in this family (if any)
  IF v_head_person_id IS NOT NULL THEN
    SELECT person_id INTO v_spouse_person_id
    FROM public.family_members
    WHERE family_id = NEW.family_id AND role = 'SPOUSE' AND left_at IS NULL AND person_id <> v_head_person_id
    LIMIT 1;
  END IF;

  -- If head is unknown or this member IS the head, no relative edge to head needed
  IF v_head_person_id IS NULL OR v_head_person_id = NEW.person_id THEN
    RETURN NEW;
  END IF;

  -- If role changed, soft-delete prior relationship with head
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

  -- Insert canonical relationship based on member role in family
  IF NEW.role = 'SPOUSE' THEN
    -- Order person IDs lexicographically for undirected SPOUSE relationship
    IF v_head_person_id < NEW.person_id THEN
      v_p_a := v_head_person_id; v_p_b := NEW.person_id;
    ELSE
      v_p_a := NEW.person_id; v_p_b := v_head_person_id;
    END IF;

    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (v_p_a, v_p_b, 'SPOUSE', 'VERIFIED', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    -- Also link this spouse as PARENT to any existing children of the family head
    FOR v_child_rec IN
      SELECT person_id FROM public.family_members
      WHERE family_id = NEW.family_id AND role = 'CHILD' AND left_at IS NULL
    LOOP
      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
      VALUES (NEW.person_id, v_child_rec.person_id, 'PARENT', 'VERIFIED', COALESCE(auth.uid(), v_creator_id))
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
    END LOOP;

  ELSIF NEW.role = 'CHILD' THEN
    -- Head is Parent of Child
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (v_head_person_id, NEW.person_id, 'PARENT', 'VERIFIED', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    -- If Head's spouse exists, Spouse is also Parent of Child
    IF v_spouse_person_id IS NOT NULL AND v_spouse_person_id <> NEW.person_id THEN
      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
      VALUES (v_spouse_person_id, NEW.person_id, 'PARENT', 'VERIFIED', COALESCE(auth.uid(), v_creator_id))
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
    END IF;

    -- Link as SIBLING to existing children in the same family
    FOR v_child_rec IN
      SELECT person_id FROM public.family_members
      WHERE family_id = NEW.family_id AND role = 'CHILD' AND left_at IS NULL AND person_id <> NEW.person_id
    LOOP
      IF NEW.person_id < v_child_rec.person_id THEN
        v_p_a := NEW.person_id; v_p_b := v_child_rec.person_id;
      ELSE
        v_p_a := v_child_rec.person_id; v_p_b := NEW.person_id;
      END IF;

      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
      VALUES (v_p_a, v_p_b, 'SIBLING', 'VERIFIED', COALESCE(auth.uid(), v_creator_id))
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
    END LOOP;

  ELSIF NEW.role = 'PARENT' THEN
    -- Member is Parent of Head
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (NEW.person_id, v_head_person_id, 'PARENT', 'VERIFIED', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

  ELSIF NEW.role = 'SIBLING' THEN
    IF v_head_person_id < NEW.person_id THEN
      v_p_a := v_head_person_id; v_p_b := NEW.person_id;
    ELSE
      v_p_a := NEW.person_id; v_p_b := v_head_person_id;
    END IF;

    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (v_p_a, v_p_b, 'SIBLING', 'VERIFIED', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Cleanup any corrupt self-referencing relationships
UPDATE public.relationships
SET deleted_at = NOW(), updated_at = NOW()
WHERE person_a_id = person_b_id AND deleted_at IS NULL;

-- 3. Canonical Repair for Vyas Family (9 members, 15 canonical edges)
DO $$
DECLARE
  v_vyas_family_id UUID;
  v_admin_id UUID;
  v_ck_id UUID;
  v_dv_id UUID;
  v_tushar_id UUID;
  v_maya_id UUID;
  v_jayesh_id UUID;
  v_jignasha_id UUID;
  v_harsh_id UUID;
  v_vraj_id UUID;
  v_dhruv_id UUID;

  PROCEDURE link_spouse(p1 UUID, p2 UUID, c_by UUID) AS $proc$
  DECLARE
    a UUID;
    b UUID;
  BEGIN
    IF p1 IS NULL OR p2 IS NULL THEN RETURN; END IF;
    IF p1 < p2 THEN a := p1; b := p2; ELSE a := p2; b := p1; END IF;
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (a, b, 'SPOUSE', 'VERIFIED', c_by)
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL
    DO UPDATE SET verification_status = 'VERIFIED', updated_at = NOW();
  END;
  $proc$;

  PROCEDURE link_parent(p UUID, c UUID, c_by UUID) AS $proc$
  BEGIN
    IF p IS NULL OR c IS NULL THEN RETURN; END IF;
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (p, c, 'PARENT', 'VERIFIED', c_by)
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL
    DO UPDATE SET verification_status = 'VERIFIED', updated_at = NOW();
  END;
  $proc$;

  PROCEDURE link_sibling(p1 UUID, p2 UUID, c_by UUID) AS $proc$
  DECLARE
    a UUID;
    b UUID;
  BEGIN
    IF p1 IS NULL OR p2 IS NULL THEN RETURN; END IF;
    IF p1 < p2 THEN a := p1; b := p2; ELSE a := p2; b := p1; END IF;
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (a, b, 'SIBLING', 'VERIFIED', c_by)
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL
    DO UPDATE SET verification_status = 'VERIFIED', updated_at = NOW();
  END;
  $proc$;

BEGIN
  -- Find Vyas Family
  SELECT id, created_by INTO v_vyas_family_id, v_admin_id
  FROM public.families
  WHERE lower(trim(family_name)) = 'vyas family' OR lower(family_name) LIKE '%vyas%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_vyas_family_id IS NOT NULL THEN
    -- Locate all 9 members by first name and family
    SELECT p.id INTO v_ck_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'chandra%' LIMIT 1;

    SELECT p.id INTO v_dv_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'devi%' LIMIT 1;

    SELECT p.id INTO v_tushar_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'tushar%' LIMIT 1;

    SELECT p.id INTO v_maya_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'maya%' LIMIT 1;

    SELECT p.id INTO v_jayesh_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'jayesh%' LIMIT 1;

    SELECT p.id INTO v_jignasha_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'jigna%' LIMIT 1;

    SELECT p.id INTO v_harsh_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'harsh%' LIMIT 1;

    SELECT p.id INTO v_vraj_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'vraj%' LIMIT 1;

    SELECT p.id INTO v_dhruv_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'dhruv%' LIMIT 1;

    -- Ensure Jayesh is designated Head of Family
    IF v_jayesh_id IS NOT NULL THEN
      UPDATE public.family_members
      SET is_head = (person_id = v_jayesh_id),
          updated_at = NOW()
      WHERE family_id = v_vyas_family_id;
    END IF;

    -- Ensure Grandparents are marked DECEASED
    IF v_ck_id IS NOT NULL THEN
      UPDATE public.persons SET status = 'DECEASED' WHERE id = v_ck_id;
    END IF;
    IF v_dv_id IS NOT NULL THEN
      UPDATE public.persons SET status = 'DECEASED' WHERE id = v_dv_id;
    END IF;

    -- Seed / Verify the 15 canonical edges
    CALL link_spouse(v_ck_id, v_dv_id, v_admin_id);
    CALL link_parent(v_ck_id, v_tushar_id, v_admin_id);
    CALL link_parent(v_dv_id, v_tushar_id, v_admin_id);
    CALL link_parent(v_ck_id, v_jayesh_id, v_admin_id);
    CALL link_parent(v_dv_id, v_jayesh_id, v_admin_id);
    CALL link_sibling(v_tushar_id, v_jayesh_id, v_admin_id);
    CALL link_spouse(v_tushar_id, v_maya_id, v_admin_id);
    CALL link_parent(v_tushar_id, v_harsh_id, v_admin_id);
    CALL link_parent(v_maya_id, v_harsh_id, v_admin_id);
    CALL link_spouse(v_jayesh_id, v_jignasha_id, v_admin_id);
    CALL link_parent(v_jayesh_id, v_vraj_id, v_admin_id);
    CALL link_parent(v_jignasha_id, v_vraj_id, v_admin_id);
    CALL link_parent(v_jayesh_id, v_dhruv_id, v_admin_id);
    CALL link_parent(v_jignasha_id, v_dhruv_id, v_admin_id);
    CALL link_sibling(v_vraj_id, v_dhruv_id, v_admin_id);
  END IF;
END;
$$;

COMMIT;
