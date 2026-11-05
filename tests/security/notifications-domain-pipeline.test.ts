/**
 * Security & Schema Contract Tests for Domain Event Notification Pipeline & Outbox
 *
 * Phase 12 — Subtask 2
 *
 * Verifies that migration 20261016140000_create_notification_domain_pipeline.sql
 * strictly complies with architectural, idempotency, recipient safety,
 * preference, and zero-leakage invariants.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20261016140000_create_notification_domain_pipeline.sql'
)

describe('Phase 12 Subtask 2: Domain Event Notification Pipeline & Outbox', () => {
  it('migration file exists and is readable', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true)
    const content = fs.readFileSync(MIGRATION_PATH, 'utf-8')
    expect(content.length).toBeGreaterThan(100)
  })

  const content = fs.existsSync(MIGRATION_PATH) ? fs.readFileSync(MIGRATION_PATH, 'utf-8') : ''

  describe('1. Idempotency Indexes Contract', () => {
    it('creates partial unique index on notifications (recipient_id, event_key)', () => {
      expect(content).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_event_key/i)
      expect(content).toContain("ON public.notifications (recipient_id, ((metadata->>'event_key')))")
      expect(content).toContain("WHERE (metadata->>'event_key') IS NOT NULL")
    })

    it('creates unique index on notification_outbox (notification_id, channel)', () => {
      expect(content).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_outbox_notification_channel/i)
      expect(content).toContain('ON public.notification_outbox (notification_id, channel)')
    })
  })

  describe('2. Pipeline Helper Function: emit_domain_notification', () => {
    it('defines emit_domain_notification with SECURITY DEFINER and search_path = public', () => {
      expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.emit_domain_notification/i)
      expect(content).toContain('SECURITY DEFINER')
      expect(content).toContain('SET search_path = public')
    })

    it('validates recipient existence in auth.users (PERSON != USER)', () => {
      expect(content).toContain('SELECT EXISTS (')
      expect(content).toContain('FROM auth.users WHERE id = p_recipient_id')
    })

    it('suppresses self-notifications when recipient equals actor', () => {
      expect(content).toContain('IF p_actor_id IS NOT NULL AND p_recipient_id = p_actor_id THEN')
      expect(content).toContain('RETURN NULL;')
    })

    it('inserts notifications using ON CONFLICT DO NOTHING on event_key', () => {
      expect(content).toContain("ON CONFLICT (recipient_id, ((metadata->>'event_key'))) WHERE (metadata->>'event_key') IS NOT NULL")
      expect(content).toContain('DO NOTHING')
      expect(content).toContain('RETURNING id INTO v_notification_id;')
    })

    it('evaluates notification_preferences before queuing into notification_outbox', () => {
      expect(content).toContain('FROM public.notification_preferences')
      expect(content).toContain('WHERE user_id = p_recipient_id')
      expect(content).toContain('v_prefs.email_connections')
      expect(content).toContain('v_prefs.email_invitations')
      expect(content).toContain('v_prefs.email_claims')
      expect(content).toContain('v_prefs.email_verifications')
      expect(content).toContain('v_prefs.email_announcements')
      expect(content).toContain('v_prefs.email_events')
      expect(content).toContain('v_prefs.email_family_media')
    })

    it('guarantees mandatory SECURITY notifications always allow email outbox dispatch', () => {
      expect(content).toContain("WHEN 'SECURITY' THEN v_category_email_allowed := TRUE;")
    })

    it('revokes execute on emit_domain_notification from public, anon, and authenticated', () => {
      expect(content).toMatch(/REVOKE ALL ON FUNCTION public\.emit_domain_notification.*FROM PUBLIC, anon, authenticated/i)
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.emit_domain_notification.*TO postgres, service_role/i)
    })
  })

  describe('3. Domain Triggers & Event Handlers', () => {
    describe('Connections', () => {
      it('creates handle_connection_notification_events and trigger on connections', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_connection_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_connection_notification_events/i)
        expect(content).toContain('AFTER INSERT OR UPDATE ON public.connections')
      })

      it('emits connection_request on INSERT with PENDING status', () => {
        expect(content).toContain("TG_OP = 'INSERT' AND NEW.status = 'PENDING'")
        expect(content).toContain("p_type := 'connection_request'")
        expect(content).toContain("p_event_key := 'connection:' || NEW.id || ':requested'")
      })

      it('emits connection_accepted on UPDATE from PENDING to ACCEPTED', () => {
        expect(content).toContain("TG_OP = 'UPDATE' AND OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED'")
        expect(content).toContain("p_type := 'connection_accepted'")
        expect(content).toContain("p_event_key := 'connection:' || NEW.id || ':accepted'")
      })
    })

    describe('Person Claims', () => {
      it('creates handle_claim_notification_events and trigger on person_claims', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_claim_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_claim_notification_events/i)
        expect(content).toContain('AFTER UPDATE ON public.person_claims')
      })

      it('emits claim_approved when transitioned to APPROVED', () => {
        expect(content).toContain("OLD.status = 'PENDING' AND NEW.status = 'APPROVED'")
        expect(content).toContain("p_type := 'claim_approved'")
        expect(content).toContain("p_event_key := 'claim:' || NEW.id || ':approved'")
      })

      it('emits claim_rejected when transitioned to REJECTED', () => {
        expect(content).toContain("OLD.status = 'PENDING' AND NEW.status = 'REJECTED'")
        expect(content).toContain("p_type := 'claim_rejected'")
        expect(content).toContain("p_event_key := 'claim:' || NEW.id || ':rejected'")
      })
    })

    describe('Invitations', () => {
      it('creates handle_invitation_notification_events and trigger on invitations', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_invitation_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_invitation_notification_events/i)
        expect(content).toContain('AFTER UPDATE ON public.invitations')
      })

      it('notifies inviter (invited_by) upon invitation acceptance', () => {
        expect(content).toContain("OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED'")
        expect(content).toContain('p_recipient_id := NEW.invited_by')
        expect(content).toContain('p_actor_id := NEW.accepted_by')
        expect(content).toContain("p_type := 'invitation_accepted'")
        expect(content).toContain("p_event_key := 'invitation:' || NEW.id || ':accepted'")
      })
    })

    describe('Verification Requests', () => {
      it('creates handle_verification_notification_events and trigger on verification_requests', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_verification_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_verification_notification_events/i)
        expect(content).toContain('AFTER UPDATE ON public.verification_requests')
      })

      it('emits verification_approved when transitioned to APPROVED', () => {
        expect(content).toContain("OLD.status = 'PENDING' AND NEW.status = 'APPROVED'")
        expect(content).toContain("p_type := 'verification_approved'")
        expect(content).toContain("p_event_key := 'verification:' || NEW.id || ':approved'")
      })

      it('emits verification_rejected when transitioned to REJECTED', () => {
        expect(content).toContain("OLD.status = 'PENDING' AND NEW.status = 'REJECTED'")
        expect(content).toContain("p_type := 'verification_rejected'")
        expect(content).toContain("p_event_key := 'verification:' || NEW.id || ':rejected'")
      })
    })

    describe('Community Groups', () => {
      it('creates handle_group_member_notification_events and trigger on group_members', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_group_member_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_group_member_notification_events/i)
        expect(content).toContain('AFTER UPDATE ON public.group_members')
      })

      it('emits group_role_updated when member role changes', () => {
        expect(content).toContain('OLD.role IS DISTINCT FROM NEW.role')
        expect(content).toContain("p_type := 'group_role_updated'")
        expect(content).toContain("p_event_key := 'group_role:' || NEW.group_id || ':' || NEW.user_id || ':' || NEW.role")
      })
    })

    describe('Community Events', () => {
      it('creates handle_event_notification_events on events for cancellation', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_event_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_event_notification_events/i)
        expect(content).toContain('AFTER UPDATE ON public.events')
        expect(content).toContain("OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED'")
        expect(content).toContain("p_type := 'event_cancelled'")
      })

      it('notifies only registered attendees who RSVPd GOING or MAYBE on event cancellation', () => {
        expect(content).toContain('FROM public.event_rsvps')
        expect(content).toContain("status IN ('GOING', 'MAYBE')")
        expect(content).toContain('user_id <> NEW.creator_id')
      })

      it('creates handle_event_rsvp_notification_events on event_rsvps for organizer notification', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_event_rsvp_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_event_rsvp_notification_events/i)
        expect(content).toContain('AFTER INSERT OR UPDATE ON public.event_rsvps')
        expect(content).toContain("NEW.status = 'GOING'")
        expect(content).toContain("p_type := 'event_rsvp'")
      })

      it('includes updated_at timestamp in event_rsvp idempotency key to permit future legitimate GOING transitions', () => {
        expect(content).toContain(
          "p_event_key := 'event_rsvp:' || NEW.event_id || ':' || NEW.user_id || ':going:' || to_char(NEW.updated_at, 'YYYYMMDDHH24MISSUS')"
        )
      })

      describe('RSVP Transition Logic & Idempotency Simulation', () => {
        type RsvpStatus = 'GOING' | 'MAYBE' | 'NOT_GOING'

        interface RsvpRecord {
          eventId: string
          userId: string
          status: RsvpStatus
          updatedAt: string
        }

        function shouldNotifyRsvp(
          op: 'INSERT' | 'UPDATE',
          oldRecord: RsvpRecord | null,
          newRecord: RsvpRecord
        ): { shouldNotify: boolean; eventKey: string | null } {
          const isTransitionIntoGoing =
            (op === 'INSERT' && newRecord.status === 'GOING') ||
            (op === 'UPDATE' && oldRecord !== null && oldRecord.status !== 'GOING' && newRecord.status === 'GOING')

          if (!isTransitionIntoGoing) {
            return { shouldNotify: false, eventKey: null }
          }

          const eventKey = `event_rsvp:${newRecord.eventId}:${newRecord.userId}:going:${newRecord.updatedAt}`
          return { shouldNotify: true, eventKey }
        }

        it('1. INSERT -> GOING triggers notification', () => {
          const res = shouldNotifyRsvp('INSERT', null, {
            eventId: 'event-1',
            userId: 'user-1',
            status: 'GOING',
            updatedAt: '20261016100000000000',
          })
          expect(res.shouldNotify).toBe(true)
          expect(res.eventKey).toBe('event_rsvp:event-1:user-1:going:20261016100000000000')
        })

        it('2. MAYBE -> GOING triggers notification', () => {
          const res = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'MAYBE', updatedAt: '20261016100000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016110000000000' }
          )
          expect(res.shouldNotify).toBe(true)
          expect(res.eventKey).toBe('event_rsvp:event-1:user-1:going:20261016110000000000')
        })

        it('3. NOT_GOING -> GOING triggers notification', () => {
          const res = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'NOT_GOING', updatedAt: '20261016110000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016120000000000' }
          )
          expect(res.shouldNotify).toBe(true)
          expect(res.eventKey).toBe('event_rsvp:event-1:user-1:going:20261016120000000000')
        })

        it('4. GOING -> GOING (e.g. notes change) does NOT trigger notification', () => {
          const res = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016100000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016103000000000' }
          )
          expect(res.shouldNotify).toBe(false)
          expect(res.eventKey).toBeNull()
        })

        it('5. GOING -> MAYBE does NOT trigger notification', () => {
          const res = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016100000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'MAYBE', updatedAt: '20261016104500000000' }
          )
          expect(res.shouldNotify).toBe(false)
          expect(res.eventKey).toBeNull()
        })

        it('6. GOING -> NOT_GOING does NOT trigger notification', () => {
          const res = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016100000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'NOT_GOING', updatedAt: '20261016110000000000' }
          )
          expect(res.shouldNotify).toBe(false)
          expect(res.eventKey).toBeNull()
        })

        it('7. Full Lifecycle (MAYBE -> GOING -> NOT_GOING -> GOING) produces TWO distinct notifications with retry idempotency', () => {
          const generatedEventKeys: string[] = []
          const inAppInbox: Set<string> = new Set()

          function processNotification(eventKey: string): boolean {
            if (inAppInbox.has(eventKey)) {
              return false // De-duplicated by unique index
            }
            inAppInbox.add(eventKey)
            generatedEventKeys.push(eventKey)
            return true
          }

          // Step 1: Initial RSVP as MAYBE
          const step1 = shouldNotifyRsvp('INSERT', null, {
            eventId: 'event-1',
            userId: 'user-1',
            status: 'MAYBE',
            updatedAt: '20261016090000000000',
          })
          expect(step1.shouldNotify).toBe(false)

          // Step 2: User changes MAYBE -> GOING at T1
          const step2 = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'MAYBE', updatedAt: '20261016090000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016100000000000' }
          )
          expect(step2.shouldNotify).toBe(true)
          const inserted2 = processNotification(step2.eventKey!)
          expect(inserted2).toBe(true)

          // Retry of Step 2 (same transition, same timestamp)
          const retryStep2 = processNotification(step2.eventKey!)
          expect(retryStep2).toBe(false) // Safely de-duplicated!

          // Step 3: User changes GOING -> NOT_GOING at T2
          const step3 = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016100000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'NOT_GOING', updatedAt: '20261016110000000000' }
          )
          expect(step3.shouldNotify).toBe(false)

          // Step 4: User re-joins as GOING at T3
          const step4 = shouldNotifyRsvp(
            'UPDATE',
            { eventId: 'event-1', userId: 'user-1', status: 'NOT_GOING', updatedAt: '20261016110000000000' },
            { eventId: 'event-1', userId: 'user-1', status: 'GOING', updatedAt: '20261016140000000000' }
          )
          expect(step4.shouldNotify).toBe(true)
          const inserted4 = processNotification(step4.eventKey!)
          expect(inserted4).toBe(true) // Successfully inserted!

          // Retry of Step 4 (same transition, same timestamp)
          const retryStep4 = processNotification(step4.eventKey!)
          expect(retryStep4).toBe(false) // Safely de-duplicated!

          // Verification: Two genuine GOING transitions produced two notifications
          expect(generatedEventKeys).toEqual([
            'event_rsvp:event-1:user-1:going:20261016100000000000',
            'event_rsvp:event-1:user-1:going:20261016140000000000',
          ])
          expect(inAppInbox.size).toBe(2)
        })
      })
    })

    describe('Family Media & Stories', () => {
      it('creates handle_family_media_notification_events on family_media', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_family_media_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_family_media_notification_events/i)
        expect(content).toContain('AFTER INSERT ON public.family_media')
        expect(content).toContain("p_type := 'family_photo_added'")
      })

      it('notifies registered family members (p.user_id IS NOT NULL, preserving PERSON != USER)', () => {
        expect(content).toContain('FROM public.family_members fm')
        expect(content).toContain('JOIN public.persons p ON p.id = fm.person_id')
        expect(content).toContain('p.user_id IS NOT NULL')
      })

      it('creates handle_family_story_notification_events on family_stories', () => {
        expect(content).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_family_story_notification_events/i)
        expect(content).toMatch(/CREATE TRIGGER trg_family_story_notification_events/i)
        expect(content).toContain('AFTER INSERT ON public.family_stories')
        expect(content).toContain("p_type := 'family_story_added'")
      })
    })
  })

  describe('4. Reliability & Security Guardrails', () => {
    it('does NOT contain silent exception catch blocks (RAISE WARNING / EXCEPTION WHEN OTHERS)', () => {
      expect(content).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i)
      expect(content).not.toMatch(/RAISE\s+WARNING/i)
    })

    it('sets search_path = public on all created functions', () => {
      const functionMatches = content.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) || []
      const searchPathMatches = content.match(/SET search_path = public/g) || []
      expect(functionMatches.length).toBeGreaterThan(0)
      expect(searchPathMatches.length).toBe(functionMatches.length)
    })

    it('uses SECURITY DEFINER on all trigger functions to run authoritatively', () => {
      const functionBlocks = content.split(/CREATE OR REPLACE FUNCTION public\./).slice(1)
      expect(functionBlocks.length).toBeGreaterThan(0)
      for (const block of functionBlocks) {
        expect(block).toContain('SECURITY DEFINER')
      }
    })
  })
})
