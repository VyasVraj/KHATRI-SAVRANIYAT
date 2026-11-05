# docs/THREAT_MODEL.md

# Threat Model

**Product:** Community Roots
**Version:** 0.1.0
**Status:** Phase 0 — Engineering Foundation

This is a living document. Update as new attack surfaces are identified.

---

## Assets to Protect

| Asset | Sensitivity | Notes |
|---|---|---|
| User credentials | Critical | Authentication tokens, passwords |
| Personal information | High | Name, DOB, contact details |
| Family relationship data | High | Could enable social engineering |
| Location data | High | Home addresses |
| Verification records | High | Administrative trust |
| Audit logs | Medium | Must not be tampered with |
| Family tree structure | Medium | Potentially sensitive relationships |
| Community directory | Medium | Aggregated personal data |
| Media (photos, documents) | Medium | Personal family content |

---

## Threat Actors

| Actor | Motivation | Capability |
|---|---|---|
| Unauthenticated attacker | Data harvesting, enumeration | Low–Medium |
| Authenticated malicious member | IDOR, data access | Medium |
| Compromised account | Account takeover consequences | Medium |
| Malicious admin | Privilege abuse | High |
| Automated bot | Fake registrations, spam | Medium |
| Scraper | Community data harvesting | Low–Medium |

---

## Threats and Mitigations

### T1: SQL Injection
- **Surface:** All database queries
- **Mitigation:** Supabase client uses parameterized queries. Never use string concatenation in queries.

### T2: Cross-Site Scripting (XSS)
- **Surface:** User-rendered content
- **Mitigation:** React escapes by default. No `dangerouslySetInnerHTML`. Content Security Policy headers.

### T3: Insecure Direct Object Reference (IDOR)
- **Surface:** Any resource accessed by ID
- **Mitigation:** Row Level Security in PostgreSQL enforces ownership and access before any data is returned.

### T4: Broken Access Control
- **Surface:** All data operations
- **Mitigation:** RLS policies on every exposed table. Frontend route guards are UX only — never relied upon for security.

### T5: Privilege Escalation
- **Surface:** Role management, admin functions
- **Mitigation:** Role changes require existing admin authorization enforced at DB level. Audit log all role changes.

### T6: Fake Account Registration
- **Surface:** Registration flow
- **Mitigation:** Email verification, rate limiting, Cloudflare Turnstile (Phase 2+).

### T7: Brute Force / Credential Stuffing
- **Surface:** Authentication
- **Mitigation:** Supabase Auth rate limiting, account lockout, strong password policy.

### T8: Bot Abuse
- **Surface:** Registration, connection requests, search
- **Mitigation:** Rate limiting, Cloudflare Turnstile, behavioral analysis.

### T9: Data Leakage via API
- **Surface:** All Supabase queries
- **Mitigation:** RLS ensures the anon key never returns data the authenticated user is not authorized to see.

### T10: Malicious File Uploads
- **Surface:** Avatar, media, document uploads
- **Mitigation:** Server-side MIME validation, file size limits, extension checks. Supabase Storage policies. Never trust client-provided MIME.

### T11: Session Theft
- **Surface:** Auth tokens
- **Mitigation:** Supabase handles JWT rotation. HTTPS enforced in production. HttpOnly cookies where supported.

### T12: Unauthorized Family Access
- **Surface:** Family tree, household data
- **Mitigation:** Family membership checked in RLS policies. Privacy levels enforced before data is returned.

### T13: Admin Abuse
- **Surface:** Administrative actions
- **Mitigation:** Audit logging of all administrative actions. Principle of least privilege. Super-admin actions require additional confirmation.

### T14: Duplicate Account / Identity Fraud
- **Surface:** Registration
- **Mitigation:** Duplicate detection (Phase 9). Community verification workflow. Claims require evidence.

### T15: Scraped Community Directory
- **Surface:** Public/Community-level search
- **Mitigation:** Rate limiting, pagination, privacy enforcement. Never return contact details without appropriate connection.

---

## Security Controls Matrix

| Control | Implementation | Phase |
|---|---|---|
| Authentication | Supabase Auth | Phase 2 |
| Authorization | PostgreSQL RLS | Phase 1+ |
| Input validation (UX) | Zod + React Hook Form | Phase 2+ |
| Input validation (security) | DB constraints + RLS | Phase 1+ |
| Rate limiting | Supabase + CF WAF | Phase 2+ |
| Bot protection | Cloudflare Turnstile | Phase 2+ |
| Audit logging | audit_logs table | Phase 1+ |
| File upload security | Storage policies + MIME validation | Phase 11 |
| Secure headers | Deployment (CF Pages) | Phase 16 |

---

## Residual Risks

| Risk | Notes |
|---|---|
| Supabase platform trust | Supabase is a managed service. Review their SOC2/security docs. |
| Social engineering | Platform cannot fully prevent offline social engineering |
| Insider threat | Admin abuse mitigated by audit logs but not eliminated |
