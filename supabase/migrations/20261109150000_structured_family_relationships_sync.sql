-- =============================================================================
-- Migration: 20261109150000_structured_family_relationships_sync.sql
-- Purpose:
--   1. Structured Interpersonal Family Relationships Synchronization:
--      - Explicit reference person support for all family relationships.
--      - In-law and connecting spouse resolution (e.g. Maya is spouse of Tushar;
--        Tushar is brother of Head Jayesh; Maya is Sister-in-law).
--      - Sibling parentage inheritance (siblings share identical parents).
--      - Dual-parent linking (children are linked to both parents).
--   2. Authoritative RPC public.save_member_structured_relationship:
--      - Parameters: p_family_id, p_member_id, p_role, p_relationship_to_head,
--        p_is_head, p_reference_person_id, p_connected_person_id
--   3. Authoritative Repair & Verification for Vyas Family (all 9 members).
-- =============================================================================

BEGIN;

-- 1. Helper function for canonical relationship upsert
CREATE OR REPLACE FUNCTION public.upsert_relationship_edge(
  p_person_a UUID,
  p_person_b UUID,
  p_type public.relationship_type,
  p_created_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_first UUID;
  v_second UUID;
BEGIN
  IF p_person_a IS NULL OR p_person_b IS NULL OR p_person_a = p_person_b THEN
    RETURN;
  END IF;

  IF p_type = 'PARENT' THEN
    -- PARENT is directional: person_a is parent, person_b is child
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (p_person_a, p_person_b, 'PARENT', 'VERIFIED', p_created_by)
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL
    DO UPDATE SET verification_status = 'VERIFIED', updated_at = NOW();
  ELSE
    -- SPOUSE and SIBLING are symmetric: person_a < person_b
    IF p_person_a < p_person_b THEN
      v_first := p_person_a;
      v_second := p_person_b;
    ELSE
      v_first := p_person_b;
      v_second := p_person_a;
    END IF;

    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, verification_status, created_by)
    VALUES (v_first, v_second, p_type, 'VERIFIED', p_created_by)
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL
    DO UPDATE SET verification_status = 'VERIFIED', updated_at = NOW();
  END IF;
END;
$$;

-- 2. Server RPC: save_member_structured_relationship
CREATE OR REPLACE FUNCTION public.save_member_structured_relationship(
  p_family_id UUID,
  p_member_id UUID,
  p_role TEXT,
  p_relationship_to_head TEXT,
  p_is_head BOOLEAN,
  p_reference_person_id UUID DEFAULT NULL,
  p_connected_person_id UUID DEFAULT NULL
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
  v_target_person_id UUID;
  v_head_person_id UUID;
  v_ref_person_id UUID;
  v_conn_person_id UUID := p_connected_person_id;
  v_caller UUID := auth.uid();
  v_creator_id UUID;
  v_can_manage BOOLEAN := false;
  v_parent_id UUID;
  v_child_rec RECORD;
  v_sib_rec RECORD;
  v_rel_lower TEXT := LOWER(COALESCE(p_relationship_to_head, ''));
  v_role_upper TEXT := UPPER(COALESCE(p_role, ''));
BEGIN
  -- 1. Locate the family_members record by id or person_id
  SELECT * INTO v_member_row
  FROM public.family_members fm
  WHERE fm.id = p_member_id;

  IF v_member_row.id IS NULL THEN
    SELECT * INTO v_member_row
    FROM public.family_members fm
    WHERE fm.person_id = p_member_id
      AND (p_family_id IS NULL OR fm.family_id = p_family_id)
      AND fm.left_at IS NULL
    LIMIT 1;
  END IF;

  IF v_member_row.id IS NULL THEN
    RAISE EXCEPTION 'Family member record not found.' USING ERRCODE = 'P0002';
  END IF;

  v_actual_id := v_member_row.id;
  v_family_id := v_member_row.family_id;
  v_target_person_id := v_member_row.person_id;

  -- 2. Authorization check
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

  SELECT created_by INTO v_creator_id FROM public.families WHERE id = v_family_id;

  -- 3. Resolve head person
  SELECT person_id INTO v_head_person_id
  FROM public.family_members
  WHERE family_id = v_family_id AND is_head = TRUE AND left_at IS NULL
  LIMIT 1;

  -- If promoting this member to Head of Family, demote any other existing head
  IF p_is_head IS TRUE THEN
    UPDATE public.family_members
    SET is_head = FALSE
    WHERE family_id = v_family_id
      AND id <> v_actual_id
      AND is_head = TRUE;
    v_head_person_id := v_target_person_id;
  END IF;

  -- 4. Apply updates to family_members table
  UPDATE public.family_members
  SET
    relationship_to_head = COALESCE(p_relationship_to_head, relationship_to_head),
    is_head = COALESCE(p_is_head, is_head),
    updated_at = NOW()
  WHERE id = v_actual_id;

  IF p_role IS NOT NULL THEN
    BEGIN
      UPDATE public.family_members SET role = p_role::public.family_role WHERE id = v_actual_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- 5. Establish structured person-to-person relationships
  v_ref_person_id := COALESCE(p_reference_person_id, v_head_person_id);

  -- Case A: SIBLING (Brother, Sister, Sibling)
  IF v_role_upper = 'SIBLING' OR v_rel_lower ~ 'brother|sister|sibling|भाई|बहन' THEN
    IF v_ref_person_id IS NOT NULL AND v_ref_person_id <> v_target_person_id THEN
      PERFORM public.upsert_relationship_edge(v_target_person_id, v_ref_person_id, 'SIBLING', COALESCE(v_caller, v_creator_id));

      -- Sibling parents inheritance: link parents of ref person to target person
      FOR v_parent_id IN
        SELECT person_a_id FROM public.relationships
        WHERE person_b_id = v_ref_person_id AND relationship_type = 'PARENT' AND deleted_at IS NULL
      LOOP
        PERFORM public.upsert_relationship_edge(v_parent_id, v_target_person_id, 'PARENT', COALESCE(v_caller, v_creator_id));
      END LOOP;

      -- Vice versa: if target person has parents, link to ref person
      FOR v_parent_id IN
        SELECT person_a_id FROM public.relationships
        WHERE person_b_id = v_target_person_id AND relationship_type = 'PARENT' AND deleted_at IS NULL
      LOOP
        PERFORM public.upsert_relationship_edge(v_parent_id, v_ref_person_id, 'PARENT', COALESCE(v_caller, v_creator_id));
      END LOOP;
    END IF;

  -- Case B: IN-LAWS (Sister-in-law / भाभी / साली / जेठानी / देवरानी, Brother-in-law / साला / बहनोई / देवर / जेठ)
  ELSIF v_rel_lower ~ 'sister-in-law|brother-in-law|भाभी|साली|ननद|जेठानी|देवरानी|साला|बहनोई|देवर|जेठ' THEN
    -- If connected spouse person was not explicitly provided, find candidate sibling in family
    IF v_conn_person_id IS NULL THEN
      IF v_rel_lower ~ 'sister-in-law|भाभी|जेठानी|देवरानी' THEN
        -- Maya is sister-in-law; find brother of head in family
        SELECT fm.person_id INTO v_conn_person_id
        FROM public.family_members fm
        WHERE fm.family_id = v_family_id
          AND fm.person_id <> v_target_person_id
          AND fm.person_id <> v_ref_person_id
          AND (fm.role = 'SIBLING' OR LOWER(fm.relationship_to_head) ~ 'brother|भाई')
          AND fm.left_at IS NULL
        LIMIT 1;
      ELSE
        -- Brother-in-law; find sister of head in family
        SELECT fm.person_id INTO v_conn_person_id
        FROM public.family_members fm
        WHERE fm.family_id = v_family_id
          AND fm.person_id <> v_target_person_id
          AND fm.person_id <> v_ref_person_id
          AND (fm.role = 'SIBLING' OR LOWER(fm.relationship_to_head) ~ 'sister|बहन')
          AND fm.left_at IS NULL
        LIMIT 1;
      END IF;
    END IF;

    -- If connecting spouse was identified, link as SPOUSE
    IF v_conn_person_id IS NOT NULL AND v_conn_person_id <> v_target_person_id THEN
      PERFORM public.upsert_relationship_edge(v_target_person_id, v_conn_person_id, 'SPOUSE', COALESCE(v_caller, v_creator_id));
      -- Ensure connecting spouse is linked as SIBLING to head
      IF v_ref_person_id IS NOT NULL AND v_ref_person_id <> v_conn_person_id THEN
        PERFORM public.upsert_relationship_edge(v_conn_person_id, v_ref_person_id, 'SIBLING', COALESCE(v_caller, v_creator_id));
      END IF;
    END IF;

  -- Case C: SPOUSE (Husband, Wife, Spouse)
  ELSIF v_role_upper = 'SPOUSE' OR v_rel_lower ~ 'wife|husband|spouse|पत्नी|पति|जीवनसाथी' THEN
    v_conn_person_id := COALESCE(v_conn_person_id, v_ref_person_id);
    IF v_conn_person_id IS NOT NULL AND v_conn_person_id <> v_target_person_id THEN
      PERFORM public.upsert_relationship_edge(v_target_person_id, v_conn_person_id, 'SPOUSE', COALESCE(v_caller, v_creator_id));

      -- Link this spouse as PARENT to existing children of the other spouse
      FOR v_child_rec IN
        SELECT person_b_id AS child_id FROM public.relationships
        WHERE person_a_id = v_conn_person_id AND relationship_type = 'PARENT' AND deleted_at IS NULL
      LOOP
        PERFORM public.upsert_relationship_edge(v_target_person_id, v_child_rec.child_id, 'PARENT', COALESCE(v_caller, v_creator_id));
      END LOOP;
    END IF;

  -- Case D: PARENT (Father, Mother, Parent)
  ELSIF v_role_upper = 'PARENT' OR v_rel_lower ~ 'father|mother|parent|पिता|माता' THEN
    IF v_ref_person_id IS NOT NULL AND v_ref_person_id <> v_target_person_id THEN
      PERFORM public.upsert_relationship_edge(v_target_person_id, v_ref_person_id, 'PARENT', COALESCE(v_caller, v_creator_id));

      -- Also link to siblings of ref person in this family
      FOR v_sib_rec IN
        SELECT person_b_id AS sib_id FROM public.relationships
        WHERE person_a_id = v_ref_person_id AND relationship_type = 'SIBLING' AND deleted_at IS NULL
        UNION
        SELECT person_a_id AS sib_id FROM public.relationships
        WHERE person_b_id = v_ref_person_id AND relationship_type = 'SIBLING' AND deleted_at IS NULL
      LOOP
        PERFORM public.upsert_relationship_edge(v_target_person_id, v_sib_rec.sib_id, 'PARENT', COALESCE(v_caller, v_creator_id));
      END LOOP;
    END IF;

  -- Case E: CHILD (Son, Daughter, Child)
  ELSIF v_role_upper = 'CHILD' OR v_rel_lower ~ 'son|daughter|child|बेटा|बेटी|संतान' THEN
    v_conn_person_id := COALESCE(v_conn_person_id, v_ref_person_id);
    IF v_conn_person_id IS NOT NULL AND v_conn_person_id <> v_target_person_id THEN
      PERFORM public.upsert_relationship_edge(v_conn_person_id, v_target_person_id, 'PARENT', COALESCE(v_caller, v_creator_id));

      -- If parent has a spouse, link spouse as PARENT too
      FOR v_parent_id IN
        SELECT person_b_id AS sp_id FROM public.relationships
        WHERE person_a_id = v_conn_person_id AND relationship_type = 'SPOUSE' AND deleted_at IS NULL
        UNION
        SELECT person_a_id AS sp_id FROM public.relationships
        WHERE person_b_id = v_conn_person_id AND relationship_type = 'SPOUSE' AND deleted_at IS NULL
      LOOP
        PERFORM public.upsert_relationship_edge(v_parent_id, v_target_person_id, 'PARENT', COALESCE(v_caller, v_creator_id));
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_actual_id,
    'person_id', v_target_person_id,
    'family_id', v_family_id,
    'relationship_to_head', p_relationship_to_head,
    'role', p_role,
    'is_head', p_is_head
  );
END;
$$;

-- 3. Canonical Repair & Verification for Vyas Family
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
BEGIN
  -- Locate Vyas Family
  SELECT id, created_by INTO v_vyas_family_id, v_admin_id
  FROM public.families
  WHERE lower(trim(family_name)) = 'vyas family' OR lower(family_name) LIKE '%vyas%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_vyas_family_id IS NOT NULL THEN
    -- Match all 9 persons
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

    -- Ensure Jayesh is head
    IF v_jayesh_id IS NOT NULL THEN
      UPDATE public.family_members
      SET is_head = (person_id = v_jayesh_id),
          updated_at = NOW()
      WHERE family_id = v_vyas_family_id;
    END IF;

    -- Mark Grandparents DECEASED
    IF v_ck_id IS NOT NULL THEN
      UPDATE public.persons SET status = 'DECEASED' WHERE id = v_ck_id;
    END IF;
    IF v_dv_id IS NOT NULL THEN
      UPDATE public.persons SET status = 'DECEASED' WHERE id = v_dv_id;
    END IF;

    -- Set exact English + Hindi relationship labels on family_members
    IF v_ck_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'PARENT', relationship_to_head = 'Father (पिता)'
      WHERE family_id = v_vyas_family_id AND person_id = v_ck_id;
    END IF;

    IF v_dv_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'PARENT', relationship_to_head = 'Mother (माता)'
      WHERE family_id = v_vyas_family_id AND person_id = v_dv_id;
    END IF;

    IF v_tushar_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'SIBLING', relationship_to_head = 'Brother (भाई)'
      WHERE family_id = v_vyas_family_id AND person_id = v_tushar_id;
    END IF;

    IF v_maya_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'EXTENDED', relationship_to_head = 'Sister-in-law (साली / ननद / भाभी / जेठानी / देवरानी)'
      WHERE family_id = v_vyas_family_id AND person_id = v_maya_id;
    END IF;

    IF v_jayesh_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'HEAD', relationship_to_head = 'Head of Family'
      WHERE family_id = v_vyas_family_id AND person_id = v_jayesh_id;
    END IF;

    IF v_jignasha_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'SPOUSE', relationship_to_head = 'Wife (पत्नी)'
      WHERE family_id = v_vyas_family_id AND person_id = v_jignasha_id;
    END IF;

    IF v_harsh_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'CHILD', relationship_to_head = 'Nephew (भतीजा / भांजा)'
      WHERE family_id = v_vyas_family_id AND person_id = v_harsh_id;
    END IF;

    IF v_vraj_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'CHILD', relationship_to_head = 'Son (बेटा)'
      WHERE family_id = v_vyas_family_id AND person_id = v_vraj_id;
    END IF;

    IF v_dhruv_id IS NOT NULL THEN
      UPDATE public.family_members SET role = 'CHILD', relationship_to_head = 'Son (बेटा)'
      WHERE family_id = v_vyas_family_id AND person_id = v_dhruv_id;
    END IF;

    -- Canonical Interpersonal Edges:
    -- 1. Grandparents couple
    PERFORM public.upsert_relationship_edge(v_ck_id, v_dv_id, 'SPOUSE', v_admin_id);

    -- 2. Parents to Tushar
    PERFORM public.upsert_relationship_edge(v_ck_id, v_tushar_id, 'PARENT', v_admin_id);
    PERFORM public.upsert_relationship_edge(v_dv_id, v_tushar_id, 'PARENT', v_admin_id);

    -- 3. Parents to Jayesh
    PERFORM public.upsert_relationship_edge(v_ck_id, v_jayesh_id, 'PARENT', v_admin_id);
    PERFORM public.upsert_relationship_edge(v_dv_id, v_jayesh_id, 'PARENT', v_admin_id);

    -- 4. Brothers
    PERFORM public.upsert_relationship_edge(v_tushar_id, v_jayesh_id, 'SIBLING', v_admin_id);

    -- 5. Branch 1 couple (Tushar + Maya)
    PERFORM public.upsert_relationship_edge(v_tushar_id, v_maya_id, 'SPOUSE', v_admin_id);

    -- 6. Branch 1 parents to Harsh
    PERFORM public.upsert_relationship_edge(v_tushar_id, v_harsh_id, 'PARENT', v_admin_id);
    PERFORM public.upsert_relationship_edge(v_maya_id, v_harsh_id, 'PARENT', v_admin_id);

    -- 7. Branch 2 couple (Jayesh + Jignasha)
    PERFORM public.upsert_relationship_edge(v_jayesh_id, v_jignasha_id, 'SPOUSE', v_admin_id);

    -- 8. Branch 2 parents to Vraj and Dhruv
    PERFORM public.upsert_relationship_edge(v_jayesh_id, v_vraj_id, 'PARENT', v_admin_id);
    PERFORM public.upsert_relationship_edge(v_jignasha_id, v_vraj_id, 'PARENT', v_admin_id);
    PERFORM public.upsert_relationship_edge(v_jayesh_id, v_dhruv_id, 'PARENT', v_admin_id);
    PERFORM public.upsert_relationship_edge(v_jignasha_id, v_dhruv_id, 'PARENT', v_admin_id);

    -- 9. Sons siblings
    PERFORM public.upsert_relationship_edge(v_vraj_id, v_dhruv_id, 'SIBLING', v_admin_id);
  END IF;
END;
$$;

COMMIT;
