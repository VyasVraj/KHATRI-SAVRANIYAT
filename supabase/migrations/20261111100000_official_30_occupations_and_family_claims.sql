-- =============================================================================
-- Migration: 20261111100000_official_30_occupations_and_family_claims.sql
-- Purpose:
--   1. Centralized Occupations Master System:
--      - public.occupations master table with exact 30 PDF categories.
--      - Adds occupation column to public.persons with default 'Occupation Pending'.
--      - Updates validate_person_mandatory_fields_guard() to strictly require
--        an approved occupation from the 30 categories for new records.
--   2. Family Claim System:
--      - public.family_claims table with full audit trail.
--      - Adds claimed_by_user_id and claim_status to public.families.
--      - RPCs: submit_family_claim, approve_family_claim, reject_family_claim.
--      - RLS policies enforcing regional Mukhi scoping and Admin/Super Admin access.
--   3. Data Export Audit Logging:
--      - public.export_audit_logs table.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Occupations Master Table (Exact 30 Categories from PDF)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.occupations (
  id SERIAL PRIMARY KEY,
  occupation_code TEXT NOT NULL UNIQUE,
  occupation_name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the exact 30 categories from "30_Main_Occupation_Categories(2).pdf"
INSERT INTO public.occupations (display_order, occupation_code, occupation_name)
VALUES
  (1, 'AGRICULTURE', 'Agriculture'),
  (2, 'HEALTHCARE', 'Healthcare'),
  (3, 'EDUCATION', 'Education'),
  (4, 'ENGINEERING', 'Engineering'),
  (5, 'INFORMATION_TECHNOLOGY', 'Information Technology'),
  (6, 'SCIENCE_AND_RESEARCH', 'Science and Research'),
  (7, 'BUSINESS_AND_ENTREPRENEURSHIP', 'Business and Entrepreneurship'),
  (8, 'FINANCE_AND_BANKING', 'Finance and Banking'),
  (9, 'LAW_AND_LEGAL_SERVICES', 'Law and Legal Services'),
  (10, 'GOVERNMENT_SERVICES', 'Government Services'),
  (11, 'DEFENCE_AND_MILITARY', 'Defence and Military'),
  (12, 'POLICE_AND_SECURITY', 'Police and Security'),
  (13, 'CONSTRUCTION_AND_REAL_ESTATE', 'Construction and Real Estate'),
  (14, 'MANUFACTURING_AND_INDUSTRY', 'Manufacturing and Industry'),
  (15, 'SKILLED_TRADES_AND_REPAIR', 'Skilled Trades and Repair'),
  (16, 'TRANSPORT_AND_LOGISTICS', 'Transport and Logistics'),
  (17, 'RETAIL_AND_TRADE', 'Retail and Trade'),
  (18, 'HOSPITALITY_AND_TOURISM', 'Hospitality and Tourism'),
  (19, 'FOOD_AND_CATERING', 'Food and Catering'),
  (20, 'MEDIA_AND_JOURNALISM', 'Media and Journalism'),
  (21, 'ARTS_AND_ENTERTAINMENT', 'Arts and Entertainment'),
  (22, 'DESIGN_AND_FASHION', 'Design and Fashion'),
  (23, 'BEAUTY_AND_PERSONAL_CARE', 'Beauty and Personal Care'),
  (24, 'SPORTS_AND_FITNESS', 'Sports and Fitness'),
  (25, 'SOCIAL_WORK_AND_NGOS', 'Social Work and NGOs'),
  (26, 'ENERGY_AND_UTILITIES', 'Energy and Utilities'),
  (27, 'TELECOMMUNICATIONS', 'Telecommunications'),
  (28, 'DOMESTIC_AND_HOUSEHOLD_SERVICES', 'Domestic and Household Services'),
  (29, 'RELIGIOUS_AND_CULTURAL_SERVICES', 'Religious and Cultural Services'),
  (30, 'DIGITAL_AND_ONLINE_SERVICES', 'Digital and Online Services')
ON CONFLICT (occupation_code) DO UPDATE
SET occupation_name = EXCLUDED.occupation_name,
    display_order = EXCLUDED.display_order;

ALTER TABLE public.occupations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS occupations_public_read ON public.occupations;
CREATE POLICY occupations_public_read ON public.occupations
  FOR SELECT TO authenticated, anon
  USING (is_active = TRUE);

-- -----------------------------------------------------------------------------
-- 2. Add occupation to public.persons
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS occupation TEXT DEFAULT 'Occupation Pending';

CREATE INDEX IF NOT EXISTS idx_persons_occupation ON public.persons(occupation);

-- Update trigger guard: validate_person_mandatory_fields_guard
CREATE OR REPLACE FUNCTION public.validate_person_mandatory_fields_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gotra_id UUID;
  v_nukh_id UUID;
BEGIN
  -- If record is soft-deleted, allow without blocking deletion/cleanup
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Normalize empty strings to NULL for optional fields
  NEW.middle_name := NULLIF(trim(NEW.middle_name), '');
  NEW.maiden_name := NULLIF(trim(NEW.maiden_name), '');
  NEW.phone_secondary := NULLIF(trim(NEW.phone_secondary), '');

  -- 1. First Name (MANDATORY)
  IF NEW.first_name IS NULL OR length(trim(NEW.first_name)) = 0 THEN
    RAISE EXCEPTION 'First Name is required.' USING ERRCODE = '22023';
  END IF;
  NEW.first_name := trim(NEW.first_name);

  -- 2. Last Name / Surname (MANDATORY)
  IF NEW.last_name IS NULL OR length(trim(NEW.last_name)) = 0 THEN
    RAISE EXCEPTION 'Last Name is required.' USING ERRCODE = '22023';
  END IF;
  NEW.last_name := trim(NEW.last_name);

  -- 3. Gender (MANDATORY)
  IF NEW.gender IS NULL OR NEW.gender::TEXT NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
    RAISE EXCEPTION 'Please select Gender.' USING ERRCODE = '22023';
  END IF;

  -- 4. Blood Group (MANDATORY)
  IF NEW.blood_group IS NULL OR length(trim(NEW.blood_group)) = 0 OR trim(NEW.blood_group) NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
    RAISE EXCEPTION 'Please select Blood Group.' USING ERRCODE = '22023';
  END IF;
  NEW.blood_group := trim(NEW.blood_group);

  -- 5. Birthplace (MANDATORY)
  IF NEW.birth_place IS NULL OR length(trim(NEW.birth_place)) = 0 THEN
    RAISE EXCEPTION 'Birthplace is required.' USING ERRCODE = '22023';
  END IF;
  NEW.birth_place := trim(NEW.birth_place);

  -- 6. Date of Birth (MANDATORY)
  IF NEW.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Date of Birth is required.' USING ERRCODE = '22023';
  END IF;

  IF NEW.date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future.' USING ERRCODE = '22023';
  END IF;

  -- Optional Date of Death validation
  IF NEW.date_of_death IS NOT NULL THEN
    IF NEW.date_of_death > CURRENT_DATE THEN
      RAISE EXCEPTION 'Date of death cannot be in the future.' USING ERRCODE = '22023';
    END IF;

    IF NEW.date_of_death < NEW.date_of_birth THEN
      RAISE EXCEPTION 'Date of death cannot be earlier than date of birth.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 7. Gotra (MANDATORY)
  IF NEW.gotra IS NULL OR length(trim(NEW.gotra)) = 0 THEN
    RAISE EXCEPTION 'Please select Gotra.' USING ERRCODE = '22023';
  END IF;
  NEW.gotra := trim(NEW.gotra);

  SELECT id INTO v_gotra_id
  FROM public.gotras
  WHERE lower(trim(name)) = lower(trim(NEW.gotra))
     OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(NEW.gotra, ' (', 1)))
  LIMIT 1;

  IF v_gotra_id IS NULL THEN
    RAISE EXCEPTION 'Please select an approved Gotra from the master list.' USING ERRCODE = '22023';
  END IF;

  -- 8. Nukh (MANDATORY)
  IF NEW.nukh IS NULL OR length(trim(NEW.nukh)) = 0 THEN
    RAISE EXCEPTION 'Please select Nukh.' USING ERRCODE = '22023';
  END IF;
  NEW.nukh := trim(NEW.nukh);

  SELECT id INTO v_nukh_id
  FROM public.nukhs
  WHERE gotra_id = v_gotra_id
    AND (
      lower(trim(name)) = lower(trim(NEW.nukh))
      OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(NEW.nukh, ' (', 1)))
      OR lower(name) LIKE '%' || lower(trim(NEW.nukh)) || '%'
    )
  LIMIT 1;

  IF v_nukh_id IS NULL THEN
    RAISE EXCEPTION 'Nukh "%" does not belong to the selected Gotra "%".', NEW.nukh, NEW.gotra USING ERRCODE = '22023';
  END IF;

  -- 9. Email (MANDATORY)
  IF NEW.email_contact IS NULL OR length(trim(NEW.email_contact)) = 0 THEN
    RAISE EXCEPTION 'Valid Email Address is required.' USING ERRCODE = '22023';
  END IF;
  NEW.email_contact := lower(trim(NEW.email_contact));

  IF NOT (NEW.email_contact ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') THEN
    RAISE EXCEPTION 'Valid Email Address is required.' USING ERRCODE = '22023';
  END IF;

  -- 10. Primary Phone (MANDATORY)
  IF NEW.phone IS NULL OR length(trim(NEW.phone)) = 0 THEN
    RAISE EXCEPTION 'Valid Primary Phone Number is required.' USING ERRCODE = '22023';
  END IF;
  NEW.phone := trim(NEW.phone);

  IF length(NEW.phone) < 7 THEN
    RAISE EXCEPTION 'Valid Primary Phone Number is required.' USING ERRCODE = '22023';
  END IF;

  -- 11. Occupation (MANDATORY - Official 30 Categories)
  IF NEW.occupation IS NULL OR length(trim(NEW.occupation)) = 0 THEN
    -- If legacy record updating other fields without occupation, preserve 'Occupation Pending'
    IF TG_OP = 'UPDATE' AND (OLD.occupation IS NULL OR OLD.occupation = 'Occupation Pending') THEN
      NEW.occupation := COALESCE(NULLIF(trim(NEW.occupation), ''), 'Occupation Pending');
    ELSE
      RAISE EXCEPTION 'Occupation is required.' USING ERRCODE = '22023';
    END IF;
  ELSE
    NEW.occupation := trim(NEW.occupation);
    -- Enforce exact category match from official 30 list (or allow pending for legacy)
    IF NEW.occupation <> 'Occupation Pending' AND NOT EXISTS (
      SELECT 1 FROM public.occupations WHERE lower(trim(occupation_name)) = lower(trim(NEW.occupation))
    ) THEN
      RAISE EXCEPTION 'Please select an approved Occupation category from the 30 official categories.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Family Claims System
-- -----------------------------------------------------------------------------
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_status TEXT DEFAULT 'UNCLAIMED' CHECK (claim_status IN ('UNCLAIMED', 'PENDING', 'APPROVED', 'REJECTED'));

CREATE TABLE IF NOT EXISTS public.family_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  requested_relationship TEXT NOT NULL,
  reason TEXT NOT NULL,
  supporting_document_reference TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_role TEXT,
  reviewer_comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_claims_family_id ON public.family_claims(family_id);
CREATE INDEX IF NOT EXISTS idx_family_claims_user_id ON public.family_claims(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_family_claims_status ON public.family_claims(status);

ALTER TABLE public.family_claims ENABLE ROW LEVEL SECURITY;

-- Requesters can view their own claims
DROP POLICY IF EXISTS family_claims_user_select ON public.family_claims;
CREATE POLICY family_claims_user_select ON public.family_claims
  FOR SELECT TO authenticated
  USING (requested_by_user_id = auth.uid());

-- Requesters can insert their own claims
DROP POLICY IF EXISTS family_claims_user_insert ON public.family_claims;
CREATE POLICY family_claims_user_insert ON public.family_claims
  FOR INSERT TO authenticated
  WITH CHECK (requested_by_user_id = auth.uid());

-- Admins and Super Admins can select all claims
DROP POLICY IF EXISTS family_claims_admin_select ON public.family_claims;
CREATE POLICY family_claims_admin_select ON public.family_claims
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role::text IN ('ADMIN', 'SUPER_ADMIN')
        AND profiles.is_active = TRUE
    )
  );

-- Admins and Super Admins can update all claims
DROP POLICY IF EXISTS family_claims_admin_update ON public.family_claims;
CREATE POLICY family_claims_admin_update ON public.family_claims
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role::text IN ('ADMIN', 'SUPER_ADMIN')
        AND profiles.is_active = TRUE
    )
  );

-- Mukhis can view and review claims within their assigned regional jurisdiction
DROP POLICY IF EXISTS family_claims_mukhi_select ON public.family_claims;
CREATE POLICY family_claims_mukhi_select ON public.family_claims
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_mukhis cm
      JOIN public.families f ON f.id = family_claims.family_id
      WHERE cm.linked_user_id = auth.uid()
        AND cm.is_active = TRUE
        AND cm.authority_status = 'ACTIVE'
        AND (
          lower(trim(cm.gram)) = lower(trim(f.city))
          OR lower(trim(cm.gram)) LIKE '%' || lower(trim(f.city)) || '%'
          OR f.selected_mukhi_id = cm.id
        )
    )
  );

DROP POLICY IF EXISTS family_claims_mukhi_update ON public.family_claims;
CREATE POLICY family_claims_mukhi_update ON public.family_claims
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_mukhis cm
      JOIN public.families f ON f.id = family_claims.family_id
      WHERE cm.linked_user_id = auth.uid()
        AND cm.is_active = TRUE
        AND cm.authority_status = 'ACTIVE'
        AND (
          lower(trim(cm.gram)) = lower(trim(f.city))
          OR lower(trim(cm.gram)) LIKE '%' || lower(trim(f.city)) || '%'
          OR f.selected_mukhi_id = cm.id
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Family Claim RPC Functions
-- -----------------------------------------------------------------------------

-- Submit Family Claim
CREATE OR REPLACE FUNCTION public.submit_family_claim(
  p_family_id UUID,
  p_relationship TEXT,
  p_reason TEXT,
  p_supporting_doc TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_person_id UUID;
  v_family RECORD;
  v_claim_id UUID;
  v_existing_claim RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit family claim.' USING ERRCODE = '28000';
  END IF;

  -- Verify family exists
  SELECT * INTO v_family
  FROM public.families
  WHERE id = p_family_id AND deleted_at IS NULL;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Family record not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Check if user is already the manager
  IF v_family.created_by = v_user_id OR v_family.claimed_by_user_id = v_user_id THEN
    RAISE EXCEPTION 'You already have management access to this family.' USING ERRCODE = '42501';
  END IF;

  -- Check for existing pending claim by this user
  SELECT * INTO v_existing_claim
  FROM public.family_claims
  WHERE family_id = p_family_id
    AND requested_by_user_id = v_user_id
    AND status = 'PENDING'
  LIMIT 1;

  IF v_existing_claim IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a pending claim for this family.' USING ERRCODE = '23505';
  END IF;

  -- Find requester's linked person ID if any
  SELECT id INTO v_person_id
  FROM public.persons
  WHERE user_id = v_user_id AND deleted_at IS NULL
  LIMIT 1;

  -- Insert claim
  INSERT INTO public.family_claims (
    family_id,
    requested_by_user_id,
    requested_by_person_id,
    requested_relationship,
    reason,
    supporting_document_reference,
    status
  ) VALUES (
    p_family_id,
    v_user_id,
    v_person_id,
    trim(p_relationship),
    trim(p_reason),
    p_supporting_doc,
    'PENDING'
  ) RETURNING id INTO v_claim_id;

  -- Update family claim status if unmanaged
  UPDATE public.families
  SET claim_status = 'PENDING'
  WHERE id = p_family_id AND claim_status = 'UNCLAIMED';

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'message', 'Family claim request submitted successfully. Awaiting reviewer approval.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_family_claim(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Approve Family Claim
CREATE OR REPLACE FUNCTION public.approve_family_claim(
  p_claim_id UUID,
  p_reviewer_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_claim RECORD;
  v_family RECORD;
  v_is_authorized BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  -- Get caller profile role
  SELECT role::text INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id AND is_active = TRUE;

  -- Fetch claim
  SELECT * INTO v_claim
  FROM public.family_claims
  WHERE id = p_claim_id;

  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'Claim request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This claim is no longer pending (Current status: %).', v_claim.status USING ERRCODE = '22023';
  END IF;

  -- Fetch family
  SELECT * INTO v_family
  FROM public.families
  WHERE id = v_claim.family_id;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Family record does not exist.' USING ERRCODE = 'P0002';
  END IF;

  -- Check Authorization: Admin, Super Admin, or Regional Mukhi
  IF v_caller_role IN ('ADMIN', 'SUPER_ADMIN') THEN
    v_is_authorized := TRUE;
  ELSE
    -- Check if caller is active Mukhi for family region
    SELECT EXISTS (
      SELECT 1 FROM public.community_mukhis cm
      WHERE cm.linked_user_id = v_caller_id
        AND cm.is_active = TRUE
        AND cm.authority_status = 'ACTIVE'
        AND (
          lower(trim(cm.gram)) = lower(trim(v_family.city))
          OR lower(trim(cm.gram)) LIKE '%' || lower(trim(v_family.city)) || '%'
          OR v_family.selected_mukhi_id = cm.id
        )
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'You are not authorized to approve claims for this family region.' USING ERRCODE = '42501';
  END IF;

  -- Update claim record
  UPDATE public.family_claims
  SET status = 'APPROVED',
      reviewed_by = v_caller_id,
      reviewed_by_role = COALESCE(v_caller_role, 'MUKHI'),
      reviewer_comments = p_reviewer_comments,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_claim_id;

  -- Update family management access: grant claimed_by_user_id
  -- NOTE: Does NOT overwrite created_by and does NOT alter head person
  UPDATE public.families
  SET claimed_by_user_id = v_claim.requested_by_user_id,
      claim_status = 'APPROVED',
      updated_at = NOW()
  WHERE id = v_claim.family_id;

  -- Reject any other pending claims for this same family
  UPDATE public.family_claims
  SET status = 'REJECTED',
      reviewed_by = v_caller_id,
      reviewed_by_role = COALESCE(v_caller_role, 'MUKHI'),
      reviewer_comments = 'Another claim for this family was approved.',
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE family_id = v_claim.family_id
    AND id <> p_claim_id
    AND status = 'PENDING';

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'family_id', v_claim.family_id,
    'message', 'Family claim approved successfully. Management access granted.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_family_claim(UUID, TEXT) TO authenticated;

-- Reject Family Claim
CREATE OR REPLACE FUNCTION public.reject_family_claim(
  p_claim_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_claim RECORD;
  v_family RECORD;
  v_is_authorized BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT role::text INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id AND is_active = TRUE;

  SELECT * INTO v_claim
  FROM public.family_claims
  WHERE id = p_claim_id;

  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'Claim request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This claim is no longer pending.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_family
  FROM public.families
  WHERE id = v_claim.family_id;

  IF v_caller_role IN ('ADMIN', 'SUPER_ADMIN') THEN
    v_is_authorized := TRUE;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.community_mukhis cm
      WHERE cm.linked_user_id = v_caller_id
        AND cm.is_active = TRUE
        AND cm.authority_status = 'ACTIVE'
        AND (
          lower(trim(cm.gram)) = lower(trim(v_family.city))
          OR lower(trim(cm.gram)) LIKE '%' || lower(trim(v_family.city)) || '%'
          OR v_family.selected_mukhi_id = cm.id
        )
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'You are not authorized to reject claims for this family region.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.family_claims
  SET status = 'REJECTED',
      reviewed_by = v_caller_id,
      reviewed_by_role = COALESCE(v_caller_role, 'MUKHI'),
      reviewer_comments = trim(p_rejection_reason),
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_claim_id;

  -- Check if other pending claims exist; if none, reset claim_status
  IF NOT EXISTS (SELECT 1 FROM public.family_claims WHERE family_id = v_claim.family_id AND status = 'PENDING') THEN
    UPDATE public.families
    SET claim_status = CASE WHEN claimed_by_user_id IS NOT NULL THEN 'APPROVED' ELSE 'UNCLAIMED' END
    WHERE id = v_claim.family_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'message', 'Family claim request rejected.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_family_claim(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Export Audit Logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT,
  export_type TEXT NOT NULL,
  file_format TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  filters_applied JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_audit_user_id ON public.export_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_export_audit_created_at ON public.export_audit_logs(created_at DESC);

ALTER TABLE public.export_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS export_audit_admin_select ON public.export_audit_logs;
CREATE POLICY export_audit_admin_select ON public.export_audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role::text IN ('ADMIN', 'SUPER_ADMIN')
        AND profiles.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS export_audit_admin_insert ON public.export_audit_logs;
CREATE POLICY export_audit_admin_insert ON public.export_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role::text IN ('ADMIN', 'SUPER_ADMIN')
        AND profiles.is_active = TRUE
    )
  );

COMMIT;
