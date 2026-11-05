-- =============================================================================
-- Migration: 20261102200000_enforce_protected_personal_data_governance.sql
-- Description: Server-authoritative protected personal data & visibility governance
-- Task: CLIENT-PRIVACY-1 — Protected Personal Data & Visibility Governance
--
-- Security Invariants & Client Privacy Policy:
--   1. Protected personal data by default:
--      - Full date of birth (exact day & month hidden; year & derived age public)
--      - Primary phone number (phone)
--      - Secondary phone number (phone_secondary)
--      - Contact email (email_contact)
--      - Residential/full address (street address, building, flat; city/state public)
--   2. Non-exposure guarantee:
--      - Base users (MEMBER, FAMILY_HEAD, COMMITTEE_MEMBER, GUEST, anonymous)
--        MUST NEVER receive protected fields belonging to other people.
--      - Masking and authorization enforced at database level (security barrier views,
--        column-level privileges, RPC boundaries, column defaults, and RLS).
--   3. Authorized roles:
--      - SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR (Mukhi-equivalent; no MUKHI DB role).
--      - Authorized roles can access and manage protected personal data.
--   4. Self-service for normal users:
--      - A linked user (user_id = auth.uid()) can access and maintain their own
--        legitimate personal data, but has ZERO editable privacy controls rendered.
--   5. Mukhi location association:
--      - Normal users view assigned respective Mukhi (name, designation, city)
--        with contact request affordance (no cleartext private contact info).
--   6. Audit logging:
--      - Audit logging records only structural metadata; zero raw sensitive PII
--        (phone, email, full DOB) is logged.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Generated Column & Age Function on public.persons
-- -----------------------------------------------------------------------------

-- Add dob_year generated column to extract the birth year without exposing day/month
ALTER TABLE public.persons 
  ADD COLUMN IF NOT EXISTS dob_year INTEGER 
  GENERATED ALWAYS AS (EXTRACT(YEAR FROM date_of_birth)::INTEGER) STORED;

COMMENT ON COLUMN public.persons.dob_year IS
  'Public-safe birth year extracted from date_of_birth. Safe for community directory and tree display.';

-- Helper function to calculate person's current age safely
CREATE OR REPLACE FUNCTION public.calculate_person_age(p_dob DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT CASE 
    WHEN p_dob IS NULL THEN NULL
    ELSE (date_part('year', CURRENT_DATE) - date_part('year', p_dob))::INTEGER - 
         CASE WHEN to_char(CURRENT_DATE, 'MMDD') < to_char(p_dob, 'MMDD') THEN 1 ELSE 0 END
  END;
$$;

COMMENT ON FUNCTION public.calculate_person_age(DATE) IS
  'Calculates age in years from date_of_birth relative to CURRENT_DATE.';

-- -----------------------------------------------------------------------------
-- 2. Harden Privacy Defaults on persons & families
-- -----------------------------------------------------------------------------

ALTER TABLE public.persons ALTER COLUMN dob_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN contact_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN profile_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;

-- Temporarily disable the privacy update guard trigger for migration data normalization.
-- Note: ALTER TABLE ... DISABLE TRIGGER requires table ownership (postgres role).
-- Ordinary authenticated/anon application clients have zero DDL privileges and cannot invoke this.
ALTER TABLE public.persons DISABLE TRIGGER trg_person_privacy_update_guard;

-- Migrate any pre-existing records to PRIVATE defaults
UPDATE public.persons
SET dob_privacy = 'PRIVATE'::public.privacy_level
WHERE dob_privacy IS NULL OR dob_privacy != 'PRIVATE'::public.privacy_level;

UPDATE public.persons
SET contact_privacy = 'PRIVATE'::public.privacy_level
WHERE contact_privacy IS NULL OR contact_privacy != 'PRIVATE'::public.privacy_level;

UPDATE public.persons
SET profile_privacy = 'PRIVATE'::public.privacy_level
WHERE profile_privacy IS NULL OR profile_privacy != 'PRIVATE'::public.privacy_level;

-- Re-enable the privacy update guard trigger immediately after normalization
ALTER TABLE public.persons ENABLE TRIGGER trg_person_privacy_update_guard;

-- -----------------------------------------------------------------------------
-- 3. Security Barrier View: public.community_persons
-- -----------------------------------------------------------------------------
-- Exposes ONLY approved community-safe fields.
-- Protected columns (date_of_birth, phone, phone_secondary, email_contact, user_id,
-- created_by, dob_privacy, contact_privacy, profile_privacy, birth_place) are entirely removed.
-- Resolves community-safe residence (city, state) from active family membership,
-- with graceful fallback to birth_place town.
-- dob_year and calculated age are exposed. Full birth date is absent.
-- Protected personal details are accessible only via get_person_protected_details() RPC.

CREATE OR REPLACE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  p.dob_year,
  public.calculate_person_age(p.date_of_birth) AS age,
  COALESCE(
    (
      SELECT f.city
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id
        AND fm.left_at IS NULL
        AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    ),
    NULLIF(trim(split_part(p.birth_place, ',', 1)), '')
  ) AS city,
  COALESCE(
    (
      SELECT f.state
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id
        AND fm.left_at IS NULL
        AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    ),
    NULLIF(trim(split_part(p.birth_place, ',', 2)), '')
  ) AS state,
  p.date_of_death,
  p.avatar_url,
  p.gotra,
  p.nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at
FROM public.persons p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW public.community_persons IS
  'Security barrier view exposing approved community-safe fields. Protected columns (date_of_birth, phone, phone_secondary, email_contact, user_id, created_by, privacy levels, birth_place) are entirely omitted.';

-- Gated to authenticated community members only — zero public/anon harvesting
REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Database-Level Gate 1 Protection on public.persons
-- -----------------------------------------------------------------------------
-- Revoke wide table-level SELECT on public.persons from authenticated, anon, PUBLIC.
-- Re-grant column-level SELECT on non-protected columns only to authenticated members.
-- Zero SELECT permissions granted to anon.
-- Protected columns (date_of_birth, phone, phone_secondary, email_contact, user_id,
-- created_by, profile_privacy, contact_privacy, dob_privacy, birth_place) CANNOT
-- be directly selected from public.persons by callers via PostgREST.

REVOKE SELECT ON TABLE public.persons FROM authenticated, anon, PUBLIC;

GRANT SELECT (
  id,
  first_name,
  middle_name,
  last_name,
  maiden_name,
  gender,
  dob_year,
  date_of_death,
  avatar_url,
  gotra,
  nukh,
  kul,
  status,
  verification_status,
  created_at,
  updated_at,
  deleted_at
) ON TABLE public.persons TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: public.get_person_protected_details
-- -----------------------------------------------------------------------------
-- Authorized or self-service fetching of protected details with audit logging.

CREATE OR REPLACE FUNCTION public.get_person_protected_details(p_person_id UUID)
RETURNS TABLE (
  date_of_birth DATE,
  phone TEXT,
  phone_secondary TEXT,
  email_contact TEXT,
  is_owner BOOLEAN,
  is_moderator BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_user_id UUID;
  v_is_owner BOOLEAN;
  v_is_moderator BOOLEAN;
  v_caller_uid UUID;
BEGIN
  v_caller_uid := auth.uid();
  
  -- Locate person
  SELECT user_id INTO v_person_user_id
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_owner := (v_caller_uid IS NOT NULL AND v_person_user_id IS NOT NULL AND v_caller_uid = v_person_user_id);
  v_is_moderator := public.can_manage_privacy_settings();

  -- Security Gate: Caller must be owner or authorized moderator/admin
  IF NOT (v_is_owner OR v_is_moderator) THEN
    RAISE EXCEPTION 'Unauthorized: Protected personal data is restricted to authorized Mukhis and the individual record owner.'
      USING ERRCODE = '42501';
  END IF;

  -- Audit log the access (zero sensitive PII in log payload)
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_ACCESSED',
      'accessor_uid', v_caller_uid,
      'is_owner', v_is_owner,
      'is_moderator', v_is_moderator
    )
  );

  RETURN QUERY
  SELECT 
    p.date_of_birth,
    p.phone,
    p.phone_secondary,
    p.email_contact,
    v_is_owner,
    v_is_moderator
  FROM public.persons p
  WHERE p.id = p_person_id;
END;
$$;

COMMENT ON FUNCTION public.get_person_protected_details(UUID) IS
  'SECURITY DEFINER RPC to retrieve protected personal data (full DOB, phone, email). Restricted to owner and authorized Mukhis/admins.';

REVOKE ALL ON FUNCTION public.get_person_protected_details(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_person_protected_details(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: public.update_person_protected_details
-- -----------------------------------------------------------------------------
-- Self-service update by record owner or authorized Mukhi/Admin.
-- RETURNS ONLY minimal confirmation metadata (person_id, updated_at).
-- Strictly DOES NOT return the complete public.persons row or protected columns.

CREATE OR REPLACE FUNCTION public.update_person_protected_details(
  p_person_id UUID,
  p_date_of_birth DATE DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_phone_secondary TEXT DEFAULT NULL,
  p_email_contact TEXT DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person RECORD;
  v_is_owner BOOLEAN;
  v_is_moderator BOOLEAN;
  v_caller_uid UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_caller_uid := auth.uid();

  SELECT * INTO v_person
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_owner := (v_caller_uid IS NOT NULL AND v_person.user_id IS NOT NULL AND v_caller_uid = v_person.user_id);
  v_is_moderator := public.can_manage_privacy_settings();

  IF NOT (v_is_owner OR v_is_moderator) THEN
    RAISE EXCEPTION 'Unauthorized: Only the record owner or an authorized Mukhi / Administrator may update protected personal data.'
      USING ERRCODE = '42501';
  END IF;

  v_updated_at := NOW();

  UPDATE public.persons
  SET
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    phone = COALESCE(p_phone, phone),
    phone_secondary = COALESCE(p_phone_secondary, phone_secondary),
    email_contact = COALESCE(p_email_contact, email_contact),
    updated_at = v_updated_at
  WHERE id = p_person_id;

  -- Audit log the update (zero sensitive PII in log payload)
  PERFORM public.log_audit_event(
    'PERSON_UPDATED'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_UPDATED',
      'updater_uid', v_caller_uid,
      'is_owner', v_is_owner,
      'is_moderator', v_is_moderator,
      'updated_fields', ARRAY[
        CASE WHEN p_date_of_birth IS NOT NULL THEN 'date_of_birth' END,
        CASE WHEN p_phone IS NOT NULL THEN 'phone' END,
        CASE WHEN p_phone_secondary IS NOT NULL THEN 'phone_secondary' END,
        CASE WHEN p_email_contact IS NOT NULL THEN 'email_contact' END
      ]
    )
  );

  RETURN QUERY
  SELECT p_person_id AS person_id, v_updated_at AS updated_at;
END;
$$;

COMMENT ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT) IS
  'SECURITY DEFINER RPC allowing record owner or authorized Mukhi/Admin to update protected personal data. Returns minimal metadata only.';

REVOKE ALL ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: public.update_person_privacy_settings (Hardened Return Type)
-- -----------------------------------------------------------------------------
-- Redefine privacy settings update RPC to return minimal metadata only.
-- Strictly DOES NOT return the complete public.persons row or protected columns.

CREATE OR REPLACE FUNCTION public.update_person_privacy_settings(
  p_person_id UUID,
  p_profile_privacy public.privacy_level,
  p_contact_privacy public.privacy_level,
  p_dob_privacy public.privacy_level
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  v_updated_at := NOW();

  UPDATE public.persons
  SET
    profile_privacy = p_profile_privacy,
    contact_privacy = p_contact_privacy,
    dob_privacy = p_dob_privacy,
    updated_at = v_updated_at
  WHERE id = p_person_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT p_person_id AS person_id, v_updated_at AS updated_at;
END;
$$;

COMMENT ON FUNCTION public.update_person_privacy_settings(UUID, public.privacy_level, public.privacy_level, public.privacy_level) IS
  'SECURITY DEFINER RPC allowing authorized Mukhi/Admin to update privacy settings. Returns minimal metadata only.';

REVOKE ALL ON FUNCTION public.update_person_privacy_settings(UUID, public.privacy_level, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_privacy_settings(UUID, public.privacy_level, public.privacy_level, public.privacy_level) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC: public.get_my_linked_person
-- -----------------------------------------------------------------------------
-- Allows an authenticated user to fetch their own linked census record
-- via community_persons without requiring direct SELECT grant on persons.user_id.

CREATE OR REPLACE FUNCTION public.get_my_linked_person()
RETURNS SETOF public.community_persons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cp.*
  FROM public.community_persons cp
  JOIN public.persons p ON p.id = cp.id
  WHERE p.user_id = auth.uid()
    AND p.deleted_at IS NULL
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_my_linked_person() IS
  'SECURITY DEFINER RPC allowing authenticated user to retrieve their own linked person record safely.';

REVOKE ALL ON FUNCTION public.get_my_linked_person() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_linked_person() TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Redefine Legacy RPC: public.admin_set_person_privacy (Harden Return Contract)
-- -----------------------------------------------------------------------------
-- Legacy RPC redefined to return minimal metadata only, ensuring no complete
-- public.persons row or protected columns are returned to callers.
-- PostgreSQL requires dropping the existing function when changing its return type.

DROP FUNCTION public.admin_set_person_privacy(
  UUID,
  public.privacy_level,
  public.privacy_level,
  public.privacy_level
);

CREATE FUNCTION public.admin_set_person_privacy(
  p_person_id UUID,
  p_profile_privacy public.privacy_level,
  p_contact_privacy public.privacy_level,
  p_dob_privacy public.privacy_level
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  v_updated_at := NOW();

  UPDATE public.persons
  SET
    profile_privacy = p_profile_privacy,
    contact_privacy = p_contact_privacy,
    dob_privacy = p_dob_privacy,
    updated_at = v_updated_at
  WHERE id = p_person_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT p_person_id AS person_id, v_updated_at AS updated_at;
END;
$$;

COMMENT ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) IS
  'SECURITY DEFINER RPC allowing authorized Mukhi/Admin to update privacy settings. Returns minimal metadata only.';

REVOKE ALL ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. Notify PostgREST schema cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

