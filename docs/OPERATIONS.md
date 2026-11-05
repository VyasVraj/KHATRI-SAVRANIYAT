# docs/OPERATIONS.md

# Operations Guide

**Product:** Community Roots
**Version:** 0.1.0
**Status:** Phase 16 — Production Readiness (Subtask 4)

> **OPERATOR NOTICE:** For actionable incident response playbooks, notification outbox worker troubleshooting, and release/rollback procedures, see the authoritative [Production Runbook](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/docs/PRODUCTION_RUNBOOK.md).

---

## Database Backups

Supabase provides automatic daily backups on paid plans (Pro and above).

| Plan | Backup Retention | PITR |
|---|---|---|
| Free | 7 days | No |
| Pro | 7 days | Yes (add-on) |
| Team/Enterprise | 30+ days | Yes |

**Recommendation:** Pro plan minimum for production. Enable PITR (Point-In-Time Recovery).

### Backup Verification

A backup that has never been restored must not be assumed reliable.

- Schedule monthly restore tests to a separate project
- Document recovery time from each test
- Update recovery documentation with actual measured times

---

## Monitoring (Phase 16)

### Application

- Error tracking: Sentry (to be configured)
- Performance: Cloudflare Analytics + Supabase Dashboard
- Real User Monitoring: to be evaluated

### Database

- Monitor via Supabase Dashboard:
  - Active connections
  - Query performance (slow queries)
  - Database CPU and memory
  - Index usage
  - RLS policy performance

### Key Alerts to Configure

| Alert | Threshold | Channel |
|---|---|---|
| Error rate spike | >1% 5xx errors | Slack/Email |
| Database CPU | >80% sustained | Slack/Email |
| Database connections | >80% of limit | Slack/Email |
| Auth failure rate | >10% failure rate | Slack/Email |
| Storage usage | >80% quota | Slack/Email |

---

## Observability

Log levels:
- `ERROR` — unexpected failures requiring immediate attention
- `WARN` — degraded state, not immediately critical
- `INFO` — important business events (audit trail supplement)
- `DEBUG` — development only

Never log:
- Passwords
- Tokens or JWTs
- Service-role keys
- Personal information beyond minimal IDs for correlation

---

## Incident Response

1. Identify — what is affected, who is impacted
2. Contain — disable feature or roll back if necessary
3. Investigate — root cause analysis using logs and metrics
4. Remediate — fix and deploy
5. Document — post-incident report
6. Prevent — ADR or process change if systemic

---

## Data Retention

| Data Type | Retention | Notes |
|---|---|---|
| User accounts | Until deletion request | GDPR/privacy compliance required |
| Audit logs | 2+ years | Non-negotiable for compliance |
| Deleted person records | Soft delete, 90 days | Before permanent removal |
| Session tokens | JWT expiry (1 hour) | Auto-managed by Supabase Auth |
| Support requests | 1 year | Review annually |

---

## Disaster Recovery

Recovery Point Objective (RPO): To be defined
Recovery Time Objective (RTO): To be defined

These will be defined and tested in Phase 16.
