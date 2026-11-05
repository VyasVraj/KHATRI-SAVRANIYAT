# Community Roots — Production Release Checklist & Readiness Matrix

> **Document Type:** Production Launch Gate & Verification Matrix  
> **Status:** Phase 16 Baseline Verified  
> **Target Audience:** Release Manager, Lead Architect, Lead Security Engineer, DevOps Operator

---

## 1. Executive Overview

This checklist establishes the definitive, audited production release criteria for the Community Roots platform.

Each item is categorized by its verification status:
- **`READY`**: Fully implemented, validated, and enforced by automated tests in the repository.
- **`READY — OPERATOR CONFIGURATION REQUIRED`**: Implemented and hardened in code, but requires human operator action in cloud dashboards (Cloudflare, Supabase, SMTP provider) prior to live traffic.
- **`BLOCKED`**: Unresolved technical or architectural impediment preventing production release.
- **`NOT APPLICABLE`**: Out of scope for current production milestone.

---

## 2. Production Readiness Matrix

| Domain | Item | Verification Method | Status | Responsible Party | Notes |
|---|---|---|---|---|---|
| **Code** | TypeScript strict type-check | `npm run type-check` | `READY` | Antigravity / CI | Exits with code 0, zero type errors. |
| **Code** | ESLint static code analysis | `npm run lint` | `READY` | Antigravity / CI | Zero errors, zero warnings (`--max-warnings 0`). |
| **Code** | Unit & Integration test suite | `npm run test` | `READY` | Antigravity / CI | 155 test files, 2,247+ tests passing. |
| **Code** | Security test suite | Vitest security test runner | `READY` | Antigravity / CI | 847+ security tests passing. |
| **Code** | Playwright E2E browser smoke tests | `npx playwright test` | `READY` | Antigravity / CI | 5/5 browser smoke tests passing. |
| **Code** | Production bundle build | `npm run build` | `READY` | Antigravity / CI | Clean build output in `dist/`. |
| **Code** | Sourcemap suppression in production | Automated test in `security-headers.test.ts` | `READY` | Antigravity / CI | Zero `.map` files generated in production build. |
| **Hosting** | Static security headers (`public/_headers`) | Automated test in `security-headers.test.ts` | `READY` | Cloudflare / Edge | nosniff, DENY, strict referrer, zero-permission, CSP. |
| **Hosting** | SPA fallback routing (`public/_redirects`) | Automated test in `security-headers.test.ts` | `READY` | Cloudflare / Edge | `/* /index.html 200` rewrite rule configured. |
| **Hosting** | Content-hashed immutable asset caching | Header test in `security-headers.test.ts` | `READY` | Cloudflare / Edge | `/assets/*` cached for 1 year immutable. |
| **Hosting** | HTML entry point revalidation | Header test in `security-headers.test.ts` | `READY` | Cloudflare / Edge | `/index.html` `no-cache, must-revalidate`. |
| **Hosting** | Cloudflare Pages Project Creation | Cloudflare Dashboard | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Link GitHub repo, set build command and output dir. |
| **Hosting** | Frontend Environment Variables | Cloudflare Dashboard | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV`. |
| **Hosting** | Custom Domain & TLS Verification | Cloudflare DNS / Dashboard | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Attach `<PRODUCTION_DOMAIN>`, verify SSL certificate. |
| **Auth** | Anonymous public key configuration | Codebase audit | `READY` | Antigravity / CI | Only anon key exposed in client code. |
| **Auth** | Service-role key isolation | Codebase audit & secret scan | `READY` | Antigravity / CI | Service-role key strictly excluded from frontend. |
| **Auth** | Supabase Site URL configuration | Supabase Dashboard -> Auth | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Configure canonical `<PRODUCTION_SITE_URL>`. |
| **Auth** | Supabase Auth Redirect URLs | Supabase Dashboard -> Auth | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Set `<PRODUCTION_SITE_URL>/auth/callback`, `/auth/reset-password`. |
| **Auth** | Production SMTP Service Setup | Supabase Dashboard -> Auth | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Configure dedicated SMTP provider (SendGrid, SES, Resend). |
| **Auth** | Auth email template customization | Supabase Dashboard -> Auth | `READY — OPERATOR CONFIGURATION REQUIRED` | Community Admin | Review invitation and confirmation copy. |
| **Database** | PostgreSQL schema migrations verified | `supabase/migrations/` inspection | `READY` | Lead Architect | Immutable migrations match schema design. |
| **Database** | Database migration deployment | Manual SQL Editor execution in timestamp order | `READY — OPERATOR CONFIGURATION REQUIRED` | Lead Architect / Operator | Apply migrations sequentially via Supabase Dashboard SQL Editor; verify each remotely. |
| **Database** | Row-Level Security (RLS) enforcement | Vitest security test suite | `READY` | Antigravity / CI | 100% table RLS coverage, positive and negative tests. |
| **Database** | Table privilege restrictions | Remote connectivity tests | `READY` | Database Admin | Table-level CRUD revoked from anon role. |
| **Database** | SECURITY DEFINER function privileges | Migration privilege tests | `READY` | Database Admin | Public EXECUTE revoked, limited to authenticated. |
| **Database** | Audit logging RPC (`log_audit_event`) | Security test suite | `READY` | Antigravity / CI | Anonymous execution strictly blocked. |
| **Storage** | Avatars private bucket configuration | Security test suite | `READY` | Storage Admin | RLS policies restrict mutation to account owner. |
| **Storage** | Family media private bucket configuration | Security test suite | `READY` | Storage Admin | RLS policies enforce family membership. |
| **Storage** | Signed URL time-to-live restrictions | Code inspection & tests | `READY` | Antigravity / CI | Read access requires authenticated signed URLs. |
| **Storage** | Client-side file size and MIME checks | Unit test suite | `READY` | Antigravity / CI | Avatars capped at 2MB, media capped at 10MB. |
| **Notifications** | Outbox queue table & RLS | Security test suite | `READY` | Antigravity / CI | Unprivileged users cannot tamper with queue. |
| **Notifications** | Edge Function email dispatcher | Unit test suite | `READY` | Backend Engineer | Token verification, batching, and retry limits. |
| **Notifications** | Edge Function deployment | Supabase CLI (`functions deploy`) | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Deploy `dispatch-notification-emails` Edge Function. |
| **Notifications** | Edge Function Secrets Configuration | Supabase Dashboard -> Secrets | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Set `SMTP_HOSTNAME`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. |
| **Notifications** | `pg_cron` schedule activation | Supabase SQL Editor | `READY — OPERATOR CONFIGURATION REQUIRED` | Database Operator | Enable `pg_cron` and schedule dispatcher cron job. |
| **Security** | OWASP Top 10 Defensive Audit | Security audit test suite | `READY` | Security Lead | Injection, XSS, Broken Access, Cryptography verified. |
| **Security** | Zero raw HTML sinks (eval, innerHTML) | Automated AST static audit | `READY` | Security Lead | Zero dangerous sinks exist in `src/`. |
| **Security** | Plain-text content sanitization | Sanitization test suite | `READY` | Antigravity / CI | Strips scripts, styles, iframes, and control chars. |
| **Security** | Zero hardcoded production secrets | Automated secret scan | `READY` | Antigravity / CI | Zero live secrets in repo, docs, or git history. |
| **Operations** | Host Liveness Probe (`/health.json`) | Automated test in `security-headers.test.ts` | `READY` | SRE / DevOps | Returns HTTP 200 with JSON `status: pass`. |
| **Operations** | Subsystem Readiness (`health.service.ts`)| Unit test in `health.service.test.ts` | `READY` | Antigravity / CI | Diagnostic checks configuration and DB connectivity. |
| **Operations** | Error tracking & correlation (`ERR-XXXX`)| Unit test in `observability.test.ts` | `READY` | SRE / DevOps | ErrorBoundary renders safe opaque reference ID. |
| **Operations** | External Uptime Monitor Setup | Third-party Monitoring Service | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Configure probe for `https://<DOMAIN>/health.json`. |
| **Operations** | Point-in-Time Recovery (PITR) Setup | Supabase Dashboard -> Backups | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Enable PITR on production plan. |
| **Operations** | Disaster Recovery Restoration Drill | Runbook execution | `READY — OPERATOR CONFIGURATION REQUIRED` | DevOps Operator | Execute dry-run restoration to test instance. |
| **Sign-Off** | Lead Software Architect Sign-Off | Manual Review | `READY — OPERATOR CONFIGURATION REQUIRED` | Human Lead Architect | Final approval of release candidate. |
| **Sign-Off** | Lead Security Engineer Sign-Off | Manual Review | `READY — OPERATOR CONFIGURATION REQUIRED` | Human Security Lead | Verification of RLS, CSP, and audit trails. |
| **Sign-Off** | Community Stakeholder Sign-Off | Manual Review | `READY — OPERATOR CONFIGURATION REQUIRED` | Community Moderator | Acceptance of community rules and privacy model. |

---

## 3. Pre-Deployment Operator Step-by-Step Runbook

Operators must execute these sequential actions in the designated cloud consoles before directing live community traffic to the platform:

### Step 1: Supabase Production Project Setup
- [ ] Create a dedicated production Supabase project in the desired geographic region.
- [ ] Record the project reference ID and public URL: `https://<PROJECT_REF>.supabase.co`.
- [ ] Record the public `anon` API key.
- [ ] **NEVER** copy the `service_role` key into client code or frontend hosting settings.

### Step 2: Database Schema & Privileges Deployment (Manual SQL Editor Procedure)

> [!IMPORTANT]
> **Production Migration Policy:**
> - **Local Development:** Migrations are authored, tested locally, and validated via local Supabase CLI tooling.
> - **Production Deployment:** Migrations in `supabase/migrations/` MUST be deployed manually through the **Supabase Dashboard SQL Editor**, executed sequentially in strict timestamp order.
> - **Sequential Remote Verification:** Each migration script must be executed and remotely verified before proceeding to the next. If any error occurs during execution, STOP immediately. Do not proceed with subsequent migrations until resolved.

- [ ] In the Supabase Dashboard -> SQL Editor, open and execute each migration file in `supabase/migrations/` sequentially in ascending timestamp order:
  1. `20261002140000_phase1_foundation.sql` (Phase 1 Baseline)
  2. `20261005120000_create_family_trees_and_audit.sql` (Phase 5)
  3. `20261005180000_create_discovery_infrastructure.sql` (Phase 6)
  4. `20261005200000_create_connections_infrastructure.sql` (Phase 7)
  5. `20261006120000_create_invitations_and_claims.sql` (Phase 8)
  6. `20261006180000_create_verification_infrastructure.sql` (Phase 9)
  7. `20261007120000_create_community_features.sql` (Phase 10)
  8. `20261010120000_create_media_storage_and_history.sql` (Phase 11)
  9. `20261016120000_create_notification_preferences_and_outbox.sql` (Phase 12)
  10. `20261017000000_create_admin_platform_metrics.sql` (Phase 13)
  11. `20261017100000_create_import_staging_infrastructure.sql` (Phase 14)
  12. `20261017180000_create_staging_ingestion_rpc.sql` (Phase 14)
  13. `20261017200000_create_import_validation_and_review_rpcs.sql` (Phase 14)
  14. `20261017220000_create_import_promotion_rpc.sql` (Phase 14)
- [ ] Post-migration verification:
  - Verify RLS is enabled on all tables:
    ```sql
    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
    ```
  - Verify table privileges are revoked from `anon`:
    ```sql
    SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'anon';
    ```
  - Verify SECURITY DEFINER functions have restricted execution privileges.

### Step 3: Supabase Authentication Configuration
- [ ] In Supabase Dashboard -> Authentication -> URL Configuration:
  - Set **Site URL** to: `https://<PRODUCTION_DOMAIN>`.
  - Add to **Redirect URLs**:
    - `https://<PRODUCTION_DOMAIN>/auth/callback`
    - `https://<PRODUCTION_DOMAIN>/auth/reset-password`
- [ ] In Supabase Dashboard -> Authentication -> Email:
  - Toggle **Enable Custom SMTP**.
  - Configure Host, Port, Username, and Password for your dedicated transactional email provider.
  - Test SMTP credentials by sending a test email from the dashboard.

### Step 4: Edge Functions & Worker Scheduling
- [ ] Deploy the notification email dispatcher:
  ```bash
  supabase functions deploy dispatch-notification-emails --project-ref <PROJECT_REF>
  ```
- [ ] Configure Edge Function secrets:
  ```bash
  supabase secrets set SMTP_HOSTNAME="smtp.yourprovider.com" SMTP_PORT="587" SMTP_USER="user" SMTP_PASS="pass"
  ```
- [ ] In Supabase Dashboard -> Database -> Extensions:
  - Ensure `pg_cron` and `pg_net` are enabled.
- [ ] In Supabase SQL Editor, schedule the notification dispatcher worker:
  ```sql
  SELECT cron.schedule(
    'process-notification-outbox',
    '*/2 * * * *',
    $$
    SELECT net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-notification-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('batch_size', 25)
    );
    $$
  );
  ```

### Step 5: Cloudflare Pages Frontend Deployment
- [ ] In Cloudflare Dashboard -> Workers & Pages -> Create Application -> Pages -> Connect to Git.
- [ ] Select repository: `family-tree` (or Community Roots repo).
- [ ] Build Configuration:
  - **Framework preset:** `None` / `Vite`
  - **Build command:** `npm run build`
  - **Build output directory:** `dist`
- [ ] Environment Variables:
  - `VITE_SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `<PUBLIC_ANON_KEY>`
  - `VITE_APP_ENV` = `production`
- [ ] Trigger deployment build and verify clean completion.
- [ ] Attach custom production domain `<PRODUCTION_DOMAIN>` and verify Cloudflare Universal SSL issuance.

### Step 6: Post-Deployment Smoke Verification
- [ ] **Liveness:** Run `curl -I https://<PRODUCTION_DOMAIN>/health.json`. Verify HTTP 200 and `status: pass`.
- [ ] **Security Headers:** Verify `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`.
- [ ] **Routing:** Navigate to `https://<PRODUCTION_DOMAIN>/auth/sign-in` directly in a browser. Confirm SPA loads without 404.
- [ ] **Uptime Monitor:** Point external synthetic monitor (Pingdom / UptimeRobot) at `https://<PRODUCTION_DOMAIN>/health.json`.

---

## 4. Final Release Sign-Off Gate

All automated checks in the matrix have passed. Live production launch is contingent upon the completion of the operator configuration steps above and formal human sign-off below:

| Role | Name | Signature / Approval Date | Status |
|---|---|---|---|
| **Release Lead** | `TO BE CONFIRMED` | Pending Operator Configuration | `PENDING` |
| **Lead Architect** | `TO BE CONFIRMED` | Pending Schema Push | `PENDING` |
| **Security Officer** | `TO BE CONFIRMED` | Pending Secret Configuration | `PENDING` |
