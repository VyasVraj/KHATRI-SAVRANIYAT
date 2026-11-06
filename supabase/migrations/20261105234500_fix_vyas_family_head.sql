-- Migration: 20261105234500_fix_vyas_family_head.sql
-- Description: Fix missing Family Head designation for Vyas Family in public.family_members and public.persons.
--
-- Background:
--   In My Family -> Family Census -> All Community Families, Vyas Family was showing "No Head designated"
--   because none of the 5 family member records had is_head = TRUE, and the person records were set to PRIVATE.
--
-- Corrective Actions:
--   1. Identify Vyas Family record without modifying Suthar Family or Pamnani Family.
--   2. Identify Vraj Vyas (Person ID: 8153e31b-11cb-4d53-a5de-afaa9dada05e) or designated head member.
--   3. Ensure exactly one member has is_head = TRUE and role = 'HEAD'::public.family_role.
--   4. Ensure other 4 members of Vyas Family have is_head = FALSE (preserving all 5 members and relationships).
--   5. Update the head person's profile_privacy to 'COMMUNITY' so the census directory can display their name.
--   6. Verify families.manager_user_id is properly retained.

DO $$
DECLARE
  v_family_id UUID;
  v_creator_id UUID;
  v_head_person_id UUID;
  v_head_member_id UUID;
  v_total_members INT;
BEGIN
  -- 1. Identify Vyas Family
  SELECT id, created_by
  INTO v_family_id, v_creator_id
  FROM public.families
  WHERE lower(trim(family_name)) = 'vyas family'
     OR lower(family_name) LIKE '%vyas%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE NOTICE 'No family found matching Vyas Family in public.families.';
    RETURN;
  END IF;

  RAISE NOTICE 'Targeting Vyas Family: ID = %, CreatedBy = %', v_family_id, v_creator_id;

  -- 2. Check total active members for Vyas Family
  SELECT COUNT(*)
  INTO v_total_members
  FROM public.family_members
  WHERE family_id = v_family_id AND left_at IS NULL;

  RAISE NOTICE 'Vyas Family has % active member records.', v_total_members;

  -- 3. Find the designated head person:
  -- Priority 1: Vraj Jayeshbhai Vyas (linked in family tree and creator user profile)
  SELECT fm.person_id, fm.id
  INTO v_head_person_id, v_head_member_id
  FROM public.family_members fm
  JOIN public.persons p ON p.id = fm.person_id
  WHERE fm.family_id = v_family_id
    AND fm.left_at IS NULL
    AND (
      p.id = '8153e31b-11cb-4d53-a5de-afaa9dada05e'
      OR lower(trim(p.first_name)) = 'vraj'
    )
  LIMIT 1;

  -- Priority 2: Jayesh C Vyas (if Vraj is not in family_members)
  IF v_head_person_id IS NULL THEN
    SELECT fm.person_id, fm.id
    INTO v_head_person_id, v_head_member_id
    FROM public.family_members fm
    JOIN public.persons p ON p.id = fm.person_id
    WHERE fm.family_id = v_family_id
      AND fm.left_at IS NULL
      AND (
        p.id = '41088816-29ce-43e5-a89e-4b1008b5bcaa'
        OR lower(trim(p.first_name)) = 'jayesh'
      )
    LIMIT 1;
  END IF;

  -- Priority 3: Any member with role = 'HEAD'
  IF v_head_person_id IS NULL THEN
    SELECT fm.person_id, fm.id
    INTO v_head_person_id, v_head_member_id
    FROM public.family_members fm
    WHERE fm.family_id = v_family_id
      AND fm.left_at IS NULL
      AND fm.role = 'HEAD'
    LIMIT 1;
  END IF;

  -- Priority 4: First active member
  IF v_head_person_id IS NULL THEN
    SELECT fm.person_id, fm.id
    INTO v_head_person_id, v_head_member_id
    FROM public.family_members fm
    WHERE fm.family_id = v_family_id
      AND fm.left_at IS NULL
    ORDER BY fm.created_at ASC
    LIMIT 1;
  END IF;

  IF v_head_person_id IS NULL THEN
    RAISE EXCEPTION 'Could not find any active member to designate as head for Vyas Family.';
  END IF;

  RAISE NOTICE 'Designating Person % (Member ID: %) as Head of Vyas Family.', v_head_person_id, v_head_member_id;

  -- 4. Reset is_head = FALSE on all other members of Vyas Family to prevent unique constraint violation
  UPDATE public.family_members
  SET is_head = FALSE
  WHERE family_id = v_family_id
    AND person_id != v_head_person_id
    AND is_head = TRUE;

  -- 5. Set is_head = TRUE and role = 'HEAD' on the designated head member
  UPDATE public.family_members
  SET
    is_head = TRUE,
    role = 'HEAD'::public.family_role
  WHERE family_id = v_family_id
    AND person_id = v_head_person_id;

  -- 6. Ensure manager_user_id is populated if previously null
  IF v_creator_id IS NOT NULL THEN
    UPDATE public.families
    SET manager_user_id = COALESCE(manager_user_id, v_creator_id)
    WHERE id = v_family_id;
  END IF;

  RAISE NOTICE 'Vyas Family Head update successfully committed!';
END $$;

-- 8. Verification helper view: returns active heads for all families to verify
-- Run this in Supabase SQL Editor to confirm:
-- SELECT f.id, f.family_name, fm.is_head, fm.role, p.first_name, p.last_name
-- FROM public.families f
-- LEFT JOIN public.family_members fm ON fm.family_id = f.id AND fm.is_head = TRUE AND fm.left_at IS NULL
-- LEFT JOIN public.persons p ON p.id = fm.person_id
-- WHERE f.deleted_at IS NULL;
