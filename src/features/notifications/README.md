# Notifications Feature Domain

> **Phase 12 — Notifications & Alerting Foundation**

---

## 1. Overview

The **Notifications** feature domain provides secure, server-authoritative alerting and user communication across the Community Roots platform:

1. **Database Schema & Enums (Subtask 1)**:
   - Enums: `notification_category`, `notification_channel`, `notification_delivery_status`.
   - `public.notifications`: In-app notification inbox with immutable metadata, soft-delete capability, and unread tracking.
   - `public.notification_preferences`: Per-user communication channel and category toggle settings.
   - `public.notification_outbox`: Asynchronous queue for external email/push delivery workers.
   - Row Level Security (RLS) enforcing strict recipient isolation.
   - Authoritative `SECURITY DEFINER` RPCs for reading, bulk-reading, dismissing, and updating preferences.
   - Supabase Realtime publication configuration for live in-app badges.

2. **Domain Event Pipeline & Outbox (Subtask 2)**:
   - Automated event generation from domain lifecycle transitions (connections, claims, invitations, verifications, group roles, event cancellations/RSVPs, and family media/stories).
   - Strict database-enforced idempotency via `uq_notifications_recipient_event_key` and `uq_notification_outbox_notification_channel`.
   - Authoritative `emit_domain_notification` helper evaluating `notification_preferences` before queuing external `EMAIL` outbox work.

3. **In-App Notification Center UI (Subtask 3 — COMPLETE)**:
   - Header bell icon with real-time unread badge, popover quick-list, and full `/notifications` center.
   - Live Supabase Realtime channel synchronization invalidating queries without client polling.
   - Accessible category filters, relative timestamps, safe relative URL navigation, mark read, mark all read, and dismiss capabilities.

4. **Preferences & Email Dispatch Infrastructure (Subtask 4 — COMPLETE)**:
   - Dedicated notification preferences management page at `/settings/notifications`.
   - Navigation links in Profile page, user menu dropdown, and Notification Center header.
   - Server-authoritative preference mutations via existing SECURITY DEFINER RPCs.
   - Atomic concurrency-safe outbox claiming with PostgreSQL `FOR UPDATE SKIP LOCKED`.
   - Standalone Supabase Edge Function (`dispatch-notification-emails`) with provider abstractions (Resend, mock, unconfigured fallback), retry semantics, bounded attempts, and dead-letter handling.
   - Strict data minimization in transactional emails (zero sensitive census lineage, address, or phone fields).

5. **Final Hardening & Release (Subtask 5 — COMPLETE)**:
   - End-to-end accessibility, keyboard navigation, focus-visible states, responsive mobile optimization, comprehensive security regression, and release preparation.

---

## 2. Core Architectural Invariants

### 1. `PERSON != USER`
- Notifications, preferences, and outbox records belong strictly to authenticated `auth.users` (`recipient_id` / `user_id`).
- Raw census Person records (`public.persons`) do not have login credentials, devices, or email channels and cannot receive notifications.
- No foreign keys exist linking `notifications` to `public.persons`.

### 2. Server-Authoritative Mutation
- Direct client `INSERT`, `UPDATE`, and `DELETE` on `public.notifications` and `public.notification_outbox` are denied at both RLS and PostgreSQL grant layers.
- Reading and dismissing notifications routes strictly through server-authoritative RPCs (`mark_notification_read`, `mark_all_notifications_read`, `dismiss_notification`).

### 3. Content Immutability
- Once written, notification content fields (`id`, `recipient_id`, `actor_id`, `category`, `type`, `title`, `body`, `action_url`, `entity_type`, `entity_id`, `created_at`) are locked against modification by database trigger `handle_notification_immutability_guard`.

### 4. Privacy-First Projections
- Notification titles and bodies are plain text and bounded in length.
- Notifications never embed sensitive census lineage data, addresses, phone numbers, or dates of birth.

---

## 3. Database Objects (Subtask 1)

### Tables
1. **`public.notifications`**: In-app user inbox.
2. **`public.notification_preferences`**: User channel and category preferences.
3. **`public.notification_outbox`**: External delivery worker queue.

### RPC Functions
- `public.mark_notification_read(p_notification_id UUID) RETURNS BOOLEAN`
- `public.mark_all_notifications_read(p_category public.notification_category DEFAULT NULL) RETURNS INT`
- `public.dismiss_notification(p_notification_id UUID) RETURNS BOOLEAN`
- `public.get_unread_notification_count() RETURNS INT`
- `public.get_my_notification_preferences() RETURNS JSONB`
- `public.update_my_notification_preferences(...) RETURNS JSONB`

---

## 4. Domain Event Pipeline & Outbox Architecture (Subtask 2)

### 4.1 Pipeline Helper: `emit_domain_notification`
Centralized `SECURITY DEFINER` function with `search_path = public`:
1. **Recipient Safety**: Validates recipient exists in `auth.users` (`PERSON != USER`).
2. **Self-Notification Suppression**: Returns `NULL` if `p_recipient_id = p_actor_id`.
3. **Idempotent In-App Delivery**: Uses `ON CONFLICT (recipient_id, ((metadata->>'event_key'))) DO NOTHING` against `public.notifications`.
4. **Preference Evaluation**: Evaluates `public.notification_preferences` for the recipient:
   - If `email_enabled = TRUE` and the category flag is enabled (or `SECURITY`), inserts a `PENDING` row into `public.notification_outbox`.
   - Uses `ON CONFLICT (notification_id, channel) DO NOTHING` to guarantee zero duplicate outbox rows.
5. **Privilege Hardening**: `REVOKE ALL FROM PUBLIC, anon, authenticated`. Executable only by database triggers and `service_role`.

### 4.2 Implemented Domain Event Catalog

| Domain | Event Type | Source Table & Operation | Recipient | Actor | Category | Default Email Pref | Idempotency Key Format |
|---|---|---|---|---|---|---|---|
| Connections | `connection_request` | `connections` (INSERT PENDING) | `addressee_id` | `requester_id` | `CONNECTION` | `email_connections` (TRUE) | `connection:<id>:requested` |
| Connections | `connection_accepted` | `connections` (UPDATE ACCEPTED) | `requester_id` | `addressee_id` | `CONNECTION` | `email_connections` (TRUE) | `connection:<id>:accepted` |
| Claims | `claim_approved` | `person_claims` (UPDATE APPROVED) | `claimant_id` | `reviewed_by` | `CLAIM` | `email_claims` (TRUE) | `claim:<id>:approved` |
| Claims | `claim_rejected` | `person_claims` (UPDATE REJECTED) | `claimant_id` | `reviewed_by` | `CLAIM` | `email_claims` (TRUE) | `claim:<id>:rejected` |
| Invitations | `invitation_accepted`| `invitations` (UPDATE ACCEPTED) | `invited_by` | `accepted_by` | `INVITATION` | `email_invitations` (TRUE) | `invitation:<id>:accepted` |
| Verification | `verification_approved`| `verification_requests` (UPDATE APPROVED)| `requester_id` | `reviewed_by` | `VERIFICATION`| `email_verifications` (TRUE)| `verification:<id>:approved` |
| Verification | `verification_rejected`| `verification_requests` (UPDATE REJECTED)| `requester_id` | `reviewed_by` | `VERIFICATION`| `email_verifications` (TRUE)| `verification:<id>:rejected` |
| Groups | `group_role_updated` | `group_members` (UPDATE role) | `user_id` | `auth.uid()` | `COMMUNITY` | `email_announcements` (FALSE)| `group_role:<group_id>:<user_id>:<role>` |
| Events | `event_cancelled` | `events` (UPDATE CANCELLED) | Confirmed RSVPs | `creator_id` | `EVENT` | `email_events` (TRUE) | `event:<id>:cancelled:<recipient_id>` |
| Events | `event_rsvp` | `event_rsvps` (INSERT/UPDATE GOING) | `creator_id` | `user_id` | `EVENT` | `email_events` (TRUE) | `event_rsvp:<event_id>:<user_id>:going:<updated_at>` |
| Media | `family_photo_added` | `family_media` (INSERT) | Family user members | `uploaded_by` | `FAMILY` | `email_family_media` (FALSE) | `family_media:<id>:<recipient_id>` |
| Stories | `family_story_added` | `family_stories` (INSERT) | Family user members | `author_id` | `FAMILY` | `email_family_media` (FALSE) | `family_story:<id>:<recipient_id>` |

### 4.3 Intentionally Deferred Events & Scalability Boundaries
1. **Global Announcements Mass Fan-Out**: Synchronous 9,000-user per-row inserts inside an OLTP trigger are avoided. Global notices are viewed on the notice board (`/community/announcements`). Asynchronous worker-based mass notification fan-out is reserved for Subtask 4 / background worker infrastructure.
2. **Invitations on Creation**: Invitations target unregistered email addresses. Per `PERSON != USER` rules, in-app notifications require an existing `auth.users` record. Unregistered invitees receive email invitation links directly from the inviter flow (Phase 8).
3. **External Dispatch Execution**: Outbox worker dispatchers (SMTP / Resend / SendGrid) and Push services are explicitly out of scope for Subtask 2. `notification_outbox` rows are staged with status `PENDING` for future worker processing.

---

## 5. In-App Notification Center UI & Real-Time Sync (Subtask 3)

### 5.1 Architecture & Components
1. **`NotificationBell` (`components/NotificationBell.tsx`)**:
   - Header bell icon mounted in `AppHeader.tsx` for both desktop and mobile layouts.
   - Authoritative unread badge (1–99, `99+`, hidden on 0) driven by `useUnreadCount` via `get_unread_notification_count()` RPC.
   - Activates `useNotificationRealtime` to synchronize badge count and open popovers immediately on incoming domain events.
   - Accessible: includes explicit `aria-label`, `aria-expanded`, and `aria-haspopup="dialog"`.

2. **`NotificationPopover` (`components/NotificationPopover.tsx`)**:
   - Quick-access overlay anchored to the header bell displaying recent notifications (top 6).
   - Unread summary counter and "Mark all read" bulk action button.
   - Directs users to the full center at `/notifications` via "View all notifications" link.
   - Dismissible via backdrop click or `Escape` key.

3. **`NotificationItemRow` (`components/NotificationItemRow.tsx`)**:
   - Reusable notification item component supporting compact (popover) and full (page) presentation.
   - Category badge with color-coded Lucide icons (`NotificationCategoryIcon`).
   - Relative timestamps formatted with `formatRelativeTime()`.
   - Visual unread indicators (subtle background highlight and indicator dot).
   - Click-to-read and navigation to `action_url` with validation against open-redirect vulnerabilities (safe relative paths only).
   - Accessible action buttons for marking as read and soft-delete dismissal with `stopPropagation()`.

4. **`NotificationFilters` (`components/NotificationFilters.tsx`)**:
   - Interactive category tabs: "All" plus the 8 domain categories (`CONNECTION`, `INVITATION`, `CLAIM`, `VERIFICATION`, `COMMUNITY`, `EVENT`, `FAMILY`, `SECURITY`).
   - "Unread only" toggle filter.

5. **`NotificationsPage` (`pages/NotificationsPage.tsx`)**:
   - Full-page Notification Center mounted at route `/notifications`.
   - Paginated list (15 items per page) with previous/next controls.
   - Comprehensive empty, loading skeleton, and error retry states.
   - Real-time cache invalidation on new Postgres changes.

### 5.2 Real-Time Synchronization (`hooks/useNotificationRealtime.ts`)
- Establishes a persistent Supabase Realtime channel: `notifications:user_${userId}`.
- Listens to PostgreSQL `*` (INSERT/UPDATE) events on table `public.notifications` filtered by `recipient_id=eq.${userId}`.
- On incoming events, automatically invalidates TanStack Query caches for `['notifications']` without client polling loops.
- Cleans up subscriptions cleanly via `supabase.removeChannel(channel)` on component unmount or logout.

---

## 6. Notification Preferences UI & Email Dispatch Infrastructure (Subtask 4)

### 6.1 Preferences Management Architecture
- **Dedicated Route**: `/settings/notifications` mounted via `NotificationPreferencesPage`.
- **Navigation Touchpoints**:
  - `ProfilePage.tsx`: Dedicated Notification Preferences card with "Manage" link.
  - `AppHeader.tsx`: "Notification Settings" link in both desktop dropdown and mobile menu.
  - `NotificationsPage.tsx`: Header "Preferences" button.
- **Server-Authoritative Synchronization**:
  - `useNotificationPreferences` hook queries `get_my_notification_preferences()` and mutates via `update_my_notification_preferences()`.
  - Scoped strictly to `auth.uid()` (`PERSON != USER`).
  - Master in-app notification center is informational and marked "Always Active".
  - Master email toggle dynamically disables/enables category-specific email toggles.
  - Mandatory security notices card clearly informs users that critical security notices cannot be disabled.

### 6.2 Atomic Outbox Queue Processing (`20261016160000_create_notification_outbox_worker_rpcs.sql`)
1. **`claim_notification_outbox_batch(p_batch_size, p_max_attempts)`**:
   - Concurrency safety: Uses PostgreSQL `FOR UPDATE SKIP LOCKED` inside a Common Table Expression (CTE).
   - Atomically updates claimed rows to `status = 'PROCESSING'` and increments `attempts = attempts + 1`.
   - Projects only necessary recipient and notification details (`title`, `body`, `action_url`, `recipient_email`, `recipient_name`, `category`). Zero sensitive census fields.
2. **`complete_notification_outbox_delivery(p_outbox_id)`**:
   - Sets `status = 'SENT'`, records `sent_at = timezone('utc'::text, now())`, and clears `last_error`.
3. **`fail_notification_outbox_delivery(p_outbox_id, p_error_message, p_is_terminal, p_retry_delay_seconds, p_max_attempts)`**:
   - Bounded retries: Transitions to `DEAD_LETTER` if `p_is_terminal = TRUE` or `attempts >= p_max_attempts`.
   - Exponential backoff: For transient failures, sets `status = 'FAILED'` and reschedules `scheduled_at = now() + (delay || ' seconds')::INTERVAL`.
4. **Least-Privilege Security**:
   - `REVOKE ALL FROM PUBLIC, anon, authenticated` on all 3 worker RPCs.
   - `GRANT EXECUTE TO service_role` exclusively.

### 6.3 Supabase Edge Function (`supabase/functions/dispatch-notification-emails/`)
- **Authentication**: Requires Bearer token matching `SUPABASE_SERVICE_ROLE_KEY` or `NOTIFICATION_WORKER_SECRET` / `CRON_SECRET`.
- **Data Minimization in Emails**: Zero sensitive census person data (no DOB, physical addresses, phone numbers, or lineage).
- **Templates**: Clean responsive HTML and fallback plain text with direct link to manage preferences.
- **Provider Abstraction**:
  - `ResendEmailProvider`: Production transactional API provider via `https://api.resend.com/emails`.
  - `MockEmailProvider`: In-memory test provider capturing sent messages and simulating transient/terminal errors.
  - `UnconfiguredEmailProvider`: Graceful fallback logging safe diagnostics without crashing when `RESEND_API_KEY` is not set.
- **Observability**: Returns JSON summary metrics `{ claimed, sent, transientFailures, terminalFailures, deadLettered, skipped, durationMs, provider }`.

