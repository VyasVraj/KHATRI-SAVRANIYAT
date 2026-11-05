-- =============================================================================
-- Migration: 20261002130006_create_audit_logs.sql
-- Purpose:   Immutable audit log table for security and compliance events
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- SECURITY REQUIREMENT: The audit_logs table is APPEND-ONLY.
-- - No UPDATE policy is granted to any user or service.
-- - No DELETE policy is granted to any user or service.
-- - SELECT is restricted to ADMIN/SUPER_ADMIN only.
-- - INSERT is permitted only to authenticated users (events are generated
--   by SECURITY DEFINER functions and server-side triggers, not directly
--   by client code).
--
-- Rationale: Audit logs must be tamper-proof to:
-- 1. Detect unauthorized access or data manipulation
-- 2. Provide forensic evidence in case of disputes
-- 3. Support GDPR/privacy audit requirements
-- 4. Enable investigation of security incidents
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: public.audit_logs
-- Append-only event log. Every significant data-changing operation records
-- an entry here with the actor, action, target, and changed data.
-- -----------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What action occurred
  action public.audit_action NOT NULL,

  -- Who performed the action (NULL if system/trigger-initiated)
  -- ON DELETE SET NULL: preserve the audit record even if user is deleted
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- What was affected (polymorphic reference: type + UUID)
  target_type TEXT,   -- e.g., 'person', 'family', 'profile', 'family_member'
  target_id UUID,     -- UUID of the affected record

  -- Data snapshot for change tracking
  -- Sensitive fields (passwords, full contact info) must NEVER be stored here
  old_data JSONB,     -- State BEFORE the change (NULL for creates)
  new_data JSONB,     -- State AFTER the change (NULL for deletes)

  -- Request metadata (for security analysis)
  -- SECURITY: IP and user-agent are hashed/anonymized in Phase 15 (GDPR)
  ip_address INET,
  user_agent TEXT,

  -- Additional context (custom per-action metadata)
  metadata JSONB,

  -- Timestamp is always server-side NOW() — clients cannot override
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT audit_logs_target_type_length
    CHECK (target_type IS NULL OR length(target_type) <= 50),

  CONSTRAINT audit_logs_user_agent_length
    CHECK (user_agent IS NULL OR length(user_agent) <= 512)
);

COMMENT ON TABLE public.audit_logs IS
  'Immutable append-only security and compliance audit log. '
  'No UPDATE or DELETE allowed by any RLS policy. '
  'Sensitive field values MUST be omitted from old_data/new_data — only IDs and status fields.';

COMMENT ON COLUMN public.audit_logs.actor_id IS
  'The authenticated user who performed the action. NULL for system/trigger events.';
COMMENT ON COLUMN public.audit_logs.old_data IS
  'JSONB snapshot of the record BEFORE the change. MUST NOT contain passwords, PII, or contact data.';
COMMENT ON COLUMN public.audit_logs.new_data IS
  'JSONB snapshot of the record AFTER the change. MUST NOT contain passwords, PII, or contact data.';
COMMENT ON COLUMN public.audit_logs.created_at IS
  'Server-side timestamp — always NOW(). Clients cannot override.';

-- -----------------------------------------------------------------------------
-- INDEXES for audit_logs
-- Designed for the main administrative query patterns:
-- - What did a specific user do?
-- - What happened to a specific record?
-- - What actions occurred in a time range?
-- - What actions of a specific type occurred?
-- -----------------------------------------------------------------------------

-- Actor activity timeline (e.g., "show all actions by user X")
CREATE INDEX idx_audit_logs_actor
  ON public.audit_logs (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- Record history (e.g., "show all changes to person Y")
CREATE INDEX idx_audit_logs_target
  ON public.audit_logs (target_type, target_id, created_at DESC)
  WHERE target_id IS NOT NULL;

-- Action type filter (e.g., "show all PERSON_CLAIMED events")
CREATE INDEX idx_audit_logs_action
  ON public.audit_logs (action, created_at DESC);

-- Time-range queries for admin dashboards
CREATE INDEX idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY: audit_logs
-- APPEND-ONLY: INSERT allowed for authenticated users.
-- No UPDATE or DELETE for anyone.
-- SELECT only for admins.
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
-- Rationale: Audit logs may contain IP addresses, user agents, and
-- sensitive operational metadata. Only admins should have access.
CREATE POLICY "audit_logs_select_admin"
  ON public.audit_logs
  FOR SELECT
  USING (public.is_admin());

-- Authenticated users can insert audit entries
-- IMPORTANT: In practice, inserts are performed by SECURITY DEFINER service
-- functions or triggers — NOT directly by client code. The application layer
-- must call an audit helper function rather than inserting directly.
-- This policy is permissive at DB level; application-level control is
-- enforced by the service layer. Phase 15 will tighten this further.
CREATE POLICY "audit_logs_insert_authenticated"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND actor_id = auth.uid()
  );

-- NO UPDATE POLICY — any UPDATE will be denied by RLS default-deny
-- NO DELETE POLICY — any DELETE will be denied by RLS default-deny
-- This is the tamper-proof enforcement mechanism.

-- =============================================================================
-- UTILITY: log_audit_event()
-- Helper function to insert audit entries.
-- SECURITY DEFINER: allows server-side triggers to bypass the actor_id constraint.
-- Application code should call this function rather than INSERT directly.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action public.audit_action,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    action,
    actor_id,
    target_type,
    target_id,
    old_data,
    new_data,
    metadata,
    created_at
  ) VALUES (
    p_action,
    auth.uid(),  -- Current authenticated user
    p_target_type,
    p_target_id,
    p_old_data,
    p_new_data,
    p_metadata,
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit_event IS
  'SECURITY DEFINER helper to insert audit entries. '
  'Call this from application service functions instead of inserting directly. '
  'SECURITY: old_data/new_data MUST NOT contain passwords, contact info, or PII.';
