-- =============================================================================
-- Migration: 20261005170000_create_connections.sql
-- Purpose:   Create canonical public.connections table, connection_status enum,
--             canonical ordering constraints, indexes, RLS policies, trigger,
--             and table privileges.
-- Phase:     Phase 7 — Subtask 1 (Connections Foundation)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY RULES:
-- 1. USER ↔ USER CONNECTION MODEL:
--    Connections operate strictly between authenticated user profiles (public.profiles.id).
--    They represent social links between living users of the platform.
--    PERSON != USER:
--    Connections do NOT link public.persons records directly.
--    Linking to census individuals is governed by profiles.person_id / claims (Phase 8).
--
-- 2. ONE CANONICAL ROW PER PAIR (NO BIDIRECTIONAL DUPLICATION):
--    A connection between User A and User B is stored in exactly ONE row.
--    To ensure absolute uniqueness at the database level regardless of who initiates,
--    an expression-based unique index on (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
--    guarantees that (A, B) and (B, A) can never coexist simultaneously.
--
-- 3. STATUS LIFECYCLE:
--    - PENDING: Request initiated by requester_id; awaiting decision by addressee_id.
--    - ACCEPTED: Accepted by addressee_id; mutual connection established.
--    - REJECTED: Declined by addressee_id.
--    - BLOCKED: Established by either participant; disables connection visibility.
--
-- 4. TWO-GATE ACCESS CONTROL (LEAST PRIVILEGE):
--    - Gate 1: authenticated role granted SELECT, INSERT, UPDATE, DELETE.
--              anon and PUBLIC are granted zero privileges (revoked, deny-by-default).
--    - Gate 2 (RLS): Strict row-level isolation:
--      - SELECT: User must be requester_id OR addressee_id.
--      - INSERT: auth.uid() must equal requester_id, status must be 'PENDING',
--                and requester_id != addressee_id.
--      - UPDATE:
--          * Addressee can transition PENDING -> ACCEPTED or PENDING -> REJECTED.
--          * Either participant can transition to BLOCKED.
--          * Identity fields (id, requester_id, addressee_id, created_at) are immutable.
--      - DELETE: Either participant can delete an existing connection row.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum: public.connection_status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('public.connection_status') IS NULL THEN
    CREATE TYPE public.connection_status AS ENUM (
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'BLOCKED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.connection_status IS
  'Connection lifecycle states: '
  'PENDING (initiated by requester), '
  'ACCEPTED (approved by addressee), '
  'REJECTED (declined by addressee), '
  'BLOCKED (blocked by either participant).';

-- -----------------------------------------------------------------------------
-- 2. Table: public.connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Participants (Foreign keys reference public.profiles.id)
  -- ON DELETE CASCADE ensures account deletion cleans up social graph edges
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Status & Lifecycle
  status public.connection_status NOT NULL DEFAULT 'PENDING',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Integrity Constraints
  -- 1. Disallow self-connections
  CONSTRAINT connections_no_self_connection
    CHECK (requester_id <> addressee_id)
);

COMMENT ON TABLE public.connections IS
  'Social connections between authenticated users (public.profiles.id). '
  'Represents user-to-user networking and relationship verification. '
  'Enforces exactly one row per unordered user pair.';

COMMENT ON COLUMN public.connections.requester_id IS 'UUID of the user who initiated the connection request.';
COMMENT ON COLUMN public.connections.addressee_id IS 'UUID of the user receiving the connection request.';
COMMENT ON COLUMN public.connections.status IS 'Current lifecycle status (PENDING, ACCEPTED, REJECTED, BLOCKED).';

-- -----------------------------------------------------------------------------
-- 3. Indexes & Unordered Pair Uniqueness
-- -----------------------------------------------------------------------------

-- 3.1 Unordered Canonical Pair Uniqueness
-- Prevents duplicate opposing or concurrent rows: e.g. (A, B) and (B, A)
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_canonical_pair
  ON public.connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

-- 3.2 Requester queries (outgoing requests, sent connections)
CREATE INDEX IF NOT EXISTS idx_connections_requester_id
  ON public.connections (requester_id);

-- 3.3 Addressee queries (incoming requests, pending approvals)
CREATE INDEX IF NOT EXISTS idx_connections_addressee_id
  ON public.connections (addressee_id);

-- 3.4 Status filter queries
CREATE INDEX IF NOT EXISTS idx_connections_status
  ON public.connections (status);

-- 3.5 Composite status + participant queries
CREATE INDEX IF NOT EXISTS idx_connections_requester_status
  ON public.connections (requester_id, status);

CREATE INDEX IF NOT EXISTS idx_connections_addressee_status
  ON public.connections (addressee_id, status);

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

-- 4.1 Updated-At Trigger (reuses existing public.handle_updated_at function)
DROP TRIGGER IF EXISTS connections_handle_updated_at ON public.connections;
CREATE TRIGGER connections_handle_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4.2 Immutability Guard: Prevent altering participants, id, or created_at
CREATE OR REPLACE FUNCTION public.handle_connection_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Disallow mutating core identity fields
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'connections.id is immutable';
  END IF;

  IF NEW.requester_id <> OLD.requester_id THEN
    RAISE EXCEPTION 'connections.requester_id is immutable';
  END IF;

  IF NEW.addressee_id <> OLD.addressee_id THEN
    RAISE EXCEPTION 'connections.addressee_id is immutable';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'connections.created_at is immutable';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_connection_update_guard() IS
  'Integrity trigger: blocks mutations to id, requester_id, addressee_id, and created_at.';

DROP TRIGGER IF EXISTS connections_update_guard ON public.connections;
CREATE TRIGGER connections_update_guard
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_connection_update_guard();

-- 4.3 Lifecycle Guard Trigger: Enforces authoritative state machine transitions
-- Rules for normal participants:
-- - PENDING  -> ACCEPTED or REJECTED (only addressee)
-- - PENDING  -> BLOCKED (either participant)
-- - ACCEPTED -> BLOCKED (either participant)
-- - REJECTED -> BLOCKED (either participant)
-- - All other participant transitions are rejected (e.g. ACCEPTED -> REJECTED, REJECTED -> ACCEPTED, BLOCKED mutations)
-- - Community moderators/administrators retain discretion to correct status
CREATE OR REPLACE FUNCTION public.handle_connection_status_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- 1. If caller is an active community moderator or administrator, permit moderation overrides
  IF public.is_community_moderator() THEN
    RETURN NEW;
  END IF;

  -- 2. Normal participant transition matrix:
  IF OLD.status = 'PENDING' THEN
    IF NEW.status IN ('ACCEPTED', 'REJECTED') THEN
      -- Only the addressee can accept or reject a pending request
      IF auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only the addressee can accept or reject a pending connection request';
      END IF;
      RETURN NEW;
    ELSIF NEW.status = 'BLOCKED' THEN
      -- Either participant can transition PENDING -> BLOCKED
      IF auth.uid() <> OLD.requester_id AND auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only connection participants can block';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid connection status transition from PENDING to %', NEW.status;
    END IF;

  ELSIF OLD.status = 'ACCEPTED' THEN
    IF NEW.status = 'BLOCKED' THEN
      -- Either participant can transition ACCEPTED -> BLOCKED
      IF auth.uid() <> OLD.requester_id AND auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only connection participants can block';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid connection status transition from ACCEPTED to %', NEW.status;
    END IF;

  ELSIF OLD.status = 'REJECTED' THEN
    IF NEW.status = 'BLOCKED' THEN
      -- Either participant can transition REJECTED -> BLOCKED
      IF auth.uid() <> OLD.requester_id AND auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only connection participants can block';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid connection status transition from REJECTED to %', NEW.status;
    END IF;

  ELSIF OLD.status = 'BLOCKED' THEN
    -- Participants cannot mutate BLOCKED connections (including BLOCKED -> BLOCKED)
    RAISE EXCEPTION 'Participants cannot modify a BLOCKED connection';

  ELSE
    RAISE EXCEPTION 'Unknown connection status %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_connection_status_transition_guard() IS
  'Authoritative lifecycle trigger enforcing valid state machine transitions: '
  'PENDING -> ACCEPTED/REJECTED (addressee only), '
  'PENDING/ACCEPTED/REJECTED -> BLOCKED (participants), '
  'and blocking all invalid transitions (ACCEPTED -> REJECTED, REJECTED -> ACCEPTED, BLOCKED mutations).';

DROP TRIGGER IF EXISTS connections_status_transition_guard ON public.connections;
CREATE TRIGGER connections_status_transition_guard
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_connection_status_transition_guard();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (Two-Gate Access Control — Gate 2)
-- -----------------------------------------------------------------------------

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- 5.1 SELECT: Participant-only visibility
-- Users can only read connection records in which they are either the requester or addressee.
-- Administrators can inspect all records for community safety and moderation.
DROP POLICY IF EXISTS "connections_select_participants" ON public.connections;
CREATE POLICY "connections_select_participants"
  ON public.connections
  FOR SELECT
  USING (
    auth.uid() = requester_id
    OR auth.uid() = addressee_id
    OR public.is_community_moderator()
  );

-- 5.2 INSERT: Requester-only insertion of PENDING connections
-- An authenticated user can only send requests where:
-- - They are the requester (auth.uid() = requester_id)
-- - Initial status is strictly 'PENDING'
-- - Self-connection is rejected
DROP POLICY IF EXISTS "connections_insert_requester" ON public.connections;
CREATE POLICY "connections_insert_requester"
  ON public.connections
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = requester_id
    AND requester_id <> addressee_id
    AND status = 'PENDING'
  );

-- 5.3 UPDATE: Addressee response or participant blocking
-- Rules:
-- - The addressee can update a PENDING request to ACCEPTED or REJECTED.
-- - Either participant (requester or addressee) can transition the connection to BLOCKED.
-- - An active moderator can update connection status for moderation purposes.
DROP POLICY IF EXISTS "connections_update_participants" ON public.connections;
CREATE POLICY "connections_update_participants"
  ON public.connections
  FOR UPDATE
  USING (
    auth.uid() = requester_id
    OR auth.uid() = addressee_id
    OR public.is_community_moderator()
  )
  WITH CHECK (
    -- Moderators can update to any valid state
    public.is_community_moderator()
    OR
    -- Either participant can set BLOCKED
    (status = 'BLOCKED' AND (auth.uid() = requester_id OR auth.uid() = addressee_id))
    OR
    -- Only addressee can accept or reject a pending request
    (
      auth.uid() = addressee_id
      AND status IN ('ACCEPTED', 'REJECTED')
    )
  );

-- 5.4 DELETE: Participant cancellation/removal (BLOCKED deletion restricted to moderators/admins)
-- Rules:
-- - Active community moderators/administrators can delete any connection row, including BLOCKED, for moderation.
-- - Participants can delete/cancel PENDING, remove ACCEPTED, or clean up REJECTED connections.
-- - Participants MUST NOT delete BLOCKED connections (prevents bypassing block by deleting & re-requesting).
DROP POLICY IF EXISTS "connections_delete_participants" ON public.connections;
CREATE POLICY "connections_delete_participants"
  ON public.connections
  FOR DELETE
  USING (
    public.is_community_moderator()
    OR (
      (auth.uid() = requester_id OR auth.uid() = addressee_id)
      AND status <> 'BLOCKED'
    )
  );

COMMENT ON POLICY "connections_delete_participants" ON public.connections IS
  'Allows participants to delete PENDING, ACCEPTED, or REJECTED connections. '
  'BLOCKED connections can ONLY be deleted by community moderators or administrators.';

-- -----------------------------------------------------------------------------
-- 6. Helper Function: are_users_connected (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
-- Used by mutual connection calculations and subsequent Phase 7 Subtask 3 privacy checks.
-- STABLE and sets search_path = public to prevent SQL injection.
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

-- -----------------------------------------------------------------------------
-- 7. Table Privileges (Two-Gate Access Control — Gate 1)
-- -----------------------------------------------------------------------------
-- Revoke all privileges from PUBLIC and anon (deny-by-default at Gate 1)
REVOKE ALL ON TABLE public.connections FROM PUBLIC;
REVOKE ALL ON TABLE public.connections FROM anon;

-- Grant required operational privileges to authenticated role (SELECT, INSERT, UPDATE, DELETE)
REVOKE ALL ON TABLE public.connections FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.connections
TO authenticated;
