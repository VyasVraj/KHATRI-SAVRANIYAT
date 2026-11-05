/**
 * Security & Schema Tests: Community Announcements Migration (Phase 10 — Subtask 2)
 * (supabase/migrations/20261007120000_create_community_announcements.sql)
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261007120000_create_community_announcements.sql'
)
const migrationSql = fs.readFileSync(migrationPath, 'utf8')

describe('Community Announcements Migration Static Contract Verification', () => {
  it('migration file exists and is populated', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
    expect(migrationSql.length).toBeGreaterThan(2000)
  })

  it('declares public.announcement_type and public.announcement_status enums with canonical values', () => {
    expect(migrationSql).toMatch(/CREATE TYPE public\.announcement_type AS ENUM/)
    expect(migrationSql).toContain("'GENERAL'")
    expect(migrationSql).toContain("'URGENT'")
    expect(migrationSql).toContain("'EVENT'")
    expect(migrationSql).toContain("'BEREAVEMENT'")
    expect(migrationSql).toContain("'CELEBRATION'")

    expect(migrationSql).toMatch(/CREATE TYPE public\.announcement_status AS ENUM/)
    expect(migrationSql).toContain("'DRAFT'")
    expect(migrationSql).toContain("'PUBLISHED'")
    expect(migrationSql).toContain("'ARCHIVED'")
  })

  it('creates public.announcements table with constraints and PERSON != USER invariant', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.announcements/)
    expect(migrationSql).toContain('CONSTRAINT announcements_title_length')
    expect(migrationSql).toContain('CONSTRAINT announcements_content_length')
    expect(migrationSql).toContain('group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE')
    expect(migrationSql).toContain('author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(migrationSql).toContain('is_pinned BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migrationSql).toContain('published_at TIMESTAMPTZ')
    expect(migrationSql).toContain('deleted_at TIMESTAMPTZ')
  })

  it('defines handle_announcement_update_guard trigger to protect immutable fields', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.handle_announcement_update_guard()')
    expect(migrationSql).toContain('Field id is immutable on announcements.')
    expect(migrationSql).toContain('Field created_at is immutable on announcements.')
    expect(migrationSql).toContain('Field author_id is immutable on announcements.')
    expect(migrationSql).toContain('Field group_id cannot be changed once an announcement is created.')
    expect(migrationSql).toContain('CREATE TRIGGER announcements_update_guard')
    expect(migrationSql).toContain('BEFORE UPDATE ON public.announcements')
  })

  it('defines create_community_announcement RPC with scope checks, deterministic status handling, and audit log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.create_community_announcement(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Target community group does not exist or has been archived.')
    expect(migrationSql).toContain('Only group administrators or community moderators can post announcements for this group.')
    expect(migrationSql).toContain('Only community moderators can post global community announcements.')
    expect(migrationSql).toContain("public.log_audit_event(\n    'ADMIN_ACTION'::public.audit_action,")

    // Effective attributes computed upfront
    expect(migrationSql).toContain("v_effective_type := COALESCE(p_announcement_type, 'GENERAL');")
    expect(migrationSql).toContain("v_effective_status := COALESCE(p_status, 'PUBLISHED');")
    expect(migrationSql).toContain('v_effective_pinned := COALESCE(p_is_pinned, FALSE);')
    expect(migrationSql).toContain("IF v_effective_status = 'PUBLISHED' THEN")
  })

  it('defines update_community_announcement RPC with authorization check, lifecycle transitions, and audit log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.update_community_announcement(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Only the announcement author, group administrators, or community moderators can update this announcement.')
    expect(migrationSql).toContain('Only community moderators can update global community announcements.')

    // Lifecycle transitions and effective attributes
    expect(migrationSql).toContain('v_effective_type := COALESCE(p_announcement_type, v_announcement.announcement_type);')
    expect(migrationSql).toContain('v_effective_status := COALESCE(p_status, v_announcement.status);')
    expect(migrationSql).toContain('v_effective_pinned := COALESCE(p_is_pinned, v_announcement.is_pinned);')
    expect(migrationSql).toContain("IF v_effective_status = 'PUBLISHED' AND v_published_at IS NULL THEN")
    expect(migrationSql).toContain('ARCHIVED -> PUBLISHED: reopening an archived announcement is permitted')
  })

  it('defines archive_community_announcement RPC with authorization check and audit log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.archive_community_announcement(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain("status = 'ARCHIVED'")
    expect(migrationSql).toContain('Only the author, group managers, or community moderators can archive this announcement.')
  })

  it('defines delete_community_announcement RPC performing safe soft-deletion', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.delete_community_announcement(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('deleted_at = NOW()')
    expect(migrationSql).toContain('Only the author, group administrators, or community moderators can delete this announcement.')
  })

  it('enforces hardened RLS policies denying direct table mutations', () => {
    expect(migrationSql).toContain('ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;')

    // Direct INSERT denied
    expect(migrationSql).toContain('CREATE POLICY "announcements_insert_deny"')
    expect(migrationSql).toContain('WITH CHECK (FALSE);')

    // Direct UPDATE denied
    expect(migrationSql).toContain('CREATE POLICY "announcements_update_deny"')
    expect(migrationSql).toContain('WITH CHECK (FALSE);')

    // Direct DELETE denied
    expect(migrationSql).toContain('CREATE POLICY "announcements_delete_deny"')
    expect(migrationSql).toContain('USING (FALSE);')

    // SELECT policy
    expect(migrationSql).toContain('CREATE POLICY "announcements_select_authenticated"')
    expect(migrationSql).toContain('group_id IS NULL')
  })

  it('explicitly revokes execute from PUBLIC and anon for all 4 application RPCs', () => {
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.create_community_announcement(TEXT, TEXT, public.announcement_type, UUID, public.announcement_status, BOOLEAN) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.update_community_announcement(UUID, TEXT, TEXT, public.announcement_type, public.announcement_status, BOOLEAN) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.archive_community_announcement(UUID) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.delete_community_announcement(UUID) FROM PUBLIC, anon;')
  })

  it('explicitly grants execute to authenticated for all 4 application RPCs', () => {
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.create_community_announcement(TEXT, TEXT, public.announcement_type, UUID, public.announcement_status, BOOLEAN) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.update_community_announcement(UUID, TEXT, TEXT, public.announcement_type, public.announcement_status, BOOLEAN) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.archive_community_announcement(UUID) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.delete_community_announcement(UUID) TO authenticated;')
  })

  it('enforces table privileges: anon denied, authenticated select-only', () => {
    expect(migrationSql).toContain('REVOKE ALL ON TABLE public.announcements FROM PUBLIC, anon;')
    expect(migrationSql).toContain('GRANT SELECT ON TABLE public.announcements TO authenticated;')
  })
})
