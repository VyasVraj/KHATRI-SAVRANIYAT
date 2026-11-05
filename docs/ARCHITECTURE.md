# Architecture — Community Roots

**Document Type**: Engineering Architecture Reference
**Status**: Phase 4 Complete — Phase 5 Architecture Locked (Implementation Not Started — Subtask 1 Awaiting Explicit Authorization) (2026-10-04)
**Last Updated**: Phase 5 Pre-Implementation Architecture Lock

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Security Architecture](#7-security-architecture)
8. [Data Layer](#8-data-layer)
9. [Module Organization](#9-module-organization)
10. [Architecture Decision Records](#10-architecture-decision-records)
11. [Known Limitations and Planned Evolution](#11-known-limitations-and-planned-evolution)

---

## 1. Overview

Community Roots is architected as a **modular monolith**. This is a deliberate choice: not microservices, not a serverless SPA backed by a separate REST API, and not a full-stack meta-framework like Next.js.

The system consists of two principal components:

1. **A React/Vite single-page application** — the frontend, responsible for all user interface and user experience.
2. **Supabase** — the backend-as-a-service platform that provides PostgreSQL, authentication, row-level security, file storage, edge functions, and realtime subscriptions.

All authorization logic, data integrity constraints, and business rules that require server trust are implemented at the **database layer** using PostgreSQL features (RLS, CHECK constraints, triggers, functions). The frontend is a pure presentation layer.

This architecture enables rapid iteration while maintaining a security posture appropriate for a community platform handling personal and genealogical data.

---

## 2. Architecture Philosophy

```
SIMPLE NOW → MODULAR BY DESIGN → SCALABLE WHEN NEEDED
```

**SIMPLE NOW**: The current implementation avoids premature complexity. No message queues, no separate API servers, no microservices. The simplest architecture that correctly solves the problem.

**MODULAR BY DESIGN**: The frontend is organized into self-contained feature modules. The database schema is designed with clear domain boundaries. This modularity allows subsystems to be extracted or replaced without widespread refactoring.

**SCALABLE WHEN NEEDED**: Supabase provides managed PostgreSQL with connection pooling (PgBouncer), CDN-backed storage, and horizontal scaling options. Edge Functions can offload compute-heavy work. When a feature outgrows the monolith model, the module boundaries are already in place to support extraction.

### What This Architecture Explicitly Avoids

- **Separate REST/GraphQL API server**: All data access goes through Supabase's PostgREST API (typed client) and Edge Functions. No Express/Fastify/NestJS server.
- **Microservices**: No service-to-service communication, no separate deployments per domain.
- **Client-side security**: No authorization logic in React components. Frontend is presentation-only.
- **ORM in application code**: The Supabase client handles query building. Complex queries are implemented as PostgreSQL functions.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │          React SPA (Vite + TypeScript)                      │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │  React Router │  │ TanStack Q   │  │ React Hook Form  │  │   │
│  │  │  (Routing)    │  │ (Data Cache) │  │ + Zod (Forms)    │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │         Feature Modules (src/features/)              │   │   │
│  │  │  auth | people | families | tree | directory | ...  │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │         Supabase JS Client (src/lib/supabase.ts)    │   │   │
│  │  └─────────────────────┬───────────────────────────────┘   │   │
│  └────────────────────────│────────────────────────────────────┘   │
└───────────────────────────│─────────────────────────────────────────┘
                            │ HTTPS (anon key + JWT)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          SUPABASE                                   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  Supabase    │  │  PostgREST   │  │  Edge Functions          │  │
│  │  Auth        │  │  (Auto API)  │  │  (Deno / TypeScript)     │  │
│  │  (JWTs)      │  │              │  │  [service-role access]   │  │
│  └──────────────┘  └──────┬───────┘  └─────────────────────────┘  │
│                            │                                        │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                   PostgreSQL 15+                             │   │
│  │                                                             │   │
│  │  ┌──────────────────────┐  ┌──────────────────────────────┐ │   │
│  │  │  RLS Policies        │  │  Functions & Triggers         │ │   │
│  │  │  (Authorization)     │  │  (Business Logic)             │ │   │
│  │  └──────────────────────┘  └──────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐   │
│  │  Supabase    │  │  Supabase Realtime                        │   │
│  │  Storage     │  │  (WebSocket subscriptions)                │   │
│  └──────────────┘  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack

### Frontend

| Technology | Version | Role |
|---|---|---|
| React | ^18 | Component framework |
| Vite | ^5 | Build tool, dev server, HMR |
| TypeScript | ^5 (strict) | Type safety |
| Tailwind CSS | ^3 | Utility-first styling |
| shadcn/ui | latest | Accessible component primitives (Radix UI) |
| React Router | ^6 | Client-side routing (`createBrowserRouter`) |
| TanStack Query | ^5 | Server state: fetch, cache, invalidate |
| React Hook Form | ^7 | Form state management |
| Zod | ^3 | Schema validation (forms and API types) |
| React Flow | ^11 | Family tree graph visualization |

### Backend / Infrastructure

| Technology | Role |
|---|---|
| Supabase Auth | User authentication (email/password, magic link) |
| Supabase PostgreSQL | Primary relational database |
| PostgREST | Auto-generated REST API from PostgreSQL schema |
| Supabase RLS | Row-level security (primary authorization mechanism) |
| Supabase Storage | File and image storage with signed URL access |
| Supabase Edge Functions | Deno-based server-side functions for trusted operations |
| Supabase Realtime | WebSocket subscriptions for live data |

### Developer Tooling

| Tool | Role |
|---|---|
| Vitest | Unit and integration test runner |
| Testing Library | React component test utilities |
| Playwright | End-to-end browser testing |
| ESLint | Static analysis, code quality |
| Prettier | Code formatting |
| Supabase CLI | Local DB, migrations, type generation |

---

## 5. Frontend Architecture

### Application Entry Point

```
src/main.tsx
  └─ src/App.tsx
       └─ src/app/providers.tsx    (QueryClientProvider, etc.)
            └─ src/app/router.tsx  (createBrowserRouter)
                 └─ Route tree
```

### Route Structure

Routes are defined in `src/app/router.tsx` using `createBrowserRouter`. Route segments map directly to feature modules.

```
/                          → Home / landing
/auth/login                → Login page
/auth/register             → Registration
/auth/reset-password       → Password reset
/app/dashboard             → Authenticated dashboard
/app/profile               → Current user's person profile
/app/people/:personId      → Person detail view
/app/families              → Family list
/app/families/:familyId    → Family detail
/app/families/:familyId/tree → Family tree view
/app/directory             → Community directory / search
/app/connections           → Connections list
/app/notifications         → Notification center
/admin/*                   → Admin panel (admin role required)
```

### Data Fetching Pattern

All server state is managed by **TanStack Query**. The standard pattern:

```typescript
// Service function (src/features/people/services/people.service.ts)
export async function getPersonById(personId: string): Promise<Person> {
  const { data, error } = await supabase
    .from('persons')
    .select('*')
    .eq('id', personId)
    .single();
  if (error) throw error;
  return data;
}

// Hook (src/features/people/hooks/usePersonById.ts)
export function usePersonById(personId: string) {
  return useQuery({
    queryKey: ['persons', personId],
    queryFn: () => getPersonById(personId),
    enabled: !!personId,
  });
}

// Component
function PersonDetail({ personId }: { personId: string }) {
  const { data: person, isLoading, error } = usePersonById(personId);
  // ...
}
```

**Rules**:
- No `useEffect` for data fetching.
- No local `useState` for server data.
- Mutations use `useMutation` with `queryClient.invalidateQueries` on success.

### Form Pattern

All forms use **React Hook Form** with a **Zod** schema via `zodResolver`.

```typescript
const personSchema = z.object({
  first_name: z.string().min(1, 'Required').max(100),
  last_name: z.string().min(1, 'Required').max(100),
  date_of_birth: z.string().optional(),
  privacy_level: z.enum(['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC']),
});

type PersonFormData = z.infer<typeof personSchema>;

function PersonForm() {
  const form = useForm<PersonFormData>({ resolver: zodResolver(personSchema) });
  // ...
}
```

### Styling Conventions

- Tailwind utility classes for all styling.
- CSS custom properties in `src/styles/globals.css` for theme tokens (shadcn/ui pattern).
- No inline `style` props except for dynamic values that cannot be expressed as Tailwind classes.
- `cn()` utility (`clsx` + `tailwind-merge`) for conditional class application.

---

## 6. Backend Architecture

### Supabase Auth & Phase 1 Foundation (Deployed & Verified)

- Supabase Auth manages authentication sessions. JWTs are automatically injected into all Supabase client requests.
- A database trigger (`on_auth_user_created`) creates a corresponding `public.profiles` record on registration via `handle_new_user()`.
- Phase 1 baseline schema is deployed via canonical migration `supabase/migrations/20261002140000_phase1_foundation.sql` (1,077 lines) to project `community-family-platform` (`ixhvsprwjalgcyievsrg`).
- **Deployed Database Objects**:
  - **4 Extensions:** `uuid-ossp`, `pgcrypto`, `unaccent`, `pg_trgm`
  - **8 Enums:** `privacy_level`, `user_role`, `person_status`, `family_status`, `verification_status`, `gender`, `family_role`, `audit_action`
  - **5 Tables:** `profiles`, `persons`, `families`, `family_members`, `audit_logs` (RLS enabled on all 5 tables)
  - **7 Functions:** `handle_updated_at()`, `is_admin()`, `is_community_moderator()`, `get_my_role()`, `handle_new_user()`, `handle_user_email_confirmed()`, `log_audit_event()`
  - **3 Public Triggers:** `profiles_handle_updated_at`, `persons_handle_updated_at`, `families_handle_updated_at`
  - **2 Auth Triggers:** `on_auth_user_created`, `on_auth_user_email_confirmed` (guarded `DO $$` blocks on `auth.users`)
  - **33 RLS Policies:** Granular security policies with deny-by-default posture
  - **Two Data-Integrity Patches:** `persons_insert_authenticated` (`user_id IS NULL`) and `family_members_update_creator` (`WITH CHECK` on creator-owned family)

### PostgreSQL + PostgREST

- The Supabase client communicates with PostgreSQL via PostgREST, which auto-generates a REST API from the public schema.
- All tables in the `public` schema are accessible via the Supabase client, subject to RLS.
- Complex queries that cannot be expressed via PostgREST are implemented as PostgreSQL **functions** and called via `supabase.rpc('function_name', params)`.

### RLS as the Authorization Layer

- Every table in `public` schema has RLS enabled.
- RLS policies are the **only** trusted authorization boundary for data access from the client.
- Frontend checks (e.g., "hide the edit button if not owner") are UX conveniences only, not security controls.

### Edge Functions

Used for operations that require elevated trust or external API calls:
- Sending email notifications via a third-party email provider.
- Processing GEDCOM file imports.
- Generating signed upload URLs with MIME and size validation.
- Any operation requiring the `service_role` key.

Edge Functions run in Deno. They are deployed to Supabase and called via `supabase.functions.invoke()`.

---

## 7. Security Architecture

See [`SECURITY.md`](SECURITY.md) for the full security documentation.

### Summary

| Principle | Implementation |
|---|---|
| Authorization at DB layer | RLS policies on every exposed table |
| Anon key is public | `VITE_SUPABASE_ANON_KEY` in frontend is expected to be visible |
| Service-role key is secret | Only in Edge Functions and CI/CD, never in frontend |
| PERSON ≠ USER | Separate tables; a person record can exist without a user account |
| Input validation | Zod for UX feedback; DB constraints for data integrity |
| Privacy levels | Column-level privacy enforced via RLS conditions |

---

## 8. Data Layer

### Supabase Client

A single Supabase client instance is created in `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

The `Database` generic provides full TypeScript inference for all table queries, including column names, types, and relationships.

### Type Generation

Database types are generated directly from the deployed schema of the Supabase project `community-family-platform` (`ixhvsprwjalgcyievsrg`) using the Supabase CLI:

```bash
npx supabase gen types typescript --project-id ixhvsprwjalgcyievsrg --schema public > src/types/database.types.ts
```

- **Generated Output**: `src/types/database.types.ts` (543 lines, UTF-8 without BOM).
- **Schema Coverage**: All 5 deployed tables (`profiles`, `persons`, `families`, `family_members`, `audit_logs`), 8 enums, and database functions (`is_admin`, `is_community_moderator`, `get_my_role`, `log_audit_event`).
- **Client Integration**: `src/lib/supabase.ts` imports `Database` from `@/types/database.types` and instantiates `createClient<Database>(...)`, providing full end-to-end type safety for queries, mutations, and relationships.
- **Validation**: Strict TypeScript validation (`npm run type-check`) passes cleanly with 0 errors.
- `database.types.ts` is **generated output** — do not hand-edit. Regenerate after schema updates.

### Query Client

TanStack Query client configuration in `src/lib/query-client.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 minutes
      retry: (failureCount, error) => failureCount < 2 && !isAuthError(error),
    },
  },
});
```

---

## 9. Module Organization

Each feature in `src/features/` is a self-contained domain module:

```
src/features/<domain>/
├── components/     # UI components specific to this feature
├── hooks/          # Custom hooks specific to this feature
├── services/       # Data-access functions for this feature
├── types.ts        # TypeScript types for this feature domain
├── constants.ts    # Feature-specific constants (optional)
├── README.md       # Feature domain documentation
└── index.ts        # Public API — what other modules may import
```

### Import Rules

- Features may import from `src/components/`, `src/hooks/`, `src/lib/`, `src/utils/`, `src/types/`, `src/constants/`.
- Features **must not** import from other features' internal files. Only public APIs (`index.ts`) may be imported.
- Circular dependencies between features are forbidden.

---

## 10. Architecture Decision Records

Significant architectural decisions are documented as Architecture Decision Records (ADRs) in `docs/adr/`.

**ADR format**: `docs/adr/YYYYMMDD-short-title.md`

**Required sections**:
- **Context**: What is the situation that requires a decision?
- **Decision**: What was decided?
- **Consequences**: What are the trade-offs, benefits, and risks?
- **Alternatives Considered**: What other options were evaluated?

ADRs are immutable once finalized. If a decision changes, create a new ADR that supersedes the previous one.

### Active Architecture Decision Records

1. [`20261002-phase1-migration-consolidation.md`](adr/20261002-phase1-migration-consolidation.md): Phase 1 baseline migration consolidation into a single dependency-ordered baseline.
2. [`20261004-canonical-database-legacy-android-compatibility.md`](adr/20261004-canonical-database-legacy-android-compatibility.md): Canonical Database vs Legacy Android (KhatriSetu) Compatibility & Phase 5 Interpersonal Relationship Architecture Lock.
   - Enforces normalized source of truth over legacy spreadsheet/app columns.
   - Formalizes `FAMILY != HOUSEHOLD` distinction (lineage vs physical residence).
   - Re-affirms `PERSON != USER` separation based on legacy production evidence.
   - External references: Defined as a future compatibility domain (`external_references`); implementation is deferred to Phase 14. No such table currently exists.
   - Establishes canonical `relationships` schema (`PARENT`, `SPOUSE`, `SIBLING`), dual-endpoint RLS privacy (enforcing the same effective authorization semantics as direct person visibility for BOTH endpoints), and React Flow DAG rendering boundary.
3. [`20261005-family-tree-graph-architecture.md`](adr/20261005-family-tree-graph-architecture.md): Family Tree Graph Model, Bounded Traversal & Generation-Tiered Layout Architecture.
   - Establishes four-tier separation: Database rows → Domain graph model → Layout model → React Flow presentation canvas.
   - Bounded BFS traversal: 2 generations up, 2 generations down, 1 lateral hop (max 100 nodes, 150 edges).
   - Primary layout algorithm: Custom Generation-Tiered Genealogical Layout (deterministic generational Y-coordinates, zero external layout dependencies).
   - Strict privacy model: Zero synthetic placeholders (`[Private Person]`) for hidden edges; aligned with PostgreSQL RLS dual-endpoint enforcement.
   - Phase 5 is COMPLETE and formally closed.
4. [`20261005-community-discovery-and-search-architecture.md`](adr/20261005-community-discovery-and-search-architecture.md): Community Directory, Search Architecture & Discovery Privacy (Phase 6).
   - Leverages deployed PostgreSQL GIN full-text search (`idx_persons_name_fts`, `idx_families_fts`) and trigram indexes (`idx_persons_first_name_trgm`, `idx_persons_last_name_trgm`, `idx_families_name_trgm`) with `unaccent`.
   - In-database search guarantees that PostgreSQL RLS policies directly filter results before payload construction.
   - Dual-entity directory separating People census discovery from Family unit discovery at `/discover`.
   - Contact fields (`phone`, `email_contact`) and internal IDs (`user_id`, `created_by`, timestamps) strictly excluded from search card payloads.
   - Scalable pagination with standard metadata, 350ms input debouncing, and 5-minute TanStack Query caching for ~9,000 concurrent community users.
   - Phase 6 Discovery COMPLETE; implementation NOT started.

---

## 11. Known Limitations and Planned Evolution

### Current Architecture State (Phase 11 Complete — Ready for Release Review)

- **Completed Phases**: Phase 0 (Foundation), Phase 1 (Database Foundation), Phase 2 (Authentication & Identity), Phase 3 (Person/Family Foundation), Phase 4 (Family Membership & Multi-Step Wizard), Phase 5 (Relationships & Family Tree), Phase 6 (Community Directory & Discovery), Phase 7 (Connections & Social Graph), Phase 8 (Claim / Join / Invitation), Phase 9 (Verification & Data Quality), Phase 10 (Community Features: Groups, Notices, Events & Dashboard), Phase 11 (Media / Family History / Secure Storage Foundation).
- **Core Tables Deployed**: `profiles`, `persons`, `families`, `family_members`, `relationships`, `connections`, `person_claims`, `invitations`, `verification_requests`, `duplicate_flags`, `groups`, `group_members`, `announcements`, `community_events`, `event_rsvps`, `family_albums`, `family_media`, `family_stories`, `audit_logs` with verified RLS policies and authenticated table grants.
- **Media & Storage (Phase 11)**: Deployed private `avatars` bucket (5MB, images) and dedicated private `family-media` bucket (20MB, images + PDF). Canonical internal storage paths, dynamic 1-hour signed URL resolution, zero persisted signed URLs in DB, authoritative RPC mutations (`register_family_media`, `soft_delete_family_media`, `create_family_album`, `create_family_story`), and 6 trigger guards protecting relational integrity and immutability.

### Planned Evolution

| Phase | Evolution |
|---|---|
| Phase 5 | Canonical `relationships` table (`PARENT`, `SPOUSE`, `SIBLING`), dual-endpoint RLS, and React Flow family tree visualization (COMPLETED) |
| Phase 6 | Full-text directory search with PostgreSQL `tsvector`, `unaccent`, trigram fuzzy matching, multi-criteria filters, and mobile directory UI (COMPLETED) |
| Phase 7 | User-to-user connections graph (`connections`), `/connections` management page, and connection-level privacy visibility (`profile_privacy = 'CONNECTIONS'`) (COMPLETED) |
| Phase 8 | Family invite links and self-service census seat claiming (COMPLETED) |
| Phase 9 | Community record verification badges and data completeness metrics (COMPLETED) |
| Phase 10 | Community features: Groups & Associations, Notice Board, Events & RSVPs, Community Hub (COMPLETED) |
| Phase 11 | Supabase Storage integration for avatars, family media, photo albums, and historical narratives (COMPLETED) |
| Phase 12 | Supabase Realtime for notifications center |
| Phase 13 | Admin dashboard and audit log exploration |
| Phase 14 | Staging adapters and batch importers for legacy Android & Excel (`khatrisetu`) registries |
| Phase 15 | Localization (EN/HI/GU), E2E Playwright testing, and security hardening |
| Phase 16 | Connection pooling tuning, CDN for assets, production monitoring |

### What Will NOT Change (Stable Architecture)

- The modular monolith approach is the target architecture for the foreseeable future.
- Supabase as the backend platform.
- RLS as the primary authorization mechanism.
- The `PERSON ≠ USER` data model.
- The `FAMILY ≠ HOUSEHOLD` separation.
- Feature-domain directory structure.

*Changing any of the above requires a new ADR and explicit human authorization.*
