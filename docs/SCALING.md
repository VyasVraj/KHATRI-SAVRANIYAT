# docs/SCALING.md

# Scaling Guide

**Product:** Community Roots
**Version:** 0.1.0
**Status:** Phase 0 — Engineering Foundation

---

## Scaling Philosophy

> Scale according to measured bottlenecks. Do not build 50k-scale infrastructure on day one.

Current architecture is designed for ~9,000 concurrent users at initial launch, with a clear path to 25,000–50,000+ without a complete rewrite.

**Scaling priority order:**
1. PostgreSQL query optimization
2. Proper indexes (based on actual query patterns)
3. Pagination and result size limits
4. Connection pooling
5. CDN for static assets
6. Object storage for media
7. Stateless application logic
8. Horizontal application scaling
9. Read replicas if needed
10. Caching (Redis/Upstash) only with measured justification

---

## Current Bottleneck Candidates

| Area | Risk | Mitigation |
|---|---|---|
| Family tree queries | High — recursive relationships | Pagination, lazy loading, materialized paths |
| Community directory search | Medium — full-text scan | PostgreSQL FTS indexes |
| Connection graph queries | Medium | Denormalized counts, batch loading |
| Media serving | Low — offloaded to Supabase Storage + CDN | Already offloaded |
| Auth token validation | Low — JWT verification is fast | Stateless |

---

## Performance Targets (Phase 16)

| Metric | Target |
|---|---|
| p50 API latency | <100ms |
| p95 API latency | <500ms |
| p99 API latency | <1000ms |
| Error rate | <0.1% |
| First Contentful Paint | <1.5s |
| Largest Contentful Paint | <2.5s |

These are engineering goals for Phase 16 load testing validation.

---

## Database Scaling Path

### Phase 0–5 (0–5k users)
- Single Supabase project (Pro plan)
- Optimize queries as written
- Add indexes based on EXPLAIN ANALYZE output

### Phase 6–10 (5k–15k users)
- Review slow query logs
- Add materialized views where appropriate
- Enable PgBouncer connection pooling (Supabase provides this)
- Consider read replicas for search-heavy queries

### Phase 11–16 (15k–50k users)
- Evaluate Supabase Enterprise
- Read replica for reporting and search
- Selective caching (Redis/Upstash) for hot data
- Partitioning for audit_logs and large tables

---

## Frontend Scaling

Already addressed in Phase 0:
- Code splitting via Vite manual chunks
- Lazy-loaded route modules
- TanStack Query caching with configurable stale times
- CDN via Cloudflare Pages

Next steps (Phase 16):
- Image optimization (WebP, lazy loading)
- Virtual list for large datasets
- Service Worker for offline support (if required)

---

## Connection Pooling

Supabase Pro includes PgBouncer. Configure:
- Pool mode: Transaction (for stateless workloads)
- Max client connections: Based on Supabase plan limits
- Default pool size: To be tuned based on load testing results

---

## Never Add These Without Evidence

- Redis cluster
- Multiple backend services
- Kafka / event bus
- Elasticsearch
- Kubernetes
- Complex infrastructure orchestration

Evidence means: measured bottleneck with data, not anticipated bottleneck.
