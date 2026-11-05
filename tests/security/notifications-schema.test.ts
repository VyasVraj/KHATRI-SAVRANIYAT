/**
 * Security & Schema Contract Tests for Notifications Foundation
 *
 * Phase 12 — Subtask 1
 *
 * Verifies that migration 20261016100000_create_notifications_foundation.sql
 * strictly complies with architectural, RLS, least-privilege, and RPC invariants.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20261016100000_create_notifications_foundation.sql'
)

describe('Phase 12 Subtask 1: Notifications Foundation Schema & Security', () => {
  it('migration file exists and is readable', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true)
    const content = fs.readFileSync(MIGRATION_PATH, 'utf-8')
    expect(content.length).toBeGreaterThan(100)
  })

  const content = fs.existsSync(MIGRATION_PATH) ? fs.readFileSync(MIGRATION_PATH, 'utf-8') : ''

  describe('1. Enums Contract', () => {
    it('defines public.notification_category enum with all required values', () => {
      expect(content).toMatch(/CREATE TYPE public\.notification_category AS ENUM/i)
      expect(content).toContain("'CONNECTION'")
      expect(content).toContain("'INVITATION'")
      expect(content).toContain("'CLAIM'")
      expect(content).toContain("'VERIFICATION'")
      expect(content).toContain("'COMMUNITY'")
      expect(content).toContain("'EVENT'")
      expect(content).toContain("'FAMILY'")
      expect(content).toContain("'SECURITY'")
    })

    it('defines public.notification_channel enum with required channels', () => {
      expect(content).toMatch(/CREATE TYPE public\.notification_channel AS ENUM/i)
      expect(content).toContain("'EMAIL'")
      expect(content).toContain("'PUSH'")
    })

    it('defines public.notification_delivery_status enum with required lifecycle states', () => {
      expect(content).toMatch(/CREATE TYPE public\.notification_delivery_status AS ENUM/i)
      expect(content).toContain("'PENDING'")
      expect(content).toContain("'PROCESSING'")
      expect(content).toContain("'SENT'")
      expect(content).toContain("'FAILED'")
      expect(content).toContain("'DEAD_LETTER'")
    })
  })

  describe('2. Tables & Schema Invariants', () => {
    it('creates public.notifications table referencing auth.users and NOT public.persons', () => {
      expect(content).toMatch(/CREATE TABLE IF NOT EXISTS public\.notifications/i)
      expect(content).toMatch(/recipient_id UUID NOT NULL REFERENCES auth\.users\(id\)/i)
      expect(content).toMatch(/actor_id UUID REFERENCES auth\.users\(id\)/i)
      // Must NOT reference public.persons
      expect(content).not.toMatch(/recipient_id.*REFERENCES public\.persons/i)
      expect(content).not.toMatch(/actor_id.*REFERENCES public\.persons/i)
    })

    it('creates public.notification_preferences table with user_id PK referencing auth.users', () => {
      expect(content).toMatch(/CREATE TABLE IF NOT EXISTS public\.notification_preferences/i)
      expect(content).toMatch(/user_id UUID PRIMARY KEY REFERENCES auth\.users\(id\)/i)
    })

    it('creates public.notification_outbox table isolated from client mutations', () => {
      expect(content).toMatch(/CREATE TABLE IF NOT EXISTS public\.notification_outbox/i)
      expect(content).toMatch(/notification_id UUID NOT NULL REFERENCES public\.notifications\(id\)/i)
      expect(content).toMatch(/recipient_id UUID NOT NULL REFERENCES auth\.users\(id\)/i)
    })

    it('enforces title, body, action_url, and metadata constraints on notifications', () => {
      expect(content).toContain('CONSTRAINT notifications_title_length CHECK')
      expect(content).toContain('CONSTRAINT notifications_body_length CHECK')
      expect(content).toContain('CONSTRAINT notifications_metadata_is_object CHECK')
    })
  })

  describe('3. Indexes', () => {
    it('creates partial index for unread notifications', () => {
      expect(content).toMatch(/CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread/i)
      expect(content).toContain('WHERE read_at IS NULL AND deleted_at IS NULL')
    })

    it('creates feed index for paginated inbox', () => {
      expect(content).toMatch(/CREATE INDEX IF NOT EXISTS idx_notifications_recipient_feed/i)
      expect(content).toContain('WHERE deleted_at IS NULL')
    })

    it('creates entity lookup index', () => {
      expect(content).toMatch(/CREATE INDEX IF NOT EXISTS idx_notifications_entity_lookup/i)
    })

    it('creates outbox pending worker index', () => {
      expect(content).toMatch(/CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending/i)
      expect(content).toContain("WHERE status = 'PENDING'")
    })
  })

  describe('4. Immutability Triggers', () => {
    it('implements handle_notification_immutability_guard locking content fields', () => {
      expect(content).toMatch(/FUNCTION public\.handle_notification_immutability_guard/i)
      expect(content).toContain('notification id is immutable')
      expect(content).toContain('notification recipient_id is immutable')
      expect(content).toContain('notification title is immutable')
      expect(content).toContain('notification body is immutable')
      expect(content).toMatch(/CREATE TRIGGER notification_immutability_guard/i)
    })

    it('implements preferences guard auto-updating updated_at', () => {
      expect(content).toMatch(/FUNCTION public\.handle_notification_preferences_guard/i)
      expect(content).toMatch(/CREATE TRIGGER notification_preferences_guard/i)
    })

    it('implements outbox immutability guard', () => {
      expect(content).toMatch(/FUNCTION public\.handle_notification_outbox_guard/i)
      expect(content).toMatch(/CREATE TRIGGER notification_outbox_guard/i)
    })
  })

  describe('5. Row Level Security & Access Control', () => {
    it('enables RLS on notifications, preferences, and outbox', () => {
      expect(content).toMatch(/ALTER TABLE public\.notifications ENABLE ROW LEVEL SECURITY/i)
      expect(content).toMatch(/ALTER TABLE public\.notification_preferences ENABLE ROW LEVEL SECURITY/i)
      expect(content).toMatch(/ALTER TABLE public\.notification_outbox ENABLE ROW LEVEL SECURITY/i)
    })

    it('restricts notifications SELECT to recipient_id = auth.uid() and deleted_at IS NULL', () => {
      expect(content).toMatch(/CREATE POLICY "notifications_select_recipient"/i)
      expect(content).toContain('recipient_id = auth.uid()')
      expect(content).toContain('deleted_at IS NULL')
    })

    it('strictly denies direct client INSERT, UPDATE, and DELETE on notifications', () => {
      expect(content).toMatch(/CREATE POLICY "notifications_insert_deny"/i)
      expect(content).toMatch(/CREATE POLICY "notifications_update_deny"/i)
      expect(content).toMatch(/CREATE POLICY "notifications_delete_deny"/i)
    })

    it('completely denies client SELECT, INSERT, UPDATE, DELETE on notification_outbox', () => {
      expect(content).toMatch(/CREATE POLICY "notification_outbox_select_deny"/i)
      expect(content).toMatch(/CREATE POLICY "notification_outbox_insert_deny"/i)
      expect(content).toMatch(/CREATE POLICY "notification_outbox_update_deny"/i)
      expect(content).toMatch(/CREATE POLICY "notification_outbox_delete_deny"/i)
    })
  })

  describe('6. Least-Privilege Grants', () => {
    it('revokes all access from PUBLIC and anon on all 3 tables', () => {
      expect(content).toMatch(/REVOKE ALL ON public\.notifications FROM PUBLIC, anon/i)
      expect(content).toMatch(/REVOKE ALL ON public\.notification_preferences FROM PUBLIC, anon/i)
      expect(content).toMatch(/REVOKE ALL ON public\.notification_outbox FROM PUBLIC, anon/i)
    })

    it('grants minimum necessary permissions to authenticated role', () => {
      expect(content).toMatch(/GRANT SELECT ON public\.notifications TO authenticated/i)
      expect(content).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.notification_preferences TO authenticated/i)
    })
  })

  describe('7. Authoritative RPCs', () => {
    it('implements mark_notification_read with SECURITY DEFINER and search_path = public', () => {
      expect(content).toMatch(/FUNCTION public\.mark_notification_read/i)
      expect(content).toContain('SECURITY DEFINER')
      expect(content).toContain('SET search_path = public')
      expect(content).toContain('v_updated INTEGER;')
      expect(content).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT;')
      expect(content).toContain('RETURN v_updated > 0;')
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_notification_read.*TO authenticated/i)
      expect(content).toMatch(/REVOKE ALL ON FUNCTION public\.mark_notification_read.*FROM PUBLIC, anon/i)
    })

    it('implements mark_all_notifications_read with category filtering support', () => {
      expect(content).toMatch(/FUNCTION public\.mark_all_notifications_read/i)
      expect(content).toContain('SECURITY DEFINER')
      expect(content).toContain('SET search_path = public')
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_all_notifications_read.*TO authenticated/i)
    })

    it('implements dismiss_notification soft-deleting the item', () => {
      expect(content).toMatch(/FUNCTION public\.dismiss_notification/i)
      expect(content).toContain('SECURITY DEFINER')
      expect(content).toContain('deleted_at = COALESCE(deleted_at, timezone')
      expect(content).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT;')
      expect(content).toContain('RETURN v_updated > 0;')
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.dismiss_notification.*TO authenticated/i)
    })

    it('implements get_unread_notification_count scoped strictly to auth.uid()', () => {
      expect(content).toMatch(/FUNCTION public\.get_unread_notification_count/i)
      expect(content).toContain('recipient_id = v_user_id')
      expect(content).toContain('read_at IS NULL')
      expect(content).toContain('deleted_at IS NULL')
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_unread_notification_count.*TO authenticated/i)
    })

    it('implements get_my_notification_preferences and update_my_notification_preferences', () => {
      expect(content).toMatch(/FUNCTION public\.get_my_notification_preferences/i)
      expect(content).toMatch(/FUNCTION public\.update_my_notification_preferences/i)
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_my_notification_preferences.*TO authenticated/i)
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.update_my_notification_preferences.*TO authenticated/i)
    })
  })

  describe('8. Supabase Realtime Publication', () => {
    it('adds public.notifications to supabase_realtime publication inside guarded block', () => {
      expect(content).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.notifications/i)
    })
  })
})
