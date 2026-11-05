# docs/ADR_INDEX.md

# Architecture Decision Records — Index

Architecture Decision Records (ADRs) document significant technical decisions, their context, alternatives considered, and rationale.

## ADR Lifecycle

```
DISCOVERED → UNDER REVIEW → APPROVED → IMPLEMENTED → VERIFIED → FROZEN
```

## When to Create an ADR

Create an ADR for decisions involving:
- Database architecture choices
- Authentication and authorization approaches
- Major dependency additions
- Infrastructure decisions
- Service extraction
- Major API changes
- Major migrations
- Scaling architecture decisions

Do NOT create ADRs for trivial implementation details.

---

## ADR Registry

| ID | Title | Status | Date | Phase |
|---|---|---|---|---|
| ADR-001 | Modular Monolith Architecture | IMPLEMENTED | 2024-10-02 | 0 |
| ADR-002 | Supabase as Backend Platform | IMPLEMENTED | 2024-10-02 | 0 |
| ADR-003 | React + Vite + TypeScript Frontend | IMPLEMENTED | 2024-10-02 | 0 |
| ADR-004 | Feature-Based Directory Structure | IMPLEMENTED | 2024-10-02 | 0 |
| ADR-005 | PERSON != USER Domain Separation at DB Level | IMPLEMENTED | 2026-10-02 | 1 |
| ADR-006 | 5-Level Privacy Model (RLS-enforced) | IMPLEMENTED | 2026-10-02 | 1 |
| ADR-007 | Append-Only Audit Log Architecture | IMPLEMENTED | 2026-10-02 | 1 |

---

## ADR-001: Modular Monolith Architecture

**Status:** IMPLEMENTED
**Date:** 2024-10-02
**Phase:** 0

### Context
The system needs to serve ~9,000 concurrent users with potential growth to 25,000–50,000+. Architecture must be maintainable by multiple developers and AI agents.

### Decision
Adopt a Modular Monolith — a single deployable unit organized into well-defined domain modules (features), rather than microservices.

### Alternatives Considered
- **Microservices:** Rejected. Adds deployment complexity, network latency, distributed transactions, and operational overhead without demonstrated benefit at initial scale.
- **Serverless functions only:** Rejected. Limited for complex transactional workflows and family tree queries.

### Rationale
- Simpler deployment (single Vite app + Supabase)
- Easier debugging and reasoning
- Can be extracted into services if specific bottlenecks are measured
- Domain boundaries preserved via feature-based module organization

### Consequences
Architecture changes from monolith to services require an ADR and evidence of need.

---

## ADR-002: Supabase as Backend Platform

**Status:** IMPLEMENTED
**Date:** 2024-10-02
**Phase:** 0

### Context
Need a backend that provides: PostgreSQL, Auth, Storage, Real-time, and server-side computation. Team is small, AI-agent development requires predictable tooling.

### Decision
Use Supabase as the primary backend platform.

### Alternatives Considered
- **Firebase:** NoSQL doesn't fit the relational family tree domain model
- **Custom FastAPI backend:** More control but significantly more operational overhead
- **PocketBase:** Smaller ecosystem, less mature

### Rationale
- PostgreSQL with full relational integrity and RLS
- Managed Auth with enterprise-grade security
- Managed Storage with CDN
- Edge Functions for server-side logic
- Excellent TypeScript SDK and codegen

### Consequences
- FastAPI may be introduced ONLY if a genuine technical requirement cannot be handled by Supabase/Edge Functions
- Supabase service-role key is NEVER placed in frontend code

---

## ADR-003: React + Vite + TypeScript Frontend

**Status:** IMPLEMENTED
**Date:** 2024-10-02
**Phase:** 0

### Context
Need a modern, maintainable frontend framework with good TypeScript support, fast development builds, and ecosystem for the required UI components.

### Decision
React 19 + Vite + TypeScript (strict mode) + Tailwind CSS + shadcn/ui.

### Alternatives Considered
- **Next.js:** SSR not immediately required; adds complexity. Can migrate later if SEO requires it.
- **Vue:** Smaller ecosystem for required libraries (React Flow, shadcn/ui)

### Rationale
- React is the dominant ecosystem for the required libraries
- Vite provides fast HMR and optimized builds
- TypeScript strict mode catches entire classes of runtime bugs
- shadcn/ui provides accessible, composable component primitives

### Consequences
- If SEO becomes critical, migration to Next.js should be an ADR

---

## ADR-004: Feature-Based Directory Structure

**Status:** IMPLEMENTED
**Date:** 2024-10-02
**Phase:** 0

### Context
Multiple developers and AI agents need to work on the codebase without stepping on each other. Domain boundaries must be clear.

### Decision
Organize `src/features/` by domain: auth, home, discover, family, community, profile, admin.

### Alternatives Considered
- **Layer-based (pages/, components/, services/):** Doesn't scale — auth pages, components, services get mixed across features
- **Atomic Design:** Overengineered for this domain

### Rationale
- Feature directories are self-contained and independently navigable
- Reduces merge conflicts between teams
- Aligns with route structure
- AI agents can focus on a single feature directory

### Consequences
Shared components go in `src/components/`. Shared hooks in `src/hooks/`. Shared utilities in `src/utils/`.
