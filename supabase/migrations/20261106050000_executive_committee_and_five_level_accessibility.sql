-- =============================================================================
-- Migration: 20261106050000_executive_committee_and_five_level_accessibility.sql
-- Description: 
--   1. Expand font_size_preference to 5-level accessibility scale
--      (SMALL, STANDARD, LARGE, EXTRA_LARGE, VERY_LARGE)
--   2. Update update_my_font_size_preference RPC
--   3. Ensure executive_committee_members table and 31 official records exist
--   4. Ensure anon read access on executive_committee_members
--   5. Add admin_upsert_committee_member and admin_toggle_committee_member_status RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Five-Level Accessibility Slider Database Support
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ALTER COLUMN font_size_preference TYPE VARCHAR(20);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_font_size_preference_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_font_size_preference_check
  CHECK (font_size_preference IN ('SMALL', 'STANDARD', 'DEFAULT', 'LARGE', 'EXTRA_LARGE', 'VERY_LARGE'));

DROP FUNCTION IF EXISTS public.update_my_font_size_preference(VARCHAR);

CREATE OR REPLACE FUNCTION public.update_my_font_size_preference(p_font_size VARCHAR(20))
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_font_size NOT IN ('SMALL', 'STANDARD', 'DEFAULT', 'LARGE', 'EXTRA_LARGE', 'VERY_LARGE') THEN
    RAISE EXCEPTION 'Invalid font size preference: %', p_font_size;
  END IF;

  UPDATE public.profiles
  SET font_size_preference = p_font_size,
      updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_font_size_preference(VARCHAR) TO authenticated;

COMMENT ON FUNCTION public.update_my_font_size_preference(VARCHAR) IS
  'Updates authenticated user font size preference across the 5 accessibility levels.';

-- -----------------------------------------------------------------------------
-- 2. Official Executive Committee Register (31 members) Schema & Seed Assurance
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

CREATE INDEX IF NOT EXISTS idx_exec_comm_serial ON public.executive_committee_members(serial_number);
CREATE INDEX IF NOT EXISTS idx_exec_comm_city ON public.executive_committee_members(city);
CREATE INDEX IF NOT EXISTS idx_exec_comm_designation ON public.executive_committee_members(designation);

ALTER TABLE public.executive_committee_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'executive_committee_members' 
      AND policyname = 'exec_comm_select_authenticated'
  ) THEN
    CREATE POLICY "exec_comm_select_authenticated" 
    ON public.executive_committee_members 
    FOR SELECT TO authenticated 
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'executive_committee_members' 
      AND policyname = 'exec_comm_select_anon'
  ) THEN
    CREATE POLICY "exec_comm_select_anon" 
    ON public.executive_committee_members 
    FOR SELECT TO anon 
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'executive_committee_members' 
      AND policyname = 'exec_comm_admin_all'
  ) THEN
    CREATE POLICY "exec_comm_admin_all" 
    ON public.executive_committee_members 
    FOR ALL TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());
  END IF;
END $$;

GRANT SELECT ON public.executive_committee_members TO authenticated, anon;
GRANT ALL ON public.executive_committee_members TO service_role;

-- Seed the canonical 31 members idempotently
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
ON CONFLICT (serial_number) DO UPDATE
SET
  designation = EXCLUDED.designation,
  full_name = EXCLUDED.full_name,
  nukh = EXCLUDED.nukh,
  city = EXCLUDED.city,
  mobile_number = EXCLUDED.mobile_number,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 3. Executive Committee Admin RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_upsert_committee_member(
  p_id UUID DEFAULT NULL,
  p_serial_number INTEGER DEFAULT NULL,
  p_designation TEXT DEFAULT 'Member',
  p_full_name TEXT DEFAULT '',
  p_nukh TEXT DEFAULT '',
  p_city TEXT DEFAULT '',
  p_mobile_number TEXT DEFAULT '',
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS public.executive_committee_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member public.executive_committee_members;
  v_serial INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only ADMIN or SUPER_ADMIN can manage executive committee members';
  END IF;

  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Full name is mandatory';
  END IF;

  IF p_id IS NOT NULL THEN
    -- Update existing member
    UPDATE public.executive_committee_members
    SET
      serial_number = COALESCE(p_serial_number, serial_number),
      designation = trim(p_designation),
      full_name = trim(p_full_name),
      nukh = trim(p_nukh),
      city = trim(p_city),
      mobile_number = trim(p_mobile_number),
      is_active = p_is_active,
      updated_at = NOW()
    WHERE id = p_id
    RETURNING * INTO v_member;
  ELSE
    -- Insert new member
    IF p_serial_number IS NULL THEN
      SELECT COALESCE(MAX(serial_number), 0) + 1 INTO v_serial FROM public.executive_committee_members;
    ELSE
      v_serial := p_serial_number;
    END IF;

    INSERT INTO public.executive_committee_members (
      serial_number,
      designation,
      full_name,
      nukh,
      city,
      mobile_number,
      is_active
    ) VALUES (
      v_serial,
      trim(p_designation),
      trim(p_full_name),
      trim(p_nukh),
      trim(p_city),
      trim(p_mobile_number),
      p_is_active
    )
    RETURNING * INTO v_member;
  END IF;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_committee_member TO authenticated;

COMMENT ON FUNCTION public.admin_upsert_committee_member IS
  'Admin-only RPC to create or update an official Executive Committee record.';

CREATE OR REPLACE FUNCTION public.admin_toggle_committee_member_status(
  p_id UUID,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only ADMIN or SUPER_ADMIN can manage executive committee members';
  END IF;

  UPDATE public.executive_committee_members
  SET is_active = p_is_active,
      updated_at = NOW()
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_committee_member_status TO authenticated;

COMMENT ON FUNCTION public.admin_toggle_committee_member_status IS
  'Admin-only RPC to toggle active status of an Executive Committee record.';
