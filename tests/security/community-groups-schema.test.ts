/**
 * Security & Schema Tests: Community Groups Migration (Phase 10 — Subtask 1)
 * (supabase/migrations/20261007100000_create_community_groups.sql)
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261007100000_create_community_groups.sql'
)
const migrationSql = fs.readFileSync(migrationPath, 'utf8')

describe('Community Groups Migration Static Contract Verification', () => {
  it('migration file exists and is populated', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
    expect(migrationSql.length).toBeGreaterThan(2000)
  })

  it('declares public.group_type and public.group_role enums with canonical values', () => {
    expect(migrationSql).toMatch(/CREATE TYPE public\.group_type AS ENUM/)
    expect(migrationSql).toContain("'VILLAGE_ASSOCIATION'")
    expect(migrationSql).toContain("'COMMITTEE'")
    expect(migrationSql).toContain("'CULTURAL'")
    expect(migrationSql).toContain("'YOUTH'")
    expect(migrationSql).toContain("'OTHER'")

    expect(migrationSql).toMatch(/CREATE TYPE public\.group_role AS ENUM/)
    expect(migrationSql).toContain("'ADMIN'")
    expect(migrationSql).toContain("'MODERATOR'")
    expect(migrationSql).toContain("'MEMBER'")
  })

  it('creates public.groups table with name, slug, and privacy constraints', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.groups/)
    expect(migrationSql).toContain('CONSTRAINT groups_name_not_empty')
    expect(migrationSql).toContain('CONSTRAINT groups_slug_format')
    expect(migrationSql).toContain('CONSTRAINT groups_slug_unique')
    expect(migrationSql).toContain('is_verified BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migrationSql).toContain('is_private BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migrationSql).toContain('deleted_at TIMESTAMPTZ')
  })

  it('creates public.group_members table with unique (group_id, user_id) invariant', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.group_members/)
    expect(migrationSql).toContain('CONSTRAINT uq_group_member')
    expect(migrationSql).toContain('UNIQUE (group_id, user_id)')
    expect(migrationSql).toContain('group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE')
    expect(migrationSql).toContain('user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
  })

  it('defines handle_group_update_guard trigger to protect immutable fields and verification', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.handle_group_update_guard()')
    expect(migrationSql).toContain('Field id is immutable on groups.')
    expect(migrationSql).toContain('Field created_at is immutable on groups.')
    expect(migrationSql).toContain('Field created_by is immutable on groups.')
    expect(migrationSql).toContain('public.is_community_moderator()')
    expect(migrationSql).toContain('Only community moderators can modify group verification status.')
  })

  it('defines handle_group_member_delete_guard trigger to protect sole admin from removal/deletion', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.handle_group_member_delete_guard()')
    expect(migrationSql).toContain('Sole group administrator cannot be removed or leave an active group.')
    expect(migrationSql).toContain('CREATE TRIGGER group_members_delete_guard')
    expect(migrationSql).toContain('BEFORE DELETE ON public.group_members')
  })

  it('defines handle_group_member_update_guard trigger to protect sole admin from demotion', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.handle_group_member_update_guard()')
    expect(migrationSql).toContain('Cannot demote the sole administrator of an active group.')
    expect(migrationSql).toContain('CREATE TRIGGER group_members_update_guard')
    expect(migrationSql).toContain('BEFORE UPDATE ON public.group_members')
  })

  it('defines create_community_group RPC with atomic admin membership creation and audit log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.create_community_group(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain("INSERT INTO public.group_members (\n    group_id,\n    user_id,\n    role,\n    joined_at\n  ) VALUES (\n    v_group_id,\n    v_caller,\n    'ADMIN',")
    expect(migrationSql).toContain("public.log_audit_event(\n    'ADMIN_ACTION'::public.audit_action,")
  })

  it('defines join_community_group RPC preventing duplicate joins, private group bypass, and forcing MEMBER role', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.join_community_group(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Cannot directly join a private group.')
    expect(migrationSql).toContain('User is already a member of this group.')
    expect(migrationSql).toContain("'MEMBER'")
  })

  it('defines leave_community_group RPC preventing sole admin from leaving via delete guard', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.leave_community_group(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('DELETE FROM public.group_members')
    expect(migrationSql).toContain('handle_group_member_delete_guard validates sole-admin invariant')
  })

  it('defines add_group_member RPC preventing unauthorized role escalation', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.add_group_member(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Unauthorized: Only group managers or community moderators can add members.')
    expect(migrationSql).toContain('User is already a member of this group.')
  })

  it('defines remove_group_member RPC guarded by admin or moderator check', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.remove_group_member(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Only group administrators or community moderators can remove members.')
  })

  it('defines update_group_member_role RPC guarded by admin or moderator check', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.update_group_member_role(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Only a group administrator or community moderator can update member roles.')
  })

  it('defines archive_community_group RPC for soft-deleting groups', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.archive_community_group(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Only a group administrator or community moderator can archive a group.')
    expect(migrationSql).toContain('deleted_at = NOW()')
  })

  it('defines verify_community_group RPC guarded strictly by is_community_moderator()', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.verify_community_group(')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('public.is_community_moderator()')
    expect(migrationSql).toContain('Only community moderators can verify groups.')
  })

  it('defines non-recursive SECURITY DEFINER RLS helper functions', () => {
    // is_group_member helper
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.is_group_member(')
    expect(migrationSql).toContain('RETURNS BOOLEAN\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = public')

    // is_group_admin helper
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.is_group_admin(')
    expect(migrationSql).toContain('RETURNS BOOLEAN\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = public')

    // can_view_group helper
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.can_view_group(')
    expect(migrationSql).toContain('RETURNS BOOLEAN\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public')
  })

  it('enforces hardened RLS policies without recursive cross-table queries', () => {
    expect(migrationSql).toContain('ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;')
    expect(migrationSql).toContain('ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;')

    // Non-recursive SELECT policy on groups using is_group_member helper
    expect(migrationSql).toContain('CREATE POLICY "groups_select_authenticated"')
    expect(migrationSql).toContain('public.is_group_member(id, auth.uid())')

    // Non-recursive UPDATE policy on groups using is_group_admin helper
    expect(migrationSql).toContain('CREATE POLICY "groups_update_admin"')
    expect(migrationSql).toContain('public.is_group_admin(id, auth.uid())')

    // Non-recursive SELECT policy on group_members using can_view_group helper
    expect(migrationSql).toContain('CREATE POLICY "group_members_select_authenticated"')
    expect(migrationSql).toContain('public.can_view_group(group_id, auth.uid())')

    // Verify neither SELECT policy contains a direct subquery against the other table
    // groups_select_authenticated should not do SELECT 1 FROM public.group_members
    const groupsSelectPolicyMatch = migrationSql.match(/CREATE POLICY "groups_select_authenticated"[\s\S]*?;/)
    expect(groupsSelectPolicyMatch?.[0]).not.toContain('FROM public.group_members')

    // group_members_select_authenticated should not do SELECT 1 FROM public.groups
    const groupMembersSelectPolicyMatch = migrationSql.match(/CREATE POLICY "group_members_select_authenticated"[\s\S]*?;/)
    expect(groupMembersSelectPolicyMatch?.[0]).not.toContain('FROM public.groups')

    // Direct INSERT on groups denied
    expect(migrationSql).toContain('CREATE POLICY "groups_insert_deny"')
    expect(migrationSql).toContain('WITH CHECK (FALSE);')

    // Direct DELETE on groups denied
    expect(migrationSql).toContain('CREATE POLICY "groups_delete_deny"')
    expect(migrationSql).toContain('USING (FALSE);')

    // Direct INSERT on group_members denied
    expect(migrationSql).toContain('CREATE POLICY "group_members_insert_deny"')
    expect(migrationSql).toContain('WITH CHECK (FALSE);')

    // Direct UPDATE on group_members denied
    expect(migrationSql).toContain('CREATE POLICY "group_members_update_deny"')
    expect(migrationSql).toContain('WITH CHECK (FALSE);')

    // Direct DELETE on group_members denied
    expect(migrationSql).toContain('CREATE POLICY "group_members_delete_deny"')
    expect(migrationSql).toContain('USING (FALSE);')
  })

  it('explicitly revokes execute on internal RLS helpers from PUBLIC, anon, AND authenticated', () => {
    // Revocation from PUBLIC, anon, and authenticated
    expect(migrationSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) FROM PUBLIC, anon, authenticated;'
    )
    expect(migrationSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) FROM PUBLIC, anon, authenticated;'
    )
    expect(migrationSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.can_view_group(UUID, UUID) FROM PUBLIC, anon, authenticated;'
    )

    // Ensure none of the internal helpers are granted execute to authenticated
    expect(migrationSql).not.toContain('GRANT EXECUTE ON FUNCTION public.is_group_member')
    expect(migrationSql).not.toContain('GRANT EXECUTE ON FUNCTION public.is_group_admin')
    expect(migrationSql).not.toContain('GRANT EXECUTE ON FUNCTION public.can_view_group')
  })

  it('explicitly revokes execute from PUBLIC and anon for all 8 authoritative application RPCs', () => {
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.create_community_group(TEXT, TEXT, TEXT, public.group_type, TEXT, BOOLEAN) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.join_community_group(UUID) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.leave_community_group(UUID) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.add_group_member(UUID, UUID, public.group_role) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.update_group_member_role(UUID, UUID, public.group_role) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.archive_community_group(UUID) FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.verify_community_group(UUID, BOOLEAN) FROM PUBLIC, anon;')
  })

  it('explicitly grants execute to authenticated for all 8 authoritative application RPCs', () => {
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.create_community_group(TEXT, TEXT, TEXT, public.group_type, TEXT, BOOLEAN) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.join_community_group(UUID) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.leave_community_group(UUID) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.add_group_member(UUID, UUID, public.group_role) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.update_group_member_role(UUID, UUID, public.group_role) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.archive_community_group(UUID) TO authenticated;')
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.verify_community_group(UUID, BOOLEAN) TO authenticated;')
  })

  it('enforces table privileges: anon denied, authenticated restricted', () => {
    expect(migrationSql).toContain('REVOKE ALL ON TABLE public.groups FROM PUBLIC, anon;')
    expect(migrationSql).toContain('REVOKE ALL ON TABLE public.group_members FROM PUBLIC, anon;')

    expect(migrationSql).toContain('GRANT SELECT, UPDATE ON TABLE public.groups TO authenticated;')
    expect(migrationSql).toContain('GRANT SELECT ON TABLE public.group_members TO authenticated;')
  })
})
