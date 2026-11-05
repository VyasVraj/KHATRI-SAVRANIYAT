# docs/DEPLOYMENT.md

# Deployment Guide

**Product:** Community Roots
**Version:** 0.1.0
**Status:** Phase 16 — Production Readiness (Subtask 4)

> **OPERATOR NOTICE:** For step-by-step production release checklists, incident response playbooks, disaster recovery procedures, and dashboard-only configuration instructions, refer to the authoritative [Production Runbook](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/docs/PRODUCTION_RUNBOOK.md).

---

## Target Infrastructure

| Component | Service |
|---|---|
| Frontend hosting | Cloudflare Pages |
| Backend / Database | Supabase (managed) |
| CDN | Cloudflare (via Pages) |
| File storage | Supabase Storage |
| Edge functions | Supabase Edge Functions (Deno) |
| DNS | Cloudflare |
| Bot protection | Cloudflare Turnstile |

---

## Environments

| Environment | Purpose | Supabase Project | Domain |
|---|---|---|---|
| Development | Local development | Local Supabase CLI | `localhost:5173` |
| Staging | Pre-production validation | Separate Supabase project | `<STAGING_DOMAIN>` *(OPERATOR CONFIGURATION REQUIRED)* |
| Production | Live users | Production Supabase project | `<PRODUCTION_DOMAIN>` *(OPERATOR CONFIGURATION REQUIRED)* |

---

## Build

```bash
# Production build
npm run build

# Output is in /dist
```

Build runs:
1. TypeScript compilation (`tsc -b`)
2. Vite build with tree-shaking and manual chunk splitting

---

## Environment Variables

All environment variables must be configured in each deployment environment.

| Variable | Environment | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | All | Yes |
| `VITE_SUPABASE_ANON_KEY` | All | Yes |
| `VITE_APP_ENV` | All | Yes |
| `VITE_APP_NAME` | All | No (default) |

**NEVER set `SUPABASE_SERVICE_ROLE_KEY` in frontend environment variables.**

---

## Cloudflare Pages Setup (Phase 16 Subtask 1)

1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Set environment variables in Cloudflare dashboard (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV`)
5. Configure custom domain (`<PRODUCTION_DOMAIN>` — *DASHBOARD / OPERATOR CONFIGURATION REQUIRED*)
6. Enable Cloudflare WAF rules for rate limiting

---

## Static Hosting Security Headers & Asset Caching

Configured in `public/_headers` (copied automatically to `dist/_headers` on build):

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self';

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache, no-store, must-revalidate
```

---

## SPA Routing & Fallback Rewrite

Configured in `public/_redirects` (copied automatically to `dist/_redirects` on build):

```
/*    /index.html   200
```
This guarantees all non-asset application paths (`/people`, `/families/:id`, `/discover`, `/auth/callback`, etc.) resolve to `/index.html` with HTTP 200 rather than 404.

---

## Production Sourcemaps

Sourcemaps are disabled by default for production builds (`dist/`) in `vite.config.ts` to prevent exposing source code, types, and DB schema details. They can be enabled for internal debugging builds by setting the environment variable `VITE_ENABLE_SOURCEMAP=true`.

---

## Database Migrations in Deployment

### Local Development vs. Production Workflows

- **Local Development:** Migrations are authored, tested, and validated locally via Supabase CLI tooling.
- **Production Deployment:** Schema migrations from `supabase/migrations/` are **deployed manually through the Supabase Dashboard SQL Editor**, executed sequentially in ascending timestamp order with remote verification after each step. Automated `db push` is not used in production.

```bash
# Local development: apply migrations against local Supabase CLI instance
npx supabase db reset

# Regenerate TypeScript types after remote verification:
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```

**RULE:** Never perform ad-hoc structural changes in production. All schema changes must be captured in immutable migrations in `supabase/migrations/` and executed sequentially via the Supabase Dashboard SQL Editor.

---

## Rollback Strategy

### Frontend
- Cloudflare Pages maintains deployment history
- Instant rollback to previous deployment via dashboard

### Database
- Migrations are intentionally additive where possible
- Breaking changes require a new migration (never modify applied migrations)
- Supabase provides point-in-time recovery for database
- Full backup strategy documented in OPERATIONS.md

---

## Pre-Deployment Checklist (Phase 16)

- [ ] All tests pass
- [ ] Type check passes
- [ ] Lint passes
- [ ] Build succeeds locally
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Types regenerated
- [ ] Security headers configured
- [ ] Load test completed
- [ ] Rollback plan documented
