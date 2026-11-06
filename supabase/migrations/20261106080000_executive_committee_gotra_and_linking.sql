-- =============================================================================
-- Migration: 20261106080000_executive_committee_gotra_and_linking.sql
-- Description: Add Gotra column to executive_committee_members and update
--              admin_upsert_committee_member RPC to persist Gotra and linked_person_id.
-- =============================================================================

BEGIN;

-- 1. Add gotra column to executive_committee_members
ALTER TABLE public.executive_committee_members
  ADD COLUMN IF NOT EXISTS gotra TEXT;

CREATE INDEX IF NOT EXISTS idx_exec_comm_gotra ON public.executive_committee_members(gotra);

-- 2. Update admin_upsert_committee_member RPC to accept gotra and linked_person_id
CREATE OR REPLACE FUNCTION public.admin_upsert_committee_member(
  p_id UUID DEFAULT NULL,
  p_serial_number INTEGER DEFAULT NULL,
  p_designation TEXT DEFAULT 'Member',
  p_full_name TEXT DEFAULT '',
  p_nukh TEXT DEFAULT '',
  p_city TEXT DEFAULT '',
  p_mobile_number TEXT DEFAULT '',
  p_is_active BOOLEAN DEFAULT TRUE,
  p_gotra TEXT DEFAULT NULL,
  p_linked_person_id UUID DEFAULT NULL
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
      gotra = CASE WHEN p_gotra IS NOT NULL THEN trim(p_gotra) ELSE gotra END,
      nukh = trim(p_nukh),
      city = trim(p_city),
      mobile_number = trim(p_mobile_number),
      linked_person_id = COALESCE(p_linked_person_id, linked_person_id),
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
      gotra,
      nukh,
      city,
      mobile_number,
      linked_person_id,
      is_active
    ) VALUES (
      v_serial,
      trim(p_designation),
      trim(p_full_name),
      CASE WHEN p_gotra IS NOT NULL THEN trim(p_gotra) ELSE NULL END,
      trim(p_nukh),
      trim(p_city),
      trim(p_mobile_number),
      p_linked_person_id,
      p_is_active
    )
    RETURNING * INTO v_member;
  END IF;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_committee_member TO authenticated;

COMMIT;
