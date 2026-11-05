# docs/PRODUCTION_RUNBOOK.md

# Community Roots — Production Operations & Deployment Runbook

**Product:** Community Roots  
**Platform Architecture:** Modular Monolith (Vite + React 18 SPA on Cloudflare Pages; Supabase PostgreSQL + RLS Backend)  
**Document Purpose:** Comprehensive operational procedures, deployment checklists, and incident response playbooks for platform operators.

---

## Table of Contents
1. [Production Architecture & Boundary Overview](#1-production-architecture--boundary-overview)
2. [Environment Variables & Secrets Management](#2-environment-variables--secrets-management)
3. [Cloudflare Pages Deployment & Edge Configuration](#3-cloudflare-pages-deployment--edge-configuration)
4. [Supabase Authentication & SMTP Setup](#4-supabase-authentication--smtp-setup)
5. [Notification Outbox & Background Worker Operations](#5-notification-outbox--background-worker-operations)
6. [Supabase Storage & Bucket Operations](#6-supabase-storage--bucket-operations)
7. [Database Migration Execution & Parity Verification](#7-database-migration-execution--parity-verification)
8. [Release Procedure Checklist](#8-release-procedure-checklist)
9. [Post-Deployment Smoke Test Protocol](#9-post-deployment-smoke-test-protocol)
10. [Rollback Runbooks](#10-rollback-runbooks)
11. [Backup & Disaster Recovery Runbook](#11-backup--disaster-recovery-runbook)
12. [Monitoring & Operational Health Verification](#12-monitoring--operational-health-verification)
13. [Incident Response Playbooks](#13-incident-response-playbooks)
14. [Dashboard-Only Configuration Registry](#14-dashboard-only-configuration-registry)

---

## 1. Production Architecture & Boundary Overview

Community Roots follows a strict **Two-Tier Modular Monolith** architecture:
- **Presentation Tier**: Client-side Single Page Application (SPA) built with Vite, React 18, React Router v7, TanStack Query v5, Tailwind CSS, and Radix UI. Hosted on Cloudflare Pages static edge network.
- **Data & Business Logic Tier**: Supabase Managed PostgreSQL (Postgres 15+). All security invariants, access control boundaries, table privileges, and data integrity guarantees are enforced at the database layer via Row Level Security (RLS), CHECK constraints, triggers, and `SECURITY DEFINER` RPCs.
- **Edge Functions**: Supabase Edge Functions (Deno runtime) for server-to-server operations that cannot be handled directly in the browser (e.g., transactional email outbox dispatching).

### Core Architectural Invariants:
1. **`PERSON ≠ USER`**: Census records (`public.persons`) exist independently of authentication identities (`auth.users`).
2. **Two-Gate Database Access Control**:
   - *Gate 1 (Discretionary Access Control)*: Table-level privileges (`GRANT SELECT, INSERT, UPDATE TO authenticated`).
   - *Gate 2 (Mandatory Access Control)*: Row Level Security (`USING` and `WITH CHECK` clauses).
3. **Public Anon Key Only on Client**: The browser receives only `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` is strictly prohibited from frontend code, build outputs, or client environment variables.

---

## 2. Environment Variables & Secrets Management

### Client Environment Variables (Cloudflare Pages Dashboard)
Configure under **Cloudflare Pages > Settings > Environment variables > Production**:

| Variable Name | Environment | Value Description | Secret? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Production | `https://<prod-project-id>.supabase.co` | Public identifier |
| `VITE_SUPABASE_ANON_KEY` | Production | Supabase anonymous JWT key | Public key (safe for browser) |
| `VITE_APP_ENV` | Production | `production` | Public |
| `VITE_APP_NAME` | Production | `Community Roots` | Public |
| `VITE_ENABLE_SOURCEMAP` | Production | `false` (default) | Public (prevents leaking sourcemaps) |
| `VITE_TURNSTILE_SITE_KEY` | Production | Cloudflare Turnstile public site key | Public (safe for frontend) |

### Backend Secrets (Supabase Dashboard / Edge Functions)
Configure under **Supabase Dashboard > Project Settings > Edge Functions / Secrets**:

| Secret Name | Scope | Description |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only | Bypasses RLS. NEVER expose to client. |
| `NOTIFICATION_WORKER_SECRET`| Edge Functions / Cron | Shared secret authorizing outbox dispatch worker. |
| `RESEND_API_KEY` | Edge Functions only | Production transactional email API key. |
| `NOTIFICATION_FROM_EMAIL` | Edge Functions only | Sender address (e.g. `<NOTIFICATION_SENDER_EMAIL>` — operator configuration required). |
| `APP_BASE_URL` | Edge Functions only | Canonical URL (e.g. `<PRODUCTION_SITE_URL>` — operator configuration required). |

> [!CAUTION]
> **SECRETS HYGIENE:** Never commit secrets to `.env` files, Git commits, PRs, or documentation. Rotate keys immediately if exposed.

---

## 3. Cloudflare Pages Deployment & Edge Configuration

Cloudflare Pages provides frontend static hosting, global CDN caching, and automated SSL termination.

### Build & Project Settings:
- **Framework Preset**: None (or Vite)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node.js Version**: `20.x` or higher (set via `NODE_VERSION: 20` environment variable)

### Repository-Controlled Edge Directives:
Vite copies all static assets from `public/` into `dist/` during compilation. The repository enforces two authoritative edge files:

1. **Static Security Headers (`public/_headers` → `dist/_headers`)**:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Content-Security-Policy`: Restricts scripts and styles to self; allows Supabase API (`https://*.supabase.co`) and Realtime WebSockets (`wss://*.supabase.co`); permits avatar blob/data URLs; forbids framing (`frame-ancestors 'none'`).
   - `Cache-Control`: Sets `public, max-age=31536000, immutable` for `/assets/*`; sets `no-cache, no-store, must-revalidate` for `/index.html`.

2. **SPA Routing Rewrite (`public/_redirects` → `dist/_redirects`)**:
   - `/*  /index.html  200`
   - Directs all deep-link routes (`/people`, `/families/:id`, `/discover`, `/admin`, `/auth/callback`) to the React router entry point rather than returning HTTP 404.

---

## 4. Supabase Authentication & SMTP Setup

> **DASHBOARD / OPERATOR CONFIGURATION REQUIRED**  
> Supabase shared platform default email limits can restrict high-volume verification or password recovery operations. In a production community deployment, a custom SMTP provider is recommended and must be evaluated and verified by the platform operator based on expected user onboarding volumes.

### 4.1. Custom SMTP Configuration (Supabase Dashboard)
Navigate to **Authentication > Email Settings > SMTP Settings**:
- **Enable Custom SMTP**: Toggle `ON` (Operator decision based on target volume)
- **Sender Email**: Dedicated production address (e.g. `<AUTH_SENDER_EMAIL>` — operator configuration required)
- **Sender Name**: `Community Roots`
- **Host**: SMTP server host (e.g. `<SMTP_HOST>` provided by your chosen transactional email vendor)
- **Port**: `587` (TLS) or `465` (SSL)
- **User / Password**: Dedicated SMTP credentials from email provider.

### 4.2. DNS Authentication Records (Domain Registrar / Cloudflare DNS)
To ensure email deliverability and avoid spam filters:
- **SPF**: Add `v=spf1 include:<provider-spf> ~all`
- **DKIM**: Add CNAME or TXT records provided by your SMTP vendor.
- **DMARC**: Add TXT record `v=DMARC1; p=reject; pct=100; rua=mailto:<DMARC_REPORTS_EMAIL>`

### 4.3. URL Configuration (Supabase Dashboard)
Navigate to **Authentication > URL Configuration**:
- **Site URL**: `<PRODUCTION_SITE_URL>` (DASHBOARD / OPERATOR CONFIGURATION REQUIRED)
- **Redirect URLs (Allowed List)**:
  - `<PRODUCTION_SITE_URL>/auth/callback` (Mandatory for email verification)
  - `<PRODUCTION_SITE_URL>/auth/reset-password` (Mandatory for password recovery)
  - `<PRODUCTION_SITE_URL>/**` (Wildcard subdomain if staging/preview domains are used)
  - *Remove `http://localhost:*` entries from production project.*

---

## 5. Notification Outbox & Background Worker Operations

Community Roots uses a database-driven **Transactional Outbox Pattern** to ensure asynchronous notification emails are emitted reliably without blocking database transactions.

### 5.1. Outbox Lifecycle
1. **Domain Mutation**: Triggers fire on business operations (`public.connections`, `public.claims`, etc.).
2. **In-App Delivery**: Notification record inserted into `public.notifications`.
3. **Outbox Queuing**: If recipient user preferences permit, a record is added to `public.notification_outbox` with `status = 'PENDING'`.
4. **Worker Batch Claim**: Background worker calls `public.claim_notification_outbox_batch(p_batch_size, p_max_attempts)` via `service_role`. Rows are claimed with `FOR UPDATE SKIP LOCKED` and transitioned to `status = 'PROCESSING'`.
5. **Dispatch**: Dispatcher calls Resend API.
6. **Resolution**:
   - On success: Calls `public.complete_notification_outbox_delivery(p_outbox_id)` → transitions to `'SENT'`.
   - On error: Calls `public.fail_notification_outbox_delivery(...)` → schedules retry (`status = 'FAILED'`) or moves to `'DEAD_LETTER'` if attempts exceed maximum or error is terminal.

### 5.2. Edge Function Dispatcher
- **Function Path**: `supabase/functions/dispatch-notification-emails/`
- **Trigger**: HTTP POST with `Authorization: Bearer <NOTIFICATION_WORKER_SECRET>`
- **Deployment Command**:
  ```bash
  npx supabase functions deploy dispatch-notification-emails --project-ref <prod-project-id>
  ```

### 5.3. Scheduling / Cron Configuration
> **DASHBOARD / OPERATOR CONFIGURATION REQUIRED**  
> An automated trigger must invoke the Edge Function periodically. Scheduling is not pre-deployed or active in the repository; the operator must configure an execution schedule.
- **Option A (Supabase pg_cron & pg_net — Proposed / Recommended Schedule)**:
  ```sql
  -- Proposed schedule: Run worker every 2 minutes (adjust frequency according to community load)
  SELECT cron.schedule(
    'dispatch-notification-emails-cron',
    '*/2 * * * *',
    $$
    SELECT net.http_post(
      url := 'https://<prod-project-id>.supabase.co/functions/v1/dispatch-notification-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <NOTIFICATION_WORKER_SECRET>'
      ),
      body := '{}'::jsonb
    );
    $$
  );
  ```
- **Option B (External Uptime/Cron Service — Proposed / Recommended)**: Configure a secure HTTP POST ping every 1–2 minutes from Cloudflare Workers, BetterStack, or AWS EventBridge.

### 5.4. Investigating Stuck or Failed Outbox Records
Run in Supabase SQL Editor:
```sql
-- Check outbox queue summary
SELECT status, count(*), min(created_at), max(attempts)
FROM public.notification_outbox
GROUP BY status;

-- Inspect dead-letter failures
SELECT id, recipient_id, attempts, last_error, created_at, scheduled_at
FROM public.notification_outbox
WHERE status = 'DEAD_LETTER'
ORDER BY created_at DESC
LIMIT 25;
```

---

## 6. Supabase Storage & Bucket Operations

Community Roots maintains two private storage buckets configured in SQL migrations:

| Bucket ID | Access | Size Limit | Allowed MIME Types | Purpose |
|---|---|---|---|---|
| `avatars` | **Private** (`public = false`) | 5 MB | JPEG, PNG, WebP, GIF | Person census profile photos |
| `family-media` | **Private** (`public = false`) | 20 MB | JPEG, PNG, WebP, GIF, PDF | Family photos, historical documents |

### Operational Rules:
- **Signed URL Access**: The frontend generates temporary signed URLs via `supabase.storage.from(...).createSignedUrl(...)`. Signed URLs expire after a short cache window.
- **RLS Verification**: Storage objects are governed by RLS on `storage.objects`. Only family members or authorized creators can upload or view media.
- **Orphan Media Handling**: When a person or media item record is deleted, storage objects remain unless explicitly pruned. Operators should review unreferenced bucket objects during routine maintenance.

---

## 7. Database Migration Execution & Parity Verification

### 7.1. Migration Principles
- **Migrations are Immutable**: Once applied to any environment, migration files must NEVER be edited.
- **Sequential Execution**: Migrations must be run in exact chronological timestamp order (`supabase/migrations/`).
- **Transactional Deployment**: Each migration should execute within a transaction where supported.

### 7.2. Established Manual Migration Deployment Procedure
In this repository, schema migrations are deployed via the **Supabase Dashboard SQL Editor** to preserve human verification.

1. **Pre-Deployment Check**:
   - Verify that your local working copy is fully validated (`npm run type-check`, `npm run lint`, `npm run test`).
   - Inspect the migration script for destructive operations (`DROP`, `TRUNCATE`, unindexed constraints).
2. **Execution in Supabase SQL Editor**:
   - Open **Supabase Dashboard > SQL Editor**.
   - Paste the SQL script from `supabase/migrations/YYYYMMDDHHMMSS_*.sql`.
   - Execute the script and verify that the result status is `Success` with zero warnings.
3. **Post-Deployment Verification**:
   - Verify table privileges:
     ```sql
     SELECT grantee, table_name, privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND grantee IN ('authenticated', 'anon');
     ```
   - Verify RLS status on all tables:
     ```sql
     SELECT tablename, rowsecurity
     FROM pg_tables
     WHERE schemaname = 'public';
     ```
     *Every table must have `rowsecurity = true`.*

---

## 8. Release Procedure Checklist

### Phase 1: Pre-Release Verification (Local / CI)
- [ ] Working tree clean of uncommitted debug code.
- [ ] GitHub Actions CI pipeline is GREEN on `main`.
- [ ] `npm run type-check`: 0 errors.
- [ ] `npm run lint`: 0 errors, 0 warnings.
- [ ] `npm run test`: All 2,247+ Vitest unit/integration tests PASS.
- [ ] `npm run test:e2e`: All Playwright smoke tests PASS.
- [ ] `npm run build`: Production bundle builds in `dist/`.
- [ ] Verified sourcemap suppression: zero `.map` files in `dist/`.
- [ ] Verified `dist/_headers` and `dist/_redirects` are present.

### Phase 2: Deployment Execution
- [ ] If database changes are included, apply migrations via Supabase SQL Editor following Section 7.
- [ ] Push approved code to `main` branch (triggers Cloudflare Pages automated build).
- [ ] If Edge Functions changed, deploy via `npx supabase functions deploy`.

### Phase 3: Post-Deployment Smoke Test (Live URL)
- [ ] Execute the Post-Deployment Smoke Protocol (Section 9).
- [ ] Check Supabase Dashboard for query error spikes.
- [ ] Confirm notification outbox is processing without dead-letters.

---

## 9. Post-Deployment Smoke Test Protocol

Perform these verification steps on the configured production domain (`<PRODUCTION_SITE_URL>`):

1. **Security Headers & Fallback**:
   - Open browser DevTools Network tab on `<PRODUCTION_SITE_URL>`.
   - Inspect response headers for `/`: Confirm `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
   - Navigate to `/people` directly in URL bar (deep link): Confirm page renders with HTTP 200 (not 404).
2. **Authentication Flow**:
   - Visit `/auth/sign-in`. Confirm form loads cleanly.
   - Test sign-in with test account. Confirm redirect to `/`.
   - Test sign-out. Confirm redirect to `/auth/sign-in`.
3. **Census & Directory Navigation**:
   - Navigate to `/discover`. Confirm directory search input debounces and results populate.
   - Open a public person detail profile. Confirm information matches privacy boundaries.
4. **Family Tree Rendering**:
   - Open `/people/<id>/tree`. Confirm React Flow canvas renders nodes and edges within bounds.
5. **Storage & Media Delivery**:
   - Confirm avatars and media thumbnails load via temporary signed URLs.
6. **Error Boundary Resilience**:
   - Navigate to a non-existent route (`/random-missing-route`). Confirm custom 404 page renders gracefully with no stack trace or internal database errors exposed.

---

## 10. Rollback Runbooks

### 10.1. Frontend Rollback (Instant)
Cloudflare Pages maintains complete immutable deployment histories:
1. Navigate to **Cloudflare Dashboard > Workers & Pages > Pages > Community Roots > Deployments**.
2. Locate the previous stable deployment.
3. Click the three dots `...` > **Rollback to this deployment**.
4. Rollback executes instantly at the edge (zero downtime, <10 seconds).

### 10.2. Database Rollback Limitations & Strategy
> [!WARNING]
> PostgreSQL does not support automatic down-migrations. Once applied, migrations must be remediated forward.

- **Additive Schema Changes**: If an additive column or table is defective, disable frontend access via rollback or feature flag. Do not execute destructive `DROP COLUMN` immediately if dependent data exists.
- **RPC / Function Rollback**: If an RPC function behaves incorrectly, reapply the previous version of the function definition via Supabase SQL Editor.
- **Data Inconsistencies**: Use Point-In-Time-Recovery (PITR) to restore to a clean timestamp if data corruption occurs.

---

## 11. Backup & Disaster Recovery Runbook

### 11.1. Backup Components & Platform Capabilities
- **Database (PostgreSQL)**:
  - Automated backups are provided according to your Supabase project tier (e.g. daily backups on paid tiers; Point-In-Time-Recovery available as an add-on/tier feature).
  - *Operator Verification*: Operator must inspect the active Supabase project plan to confirm whether PITR is enabled.
- **Object Storage (Avatars & Family Media)**:
  - Supabase Storage objects reside in managed cloud storage buckets (`avatars`, `family-media`).
- **Source Code & Schema Migrations**:
  - Git repository on GitHub (`main` branch) represents authoritative schema state and application source.

### 11.2. Recovery Objectives:
- **Recovery Point Objective (RPO)**: **TO BE CONFIRMED BY PRODUCTION OPERATOR**  
  *(Target: < 5 minutes if Point-In-Time-Recovery is active on the production Supabase plan; otherwise 24 hours via daily automated snapshot).*
- **Recovery Time Objective (RTO)**: **TO BE CONFIRMED BY PRODUCTION OPERATOR**  
  *(Target: < 30 minutes for database restore drill to an alternate project instance).*

### 11.3. Disaster Recovery Restoration Procedure:
1. Navigate to **Supabase Dashboard > Database > Backups**.
2. If PITR is enabled: Select target recovery timestamp (immediately prior to incident).
3. Clone or restore database to the target project instance.
4. Update `VITE_SUPABASE_URL` in Cloudflare Pages environment variables if project ref changed.
5. Trigger frontend redeployment.

---

## 12. Monitoring & Operational Health Verification

### 12.1. Critical Supabase Health Metrics (Dashboard > Reports)
- **Postgres CPU Utilization**: Normal < 30%. Trigger alert if sustained > 80%.
- **Active Connections**: Normal < 50. Trigger alert if sustained > 80% of pool limit.
- **Database Disk IOPS**: Monitor during batch import operations.
- **Cache Hit Ratio**: Target > 99%.

### 12.2. Error Rate Thresholds
- **5xx HTTP Errors**: < 0.1% of all requests.
- **Auth Failure Rate**: < 5% under normal conditions.

---

## 13. Incident Response Playbooks

### Incident 1: Suspected Leaked Secret / Credential
1. **Assess Scope**: Identify which key was exposed (`anon` key vs `service_role` vs SMTP key).
   - If `anon` key: Low immediate risk (anon key is public by design; security is enforced by RLS).
   - If `service_role` key: **CRITICAL EMERGENCY**. Key bypasses all RLS.
2. **Immediate Containment**:
   - Open **Supabase Dashboard > Project Settings > API**.
   - Click **Generate new API keys** (rotates both anon and service_role keys).
   - Update `SUPABASE_SERVICE_ROLE_KEY` in Edge Function secrets immediately.
   - Update `VITE_SUPABASE_ANON_KEY` in Cloudflare Pages and trigger immediate redeployment.

### Incident 2: Malicious Media / Storage Abuse
1. Identify offending account or person ID via `public.audit_logs`.
2. Revoke user session in **Supabase Auth > Users**.
3. Soft-delete offending media record in `public.media_items`.
4. Remove storage object directly via **Supabase Storage Dashboard** or storage API.

### Incident 3: Excessive Email Outbox Growth / Spam Attempt
1. Check `public.notification_outbox` for queue buildup:
   ```sql
   SELECT count(*) FROM public.notification_outbox WHERE status = 'PENDING';
   ```
2. Temporarily pause scheduled cron invocation to halt external email sending.
3. Transition suspicious pending records to dead-letter:
   ```sql
   UPDATE public.notification_outbox
   SET status = 'DEAD_LETTER', last_error = 'Suspended by operator due to volume surge'
   WHERE status = 'PENDING' AND created_at > now() - INTERVAL '1 hour';
   ```
4. Investigate root cause before resuming cron.

---

## 14. Dashboard-Only Configuration Registry

The following configuration settings **cannot** be managed via Git or repository code and require manual configuration in the vendor dashboards prior to launch:

| Category | System | Required Setting | Where to Configure |
|---|---|---|---|
| **Auth** | Supabase | Custom SMTP Provider enabled & verified | Auth > Email Settings > SMTP |
| **Auth** | Supabase | Site URL: `<PRODUCTION_SITE_URL>` | Auth > URL Configuration |
| **Auth** | Supabase | Redirect URLs configured (remove localhost) | Auth > URL Configuration |
| **Hosting** | Cloudflare Pages | Environment variables (`VITE_SUPABASE_URL`, etc.) | Pages > Settings > Environment variables |
| **Hosting** | Cloudflare Pages | Custom Domain attached (`<PRODUCTION_DOMAIN>`) | Pages > Custom domains |
| **Edge Functions**| Supabase | Function Secrets (`RESEND_API_KEY`, worker secret) | Settings > Edge Functions > Secrets |
| **Automation** | Supabase / Cron | Notification worker scheduled invocation | Database > Extensions > pg_cron OR external cron |
| **Backups** | Supabase | Confirm backup tier and PITR status | Database > Backups |

---

*End of Production Operations Runbook. Maintained by Platform Engineering.*
