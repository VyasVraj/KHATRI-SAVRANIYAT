/**
 * Security & Schema Tests: Community Events & RSVP Migration (Phase 10 — Subtask 3)
 * (supabase/migrations/20261007140000_create_community_events.sql)
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261007140000_create_community_events.sql'
)
const migrationSql = fs.readFileSync(migrationPath, 'utf8')

describe('Community Events & RSVP Migration Static Contract Verification', () => {
  it('migration file exists and is populated', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
    expect(migrationSql.length).toBeGreaterThan(3000)
  })

  it('declares public.event_type, public.event_status, and public.event_rsvp_status enums', () => {
    expect(migrationSql).toMatch(/CREATE TYPE public\.event_type AS ENUM/)
    expect(migrationSql).toContain("'GENERAL'")
    expect(migrationSql).toContain("'FESTIVAL'")
    expect(migrationSql).toContain("'MEETING'")
    expect(migrationSql).toContain("'SPORTS'")
    expect(migrationSql).toContain("'YOUTH'")
    expect(migrationSql).toContain("'CULTURAL'")
    expect(migrationSql).toContain("'WORKSHOP'")
    expect(migrationSql).toContain("'OTHER'")

    expect(migrationSql).toMatch(/CREATE TYPE public\.event_status AS ENUM/)
    expect(migrationSql).toContain("'DRAFT'")
    expect(migrationSql).toContain("'PUBLISHED'")
    expect(migrationSql).toContain("'CANCELLED'")
    expect(migrationSql).toContain("'COMPLETED'")
    expect(migrationSql).toContain("'ARCHIVED'")

    expect(migrationSql).toMatch(/CREATE TYPE public\.event_rsvp_status AS ENUM/)
    expect(migrationSql).toContain("'GOING'")
    expect(migrationSql).toContain("'MAYBE'")
    expect(migrationSql).toContain("'NOT_GOING'")
  })

  it('creates public.events table with constraints and PERSON != USER invariant', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.events/)
    expect(migrationSql).toContain('CONSTRAINT events_title_length')
    expect(migrationSql).toContain('CONSTRAINT events_description_length')
    expect(migrationSql).toContain('CONSTRAINT events_location_length')
    expect(migrationSql).toContain('CONSTRAINT events_location_url_length')
    expect(migrationSql).toContain('CONSTRAINT events_capacity_positive')
    expect(migrationSql).toContain('CONSTRAINT events_time_window')
    expect(migrationSql).toContain('CONSTRAINT events_cancellation_reason_length')
    expect(migrationSql).toContain('group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE')
    expect(migrationSql).toContain('creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(migrationSql).toContain('is_pinned BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migrationSql).toContain('published_at TIMESTAMPTZ')
    expect(migrationSql).toContain('cancelled_at TIMESTAMPTZ')
    expect(migrationSql).toContain('deleted_at TIMESTAMPTZ')
  })

  it('creates public.event_rsvps table with unique constraints and bounds', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.event_rsvps/)
    expect(migrationSql).toContain('CONSTRAINT event_rsvps_unique_user_event')
    expect(migrationSql).toContain('UNIQUE (event_id, user_id)')
    expect(migrationSql).toContain('CONSTRAINT event_rsvps_guest_count_range')
    expect(migrationSql).toContain('CHECK (guest_count >= 0 AND guest_count <= 5)')
    expect(migrationSql).toContain('CONSTRAINT event_rsvps_notes_length')
    expect(migrationSql).toContain('event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE')
    expect(migrationSql).toContain('user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
  })

  it('defines handle_event_update_guard and handle_event_rsvp_update_guard triggers', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.handle_event_update_guard()')
    expect(migrationSql).toContain('Field id is immutable on events.')
    expect(migrationSql).toContain('Field created_at is immutable on events.')
    expect(migrationSql).toContain('Field creator_id is immutable on events.')
    expect(migrationSql).toContain('Field group_id cannot be changed once an event is created.')

    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.handle_event_rsvp_update_guard()')
    expect(migrationSql).toContain('Field id is immutable on event RSVPs.')
    expect(migrationSql).toContain('Field created_at is immutable on event RSVPs.')
    expect(migrationSql).toContain('Field event_id is immutable on event RSVPs.')
    expect(migrationSql).toContain('Field user_id is immutable on event RSVPs.')
  })

  it('defines internal helper functions with execute revoked from clients', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.can_view_event(')
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.can_manage_event(')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.can_view_event(UUID, UUID) FROM PUBLIC, anon, authenticated;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.can_manage_event(UUID, UUID) FROM PUBLIC, anon, authenticated;')
  })

  it('defines create_community_event RPC with scope checks, deterministic status handling, and audit log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.create_community_event(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Target community group does not exist or has been archived.')
    expect(migrationSql).toContain('Only group managers or community moderators can post events for this group.')
    expect(migrationSql).toContain('Only community moderators can post global community events.')
    expect(migrationSql).toContain("public.log_audit_event(\n    'ADMIN_ACTION'::public.audit_action,")
    expect(migrationSql).toContain("v_effective_type := COALESCE(p_event_type, 'GENERAL');")
    expect(migrationSql).toContain("v_effective_status := COALESCE(p_status, 'PUBLISHED');")
    expect(migrationSql).toContain("IF v_effective_status = 'PUBLISHED' THEN")
  })

  it('defines update_community_event RPC with organizer check, lifecycle handling, and audit log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.update_community_event(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Only event creator, group managers, or community moderators can update this event.')
    expect(migrationSql).toContain('Cannot reopen a cancelled event whose start time has already passed.')
    expect(migrationSql).toContain("v_effective_type := COALESCE(p_event_type, v_event.event_type);")
    expect(migrationSql).toContain("v_effective_status := COALESCE(p_status, v_event.status);")
  })

  it('defines cancel_community_event RPC with authorization check and audit log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.cancel_community_event(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain("status = 'CANCELLED'")
    expect(migrationSql).toContain('cancelled_at = NOW()')
    expect(migrationSql).toContain('Event is already cancelled.')
  })

  it('defines archive_community_event and delete_community_event RPCs with authorization checks', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.archive_community_event(')
    expect(migrationSql).toContain("status = 'ARCHIVED'")
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.delete_community_event(')
    expect(migrationSql).toContain('deleted_at = NOW()')
  })

  it('defines set_event_rsvp RPC with row-level locking, capacity enforcement, and upsert', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.set_event_rsvp(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('FOR UPDATE;')
    expect(migrationSql).toContain('Cannot RSVP: Event is not open for registration')
    expect(migrationSql).toContain('Cannot RSVP: Event has already started or concluded.')
    expect(migrationSql).toContain('Event capacity exceeded. Available seats:')
    expect(migrationSql).toContain('ON CONFLICT (event_id, user_id) DO UPDATE')
  })

  it('defines cancel_event_rsvp RPC releasing reserved capacity', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.cancel_event_rsvp(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain("status = 'NOT_GOING'")
    expect(migrationSql).toContain('guest_count = 0')
  })

  it('enforces hardened RLS policies denying direct table mutations', () => {
    expect(migrationSql).toContain('ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;')
    expect(migrationSql).toContain('ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;')

    // Direct mutations denied on events
    expect(migrationSql).toContain('CREATE POLICY "events_insert_deny"')
    expect(migrationSql).toContain('CREATE POLICY "events_update_deny"')
    expect(migrationSql).toContain('CREATE POLICY "events_delete_deny"')

    // Direct mutations denied on event_rsvps
    expect(migrationSql).toContain('CREATE POLICY "event_rsvps_insert_deny"')
    expect(migrationSql).toContain('CREATE POLICY "event_rsvps_update_deny"')
    expect(migrationSql).toContain('CREATE POLICY "event_rsvps_delete_deny"')

    // SELECT policies
    expect(migrationSql).toContain('CREATE POLICY "events_select_authenticated"')
    expect(migrationSql).toContain('CREATE POLICY "event_rsvps_select_authenticated"')
    expect(migrationSql).toContain('user_id = auth.uid()')
    expect(migrationSql).toContain('public.can_manage_event(event_id, auth.uid())')
  })

  it('explicitly revokes execute from PUBLIC and anon for all 7 application RPCs', () => {
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.create_community_event(TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INTEGER, public.event_status, BOOLEAN) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.update_community_event(UUID, TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, public.event_status, BOOLEAN) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.cancel_community_event(UUID, TEXT) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.archive_community_event(UUID) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.delete_community_event(UUID) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.set_event_rsvp(UUID, public.event_rsvp_status, INTEGER, TEXT) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.cancel_event_rsvp(UUID) FROM PUBLIC, anon;')
  })

  it('explicitly grants execute to authenticated for all 7 application RPCs', () => {
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.create_community_event(TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INTEGER, public.event_status, BOOLEAN) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.update_community_event(UUID, TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, public.event_status, BOOLEAN) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.cancel_community_event(UUID, TEXT) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.archive_community_event(UUID) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.delete_community_event(UUID) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.set_event_rsvp(UUID, public.event_rsvp_status, INTEGER, TEXT) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.cancel_event_rsvp(UUID) TO authenticated;')
  })

  it('enforces table privileges: anon denied, authenticated select-only', () => {
    expect(migrationSql).toContain('REVOKE ALL ON TABLE public.events FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE ALL ON TABLE public.event_rsvps FROM PUBLIC, anon;')
    expect(migrationSql).toContain('GRANT SELECT ON TABLE public.events TO authenticated;')
    expect(migrationSql).toContain('GRANT SELECT ON TABLE public.event_rsvps TO authenticated;')
  })
})
