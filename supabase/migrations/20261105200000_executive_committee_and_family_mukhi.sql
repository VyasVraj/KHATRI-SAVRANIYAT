-- =============================================================================
-- Migration: 20261105200000_executive_committee_and_family_mukhi.sql
-- Description: Official Executive Committee Directory (31 members from Register)
--              and family-wise Mukhi selection.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table: public.executive_committee_members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.executive_committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number INTEGER NOT NULL UNIQUE,
  designation TEXT NOT NULL,
  full_name TEXT NOT NULL,
  nukh TEXT NOT NULL,
  city TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  linked_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.executive_committee_members IS
  'Official 31-member Executive Committee Register (Karyakarini) of Shree Khatri Samaj.';

CREATE INDEX IF NOT EXISTS idx_exec_comm_serial ON public.executive_committee_members(serial_number);
CREATE INDEX IF NOT EXISTS idx_exec_comm_city ON public.executive_committee_members(city);
CREATE INDEX IF NOT EXISTS idx_exec_comm_designation ON public.executive_committee_members(designation);

-- -----------------------------------------------------------------------------
-- 2. Row-Level Security for public.executive_committee_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.executive_committee_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exec_comm_select_authenticated" ON public.executive_committee_members;
CREATE POLICY "exec_comm_select_authenticated"
  ON public.executive_committee_members
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "exec_comm_admin_all" ON public.executive_committee_members;
CREATE POLICY "exec_comm_admin_all"
  ON public.executive_committee_members
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.executive_committee_members TO authenticated;
GRANT ALL ON public.executive_committee_members TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Add selected_mukhi_id to public.families
-- -----------------------------------------------------------------------------
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS selected_mukhi_id UUID REFERENCES public.executive_committee_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_families_selected_mukhi_id
  ON public.families(selected_mukhi_id);

COMMENT ON COLUMN public.families.selected_mukhi_id IS
  'Official Executive Committee Mukhi representative designated by the Family Head for this family.';

-- -----------------------------------------------------------------------------
-- 4. Update create_family_with_head RPC to accept p_selected_mukhi_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_members_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_existing_person_id UUID DEFAULT NULL,
  p_new_person_first_name TEXT DEFAULT NULL,
  p_new_person_middle_name TEXT DEFAULT NULL,
  p_new_person_last_name TEXT DEFAULT NULL,
  p_new_person_maiden_name TEXT DEFAULT NULL,
  p_new_person_gender public.gender DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL,
  p_selected_mukhi_id UUID DEFAULT NULL
)
RETURNS TABLE (
  family_id UUID,
  head_person_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF trim(p_family_name) = '' THEN
    RAISE EXCEPTION 'Family name cannot be empty.' USING ERRCODE = '22023';
  END IF;

  -- 1. Create or resolve the head person
  IF p_existing_person_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_existing_person_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Specified head person does not exist.' USING ERRCODE = 'P0002';
    END IF;
    v_head_person_id := p_existing_person_id;
  ELSE
    IF p_new_person_first_name IS NULL OR trim(p_new_person_first_name) = '' OR
       p_new_person_last_name IS NULL OR trim(p_new_person_last_name) = '' THEN
      RAISE EXCEPTION 'First name and last name are required for new family head.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      birth_place,
      gotra,
      nukh,
      created_by
    )
    VALUES (
      trim(p_new_person_first_name),
      p_new_person_middle_name,
      trim(p_new_person_last_name),
      p_new_person_maiden_name,
      COALESCE(p_new_person_gender, 'MALE'::public.gender),
      p_new_person_dob,
      p_new_person_birth_place,
      p_gotra,
      p_nukh,
      v_caller_id
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 2. Create the family record with selected_mukhi_id
  INSERT INTO public.families (
    family_name,
    city,
    state,
    country,
    description,
    gotra,
    nukh,
    profile_privacy,
    members_privacy,
    created_by,
    manager_user_id,
    selected_mukhi_id
  )
  VALUES (
    trim(p_family_name),
    p_city,
    p_state,
    p_country,
    p_description,
    p_gotra,
    p_nukh,
    COALESCE(p_profile_privacy, 'COMMUNITY'::public.privacy_level),
    COALESCE(p_members_privacy, 'COMMUNITY'::public.privacy_level),
    v_caller_id,
    v_caller_id,
    p_selected_mukhi_id
  )
  RETURNING id INTO v_family_id;

  -- 3. Add the head person to family_members
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    added_by
  )
  VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    v_caller_id
  );

  RETURN QUERY SELECT v_family_id, v_head_person_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.privacy_level, public.privacy_level, UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT, UUID
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Seed the 31 Official Executive Committee Members from Official Register
-- -----------------------------------------------------------------------------
INSERT INTO public.executive_committee_members (serial_number, designation, full_name, nukh, city, mobile_number, is_active)
VALUES
  (1, 'President', 'Shri Vasant Kumar Jamnadas Pamnani', 'Karatela', 'Bhavnagar', '9033361661', TRUE),
  (2, 'Vice President', 'Shri Yudhishthir Kevalram', 'Soneja', 'Ujjain', '9425332249', TRUE),
  (3, 'Vice President', 'Shri Balkishan Gobindram', 'Dhandha', 'Pushkar', '9414300034', TRUE),
  (4, 'Vice President', 'Smt. Heeradevi Basant Kumar', 'Khuha', 'Ujjain', '9977824443', TRUE),
  (5, 'General Secretary', 'Mukhi Ghanshyamdas Hemandas', 'Kapoor', 'Bantva', '9909972633', TRUE),
  (6, 'Secretary', 'Mukhi Jeevatram Gehimal', 'Keeri', 'Jetpur', '9426930441', TRUE),
  (7, 'Treasurer', 'Shri Chandiram Jethanand', 'Khuha', 'Jaipur', '9314513167', TRUE),
  (8, 'Organization Secretary', 'Mukhi Ghanshyamdas Kalloomal', 'Hargun', 'Ulhasnagar', '7066706525', TRUE),
  (9, 'Member', 'Shri Bhojraj Bhai Mirchumal', 'Chhatpar', 'Deesa', '9426360264', TRUE),
  (10, 'Member', 'Shri Chandra Prakash Veermal', 'Keeri', 'Ujjain', '9827397575', TRUE),
  (11, 'Member', 'Shri Bherumal Nathumal', 'Somesar', 'Deoli', '9413860511', TRUE),
  (12, 'Member', 'Shri Harish Kumar Chainmal', 'Acharya', 'Jaipur', '9414366681', TRUE),
  (13, 'Member', 'Mukhi Gobindram Jethalal Janiyani', 'Khuha', 'Rajkot', '9879548959', TRUE),
  (14, 'Member', 'Shri Mahesh Kumar Mohanlal', 'Varde', 'Beawar', '9829127009', TRUE),
  (15, 'Member', 'Shri Dharmendra Ishwardas', 'Khuha', 'Jaipur', '9772891560', TRUE),
  (16, 'Member', 'Shri Bharat Dulhanomal', 'Dhandha', 'Rajkot', '9328707428', TRUE),
  (17, 'Member', 'Shri Vijay Kumar Utumal', 'Hargun', 'Jetpur', '9925928848', TRUE),
  (18, 'Member', 'Shri Jaykishan Devidas', 'Khuha', 'Varanasi', '9415303951', TRUE),
  (19, 'Member', 'Shri Harish Kumar Narumal', 'Dagiya', 'Ajmer', '9829732242', TRUE),
  (20, 'Member', 'Shri Prakash Bhai (Pintu) Mandharam', 'Saraya', 'Surat', '9925314000', TRUE),
  (21, 'Member', 'Shri Khemchand Umarnomal', 'Madhu', 'Vadodara', '9998178985', TRUE),
  (22, 'Member', 'Mukhi Umesh Kumar Jashanmal', 'Dagiya', 'Hyderabad', '9849474375', TRUE),
  (23, 'Member', 'Shri Khemchand Tarachand', 'Dagiya', 'Una', '9898145664', TRUE),
  (24, 'Member', 'Shri Raju Bhai Atmaram', 'Dode', 'Rajkot', '9428349832', TRUE),
  (25, 'Member', 'Shri Narayandas Vasantmal', 'Leea', 'Delhi', '8130148778', TRUE),
  (26, 'Member', 'Shri Gobindram (Gopichand) Khushaldas', 'Dhabadiya', 'Sri Ganganagar', '6377671713', TRUE),
  (27, 'Member', 'Smt. Dhanwanti Ben Dayaram', 'Makdiya', 'Jetpur', '7779080704', TRUE),
  (28, 'Member', 'Smt. Radha Ben Naresh Kumar', 'Madhu', 'Jaipur', '9928350278', TRUE),
  (29, 'Member', 'Smt. Deepika Ben Yashwant Bhai', 'Khuha', 'Deesa', '9409393990', TRUE),
  (30, 'Member', 'Smt. Kanchan Ben Dilip Kumar', 'Chhatpar', 'Jaipur', '9119291086', TRUE),
  (31, 'Member', 'Smt. Jyoti Ben Ashok Kumar', 'Dhandha', 'Jaipur', '9024193441', TRUE)
ON CONFLICT (serial_number) DO UPDATE SET
  designation = EXCLUDED.designation,
  full_name = EXCLUDED.full_name,
  nukh = EXCLUDED.nukh,
  city = EXCLUDED.city,
  mobile_number = EXCLUDED.mobile_number,
  is_active = EXCLUDED.is_active;
