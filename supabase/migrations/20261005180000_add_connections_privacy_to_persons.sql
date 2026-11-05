-- =============================================================================
-- Migration: 20261005180000_add_connections_privacy_to_persons.sql
-- Purpose:   Add connection-aware RLS SELECT policy to public.persons and harden
--             execution privileges on public.are_users_connected helper function.
-- Phase:     Phase 7 — Subtask 3 (Connection-Aware Privacy & Cross-Domain Integration)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY RULES:
-- 1. PERSON != USER BOUNDARY:
--    A person record (public.persons) represents a human census entity.
--    A user record (auth.users / public.profiles) represents an authenticated account.
--    Connections operate strictly USER ↔ USER (public.connections).
--    The bridge between a person and a user is exclusively persons.user_id.
--    If persons.user_id IS NULL (unlinked/unclaimed person), connections-based
--    visibility can NEVER be satisfied. No heuristic or name matching is allowed.
--
-- 2. CONNECTIONS PRIVACY TIER:
--    When persons.profile_privacy = 'CONNECTIONS', the record is visible ONLY to:
--    - The linked owner account itself (auth.uid() = persons.user_id via persons_select_own)
--    - An authenticated user who shares an active, ACCEPTED connection with the linked user
--      (public.are_users_connected(auth.uid(), persons.user_id) = TRUE)
--    - Community moderators/administrators (via persons_select_admin)
--
-- 3. STRICT STATE VALIDATION:
--    Only status = 'ACCEPTED' in public.connections grants access.
--    PENDING, REJECTED, and BLOCKED statuses MUST NEVER satisfy connections privacy.
--    Soft-deleted persons (deleted_at IS NOT NULL) and ARCHIVED persons (status = 'ARCHIVED')
--    remain strictly inaccessible.
--
-- 4. LEAST PRIVILEGE FUNCTION HARDENING:
--    public.are_users_connected(UUID, UUID) is SECURITY DEFINER with search_path = public.
--    Revoke all execution privileges from PUBLIC and anon.
--    Grant execution exclusively to authenticated users.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Function Privilege Hardening & Caller Authorization: public.are_users_connected
-- -----------------------------------------------------------------------------
-- Enforces caller authorization to prevent arbitrary social-graph probing (oracle attack):
-- - Unauthenticated callers return FALSE.
-- - Authenticated caller must be user_a, user_b, or an active community moderator/admin.
-- - Only status = 'ACCEPTED' returns TRUE.
CREATE OR REPLACE FUNCTION public.are_users_connected(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    -- 1. Unauthenticated callers or null arguments: return FALSE safely
    WHEN auth.uid() IS NULL OR user_a IS NULL OR user_b IS NULL THEN FALSE

    -- 2. Caller authorization: caller must be user_a, user_b, or an active community moderator/admin
    -- Prevents arbitrary third-party probing of the social graph
    WHEN auth.uid() <> user_a AND auth.uid() <> user_b AND NOT public.is_community_moderator() THEN FALSE

    -- 3. Check for active ACCEPTED connection between user_a and user_b
    ELSE EXISTS (
      SELECT 1
      FROM public.connections
      WHERE status = 'ACCEPTED'
        AND (
          (requester_id = user_a AND addressee_id = user_b)
          OR
          (requester_id = user_b AND addressee_id = user_a)
        )
    )
  END;
$$;

COMMENT ON FUNCTION public.are_users_connected(UUID, UUID) IS
  'Returns TRUE if user_a and user_b share an active ACCEPTED connection. '
  'Enforces caller authorization: caller must be user_a, user_b, or an active moderator/admin.';

-- Ensure unauthenticated visitors (anon) and the PUBLIC pseudo-role cannot execute
-- the helper function directly. Only authenticated sessions may invoke it.
REVOKE ALL ON FUNCTION public.are_users_connected(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.are_users_connected(UUID, UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.are_users_connected(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Row Level Security Policy: persons_select_connections
-- -----------------------------------------------------------------------------
-- Allows authenticated members to read census persons with profile_privacy = 'CONNECTIONS'
-- if the person is linked to a user account, not soft-deleted, not archived,
-- and the viewer has an active ACCEPTED connection with the linked account.
DROP POLICY IF EXISTS "persons_select_connections" ON public.persons;

CREATE POLICY "persons_select_connections"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND profile_privacy = 'CONNECTIONS'
    AND user_id IS NOT NULL
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
    AND public.are_users_connected(auth.uid(), user_id)
  );

COMMENT ON POLICY "persons_select_connections" ON public.persons IS
  'Grants SELECT on persons with profile_privacy = ''CONNECTIONS'' to authenticated users '
  'who share an active ACCEPTED connection with the linked user account (persons.user_id). '
  'Requires active status and non-deleted state.';
