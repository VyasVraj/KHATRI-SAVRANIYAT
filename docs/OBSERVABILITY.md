# Community Roots — Production Observability, Health Checks & Diagnostics

> **Classification:** Production Operational Guide & Engineering Reference  
> **Status:** Phase 16 Baseline Verified  
> **Target Audience:** DevOps Engineers, Platform Administrators, Site Reliability Engineers (SRE)

---

## Table of Contents

1. [Architecture Philosophy & Invariants](#1-architecture-philosophy--invariants)
2. [Liveness vs. Readiness Model](#2-liveness-vs-readiness-model)
3. [Static Host Liveness Probe (`/health.json`)](#3-static-host-liveness-probe-healthjson)
4. [Application Subsystem Readiness (`health.service.ts`)](#4-application-subsystem-readiness-healthservicets)
5. [Triage Guide: Interpreting Health Failures](#5-triage-guide-interpreting-health-failures)
6. [Defensive Error Tracking & Correlation (`ERR-XXXXXXXX`)](#6-defensive-error-tracking--correlation-err-xxxxxxxx)
7. [Observability Integration & Sentry Setup](#7-observability-integration--sentry-setup)
8. [Privacy & Zero-PII Guarantees](#8-privacy--zero-pii-guarantees)

---

## 1. Architecture Philosophy & Invariants

Community Roots is a **privacy-first, community-owned platform** deployed as a static client application on Cloudflare Pages backed by a managed Supabase PostgreSQL instance.

To preserve platform reliability and privacy, all observability, health checks, and diagnostics must adhere to these strict invariants:

1. **Zero Secret Leakage:** Diagnostics and health endpoints never log, format, or return database credentials, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or user passwords.
2. **Zero PII Exposure:** Health monitoring never inspects individual member records, personal contact data, or family relationship structures.
3. **Zero Stack Trace / SQL Exposure to End Users:** Internal PostgreSQL errors, database schema details, and PostgREST payloads are never rendered in client-facing error screens.
4. **Resilient Decoupling:** Temporary database or network degradation must never cause the static application itself to be classified as completely offline.
5. **No Invasive Analytics:** No third-party behavioral trackers, session replay scripts (e.g., FullStory, Hotjar), or fingerprinting libraries are permitted in the client bundle.

---

## 2. Liveness vs. Readiness Model

We strictly distinguish between **Liveness** and **Readiness**:

| Check Type | Meaning | Target Subsystem | Implementation | Primary Consumer |
|---|---|---|---|---|
| **Liveness** | *"Is the application host reachable and serving static assets?"* | Cloudflare Pages CDN Edge | `GET /health.json` | Uptime monitors (Pingdom, UptimeRobot, Cloudflare Health Checks) |
| **Readiness** | *"Is the application properly configured and capable of communicating with backend services?"* | Environment variables, Supabase GoTrue Auth, PostgreSQL PostgREST | `getReadinessReport()` in `health.service.ts` | Release verification scripts, operator diagnostic tools, CI smoke tests |

---

## 3. Static Host Liveness Probe (`/health.json`)

### Endpoint Details
- **Path:** `/health.json`
- **Method:** `GET` or `HEAD`
- **Response Format:** `application/json; charset=utf-8`
- **HTTP Status:** `200 OK`
- **Caching Policy:** `Cache-Control: no-cache, no-store, must-revalidate`

### Response Payload
```json
{
  "status": "pass",
  "version": "0.1.0",
  "service": "community-roots",
  "release": "production",
  "description": "Community Roots Static Web Application"
}
```

### Operational Guidance
External uptime monitoring services (e.g., UptimeRobot, Pingdom, Better Uptime, Datadog Synthetics) should probe `GET https://<PRODUCTION_DOMAIN>/health.json` at 1-minute intervals.
- **Success Criteria:** HTTP 200 with JSON payload containing `"status": "pass"`.
- **Alert Condition:** Non-200 HTTP code, DNS failure, or SSL negotiation timeout.

---

## 4. Application Subsystem Readiness (`health.service.ts`)

Application readiness is evaluated programmatically via [`src/services/health.service.ts`](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/src/services/health.service.ts).

### Diagnostic Scope

```
System Readiness
├── staticAssets        -> Runtime JavaScript context and version compatibility
├── configuration       -> Validates presence, syntax, and protocol of VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
└── backendConnectivity -> Executes a minimal, safe, unauthenticated read against PostgREST/PostgreSQL
```

### Readiness Status Evaluation

- **`ready`**: Static assets, configuration parameters, and Supabase PostgREST connectivity are all passing.
- **`degraded`**: Static assets and configuration are valid, but Supabase connectivity timed out or returned a network fault. The frontend can still render public static views and inform users of scheduled maintenance.
- **`unready`**: Essential configuration parameters (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are missing, invalid, or using unencrypted protocols.

### Sample Readiness Report
```json
{
  "status": "ready",
  "timestamp": "2026-10-19T02:45:00.000Z",
  "version": "0.1.0",
  "environment": "production",
  "subsystems": {
    "staticAssets": {
      "status": "pass",
      "message": "Application runtime environment and static assets operational",
      "details": {
        "version": "0.1.0",
        "clientRuntime": "browser",
        "environment": "production"
      }
    },
    "configuration": {
      "status": "pass",
      "message": "Required environment configuration verified",
      "details": {
        "urlConfigured": true,
        "keyConfigured": true,
        "secureProtocol": true
      }
    },
    "backendConnectivity": {
      "status": "pass",
      "message": "Supabase backend service reachable and responding with active security policies",
      "latencyMs": 42
    }
  }
}
```

---

## 5. Triage Guide: Interpreting Health Failures

| Observed Symptom | Failing Subsystem | Root Cause Analysis | Remediation Action |
|---|---|---|---|
| **`/health.json` returns 521 / 522 / 502** | Static Host Liveness | Cloudflare Pages CDN outage or misconfigured custom domain DNS records. | 1. Check [Cloudflare System Status](https://www.cloudflarestatus.com/).<br>2. Verify DNS CNAME pointing to `<PROJECT>.pages.dev`.<br>3. Inspect Cloudflare Pages deployment dashboard for failed builds. |
| **Readiness status: `unready`** (`configuration: fail`) | Frontend Configuration | Missing or malformed `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` in deployment environment variables. | 1. Open Cloudflare Pages Dashboard -> Settings -> Environment Variables.<br>2. Confirm `VITE_SUPABASE_URL` is set to `https://<PROJECT_REF>.supabase.co`.<br>3. Confirm `VITE_SUPABASE_ANON_KEY` is set to the project's public anon key.<br>4. Trigger a fresh deployment build. |
| **Readiness status: `degraded`** (`backendConnectivity: fail`) | Supabase Connectivity | Network partition, PostgREST service restart, or Supabase project paused. | 1. Check [Supabase Status](https://status.supabase.com/).<br>2. Log into Supabase Dashboard and verify project is active (not paused due to inactivity).<br>3. Test direct REST endpoint via curl:<br>`curl -I -H "apikey: <ANON_KEY>" https://<PROJECT_REF>.supabase.co/rest/v1/` |
| **Backend latency > 1,000ms** | Database Performance | High connection saturation, unindexed concurrent queries, or compute throttling. | 1. Inspect Supabase Dashboard -> Database -> Performance.<br>2. Check active connections vs connection pool limits.<br>3. Verify PgBouncer / Supavisor connection pooling is enabled. |

---

## 6. Defensive Error Tracking & Correlation (`ERR-XXXXXXXX`)

When an unexpected rendering or route lifecycle error occurs, the application captures it through [`ErrorBoundary`](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/src/components/common/ErrorBoundary.tsx) or [`RouteErrorPage`](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/src/features/errors/pages/RouteErrorPage.tsx).

### End-User Experience
Users are shown a sanitized, reassuring interface:
> **"Something went wrong"**  
> *An unexpected display issue occurred. Your data is safe. Please try reloading the page or returning to the home screen.*  
> `Reference: ERR-4B8F1C2E`

### Operator Incident Correlation
- The `ERR-XXXXXXXX` reference code is an **opaque correlation identifier** generated cryptographically on the client.
- When an operator receives a support inquiry mentioning `ERR-4B8F1C2E`, they can search the centralized observability logs (e.g. Sentry or Cloudflare Logpush) for that exact identifier to view the sanitized diagnostic context without having requested screenshots that might expose user data.

---

## 7. Observability Integration & Sentry Setup

Community Roots provides a zero-dependency, defensive observability hook in [`src/lib/observability.ts`](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/src/lib/observability.ts).

### Architecture
To avoid bloating the production client bundle with third-party tracking scripts, the application exposes a global integration hook:
```typescript
window.__CR_OBSERVABILITY_DISPATCHER__?: (diagnostic: SanitizedDiagnostic) => void
```

If unconfigured, the dispatcher remains a safe **no-op** in production.

### Operator Sentry Forwarder (Recommended Template)
If the operating organization uses Sentry, operators can inject an initialization snippet via Cloudflare Pages or HTML head:

```html
<!-- Optional Operator Observability Bootstrap -->
<script>
  (function() {
    // 1. Initialize Sentry (or your preferred platform)
    if (window.Sentry) {
      Sentry.init({
        dsn: "<OPERATOR_SENTRY_DSN>", // OPERATOR CONFIGURATION REQUIRED
        environment: "production",
        tracesSampleRate: 0.1,
        // Enforce privacy: scrub before sending
        beforeSend(event) {
          if (event.request && event.request.headers) {
            delete event.request.headers['Authorization'];
            delete event.request.headers['apikey'];
          }
          return event;
        }
      });

      // 2. Register the Community Roots dispatcher hook
      window.__CR_OBSERVABILITY_DISPATCHER__ = function(diagnostic) {
        Sentry.captureMessage(diagnostic.name + ": " + diagnostic.message, {
          level: "error",
          tags: {
            correlationId: diagnostic.correlationId,
            subsystem: "frontend"
          },
          extra: diagnostic.context
        });
      };
    }
  })();
</script>
```

---

## 8. Privacy & Zero-PII Guarantees

Before any event is passed to `window.__CR_OBSERVABILITY_DISPATCHER__` or printed in developer logs, it is processed through [`sanitizeDiagnosticString`](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/src/lib/observability.ts):

| Sensitive Pattern | Input Example | Sanitized Output |
|---|---|---|
| **JSON Web Tokens (JWT)** | `eyJhbGciOi...` | `[REDACTED_JWT]` |
| **Bearer Tokens** | `Bearer secret-auth-token` | `Bearer [REDACTED_TOKEN]` |
| **Credentials / Passwords** | `password: "AdminPass123!"` | `credential: "[REDACTED]"` |
| **Email Addresses** | `user@example.com` | `[REDACTED_EMAIL]` |
| **Raw SQL Queries** | `SELECT * FROM persons WHERE ...` | `[REDACTED_QUERY]` |
| **Sensitive Context Keys** | `{ authToken: "...", password: "..." }` | `{ authToken: "[REDACTED]", password: "[REDACTED]" }` |

This multi-layer redaction ensures that third-party monitoring platforms never receive user credentials or community member identity details.
