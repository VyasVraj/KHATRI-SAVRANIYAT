# AGENTS.md — Community Roots

> **This is the primary instruction file for all AI agents working on this project.**
> Read this file in full before taking any action. Do not skip sections.

---

## Table of Contents

1. [Project Purpose](#1-project-purpose)
2. [Architecture Rules](#2-architecture-rules)
3. [Important Commands](#3-important-commands)
4. [Directory Conventions](#4-directory-conventions)
5. [Security Rules](#5-security-rules)
6. [Database Migration Rules](#6-database-migration-rules)
7. [Testing Requirements](#7-testing-requirements)
8. [Documentation Requirements](#8-documentation-requirements)
9. [Search-Before-Create Rule](#9-search-before-create-rule)
10. [No-Unnecessary-Rewrite Rule](#10-no-unnecessary-rewrite-rule)
11. [Git Conventions](#11-git-conventions)
12. [Agent Workflow](#12-agent-workflow)
13. [Definition of Done](#13-definition-of-done)
14. [Phase-Gating Rule](#14-phase-gating-rule)
15. [Technology Stack](#15-technology-stack)

---

## 1. Project Purpose

**Community Roots** is a community-facing platform that provides:

- **Family Census**: A structured registry of individuals and families within a community.
- **Family Tree**: Visual, interactive genealogical tree builder and viewer.
- **Community Directory**: Searchable, privacy-respecting directory of people and families.
- **Connections**: Relationship graph between individuals, families, and community groups.

The platform is designed to serve close-knit communities (e.g., religious, cultural, or regional communities) that wish to maintain structured records of their members, preserve genealogical history, and facilitate connections between members.

**Core values**: Privacy-first, community-owned data, verified records, modular growth.

---

## 2. Architecture Rules

### Modular Monolith

This project is a **modular monolith**, not a microservices architecture. All frontend code lives in a single Vite/React application. All backend logic lives in Supabase (PostgreSQL + RLS + Edge Functions). There is no separate API server.

Do not introduce:
- Separate backend Node/Express servers
- GraphQL layers
- Message queues (unless explicitly authorized in a phase)
- Micro-frontends

### Frontend

- **React + Vite + TypeScript** — The core frontend stack. No class components. Functional components only.
- **Tailwind CSS** — Utility-first styling. No CSS-in-JS libraries (styled-components, emotion, etc.).
- **shadcn/ui** — Component library built on Radix UI. Install components via `npx shadcn-ui@latest add <component>`. Do not hand-roll accessible primitives that shadcn provides.
- **React Router v6** — Client-side routing. Use `createBrowserRouter` with `RouterProvider`.
- **TanStack Query v5** — All server-state management (fetching, caching, mutation). No `useEffect` for data fetching.
- **React Hook Form + Zod** — All forms use `useForm` with a Zod schema via `zodResolver`. No uncontrolled forms.
- **React Flow** — Family tree visualization.

### Backend

- **Supabase** — Managed PostgreSQL database, Auth, Storage, Edge Functions, and Realtime.
- All business logic that requires server trust (authorization, data integrity) lives in **PostgreSQL functions, RLS policies, and CHECK constraints**.
- Edge Functions are used only for logic that cannot be handled in the DB (e.g., external API calls, webhook handlers).

### Strict Separation

- Frontend is responsible for **presentation and user experience only**.
- Authorization and data integrity are enforced **exclusively at the database level**.
- Never replicate security checks only in frontend code.

---

## 3. Important Commands

All commands are run from the project root.

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server (localhost:5173) |
| `npm run build` | Production build (outputs to `dist/`) |
| `npm run type-check` | Run `tsc --noEmit` to validate types without building |
| `npm run lint` | Run ESLint across all source files |
| `npm run test` | Run Vitest unit and integration tests |
| `npm run test:e2e` | Run Playwright end-to-end tests — **Phase 15 only. Not configured. `@playwright/test` is not installed and this script does not exist in `package.json`. Do NOT create it before Phase 15.** |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run preview` | Preview production build locally |
| `npm run format` | Run Prettier formatter |

> Always run `npm run type-check` and `npm run lint` before committing. A failing type-check is a blocker.

---

## 4. Directory Conventions

```
family Tree/                        # Project root
├── AGENTS.md                       # ← You are here
├── README.md                       # Public-facing project readme
├── ROADMAP.md                      # Phase roadmap
├── .env.example                    # Template for environment variables (committed)
├── .env                            # Actual secrets (NEVER committed)
├── index.html                      # Vite HTML entry point
├── vite.config.ts                  # Vite configuration
├── tsconfig.json                   # TypeScript configuration (strict mode)
├── tailwind.config.ts              # Tailwind configuration
├── eslint.config.js                # ESLint configuration
├── package.json
│
├── src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Root component / router setup
│   │
│   ├── app/                        # Application-level setup
│   │   ├── router.tsx              # createBrowserRouter configuration
│   │   ├── providers.tsx           # QueryClientProvider, ThemeProvider, etc.
│   │   └── store.ts                # Global client state (if/when needed)
│   │
│   ├── features/                   # Feature domains (self-contained)
│   │   ├── auth/                   # Authentication feature
│   │   │   ├── components/         # Auth-specific UI components
│   │   │   ├── hooks/              # Auth-specific hooks
│   │   │   ├── services/           # Auth service functions
│   │   │   ├── types.ts            # Auth-specific types
│   │   │   └── index.ts            # Public API of the feature
│   │   ├── people/                 # Person profiles
│   │   ├── families/               # Family management
│   │   ├── tree/                   # Family tree visualization
│   │   ├── directory/              # Community directory
│   │   ├── connections/            # Connections / relationships
│   │   ├── discovery/              # Search and discovery
│   │   ├── verification/           # Record verification
│   │   ├── media/                  # Photos and family history
│   │   ├── notifications/          # Notification center
│   │   ├── community/              # Community features
│   │   └── admin/                  # Admin panel
│   │
│   ├── components/                 # Shared, reusable UI components
│   │   ├── ui/                     # shadcn/ui components (auto-generated)
│   │   ├── layout/                 # Layout components (Shell, Sidebar, Header)
│   │   ├── forms/                  # Shared form primitives
│   │   └── common/                 # Other shared components
│   │
│   ├── hooks/                      # Shared custom React hooks
│   │
│   ├── lib/                        # Core library singletons and utilities
│   │   ├── supabase.ts             # Supabase client (single instance)
│   │   ├── query-client.ts         # TanStack Query client configuration
│   │   └── utils.ts                # General utility functions (cn(), etc.)
│   │
│   ├── services/                   # Shared service/data-access functions
│   │   └── (domain-specific files, e.g. people.service.ts)
│   │
│   ├── types/                      # Global TypeScript types and interfaces
│   │   ├── database.types.ts       # Supabase-generated DB types (do not hand-edit)
│   │   ├── api.types.ts            # API request/response types
│   │   └── app.types.ts            # Application domain types
│   │
│   ├── constants/                  # Application-wide constants
│   │   ├── routes.ts               # Route path constants
│   │   ├── privacy.ts              # Privacy level enum/constants
│   │   └── config.ts               # Feature flags and app config
│   │
│   ├── utils/                      # Pure utility functions
│   │
│   └── styles/                     # Global styles
│       └── globals.css             # Tailwind base + CSS variables
│
├── supabase/                       # Supabase project configuration
│   ├── config.toml                 # Supabase CLI configuration
│   ├── migrations/                 # SQL migration files (immutable once applied)
│   │   └── YYYYMMDDHHMMSS_description.sql
│   ├── functions/                  # Edge Functions
│   │   └── (function-name)/
│   │       └── index.ts
│   └── seed.sql                    # Development seed data
│
├── tests/                          # Test files
│   ├── unit/                       # Unit tests (mirrors src/ structure)
│   ├── integration/                # Integration tests (DB, API)
│   ├── e2e/                        # End-to-end tests (Playwright)
│   ├── security/                   # Security-specific tests (RLS, IDOR)
│   └── load/                       # Load / performance tests
│
└── docs/                           # Engineering documentation
    ├── ARCHITECTURE.md
    ├── SECURITY.md
    ├── DATABASE.md
    ├── DEVELOPMENT.md
    └── adr/                        # Architecture Decision Records
        └── YYYYMMDD-title.md
```

### Naming Rules

| Artifact | Convention | Example |
|---|---|---|
| React components | `PascalCase.tsx` | `PersonCard.tsx` |
| Hooks | `camelCase.ts` with `use` prefix | `usePersonProfile.ts` |
| Services | `camelCase.service.ts` | `people.service.ts` |
| Types/interfaces | `PascalCase` | `PersonProfile` |
| Constants | `SCREAMING_SNAKE_CASE` | `PRIVACY_LEVELS` |
| DB migrations | `YYYYMMDDHHMMSS_description.sql` | `20240115120000_create_persons.sql` |
| Feature directories | `kebab-case` | `family-tree/` |

---

## 5. Security Rules

These rules are **non-negotiable**. Violation of any of these is a critical defect.

### RLS Enforced at Database Level

- Every table exposed to the Supabase client **must** have Row Level Security (RLS) enabled.
- Every operation (SELECT, INSERT, UPDATE, DELETE) must have an explicit RLS policy or be blocked by default.
- Never disable RLS on any table as a workaround. If a policy is complex, implement it correctly.

### Anon Key in Frontend Only

- `VITE_SUPABASE_ANON_KEY` is the only Supabase key that may appear in frontend code or `VITE_` environment variables.
- The anon key is a **public key** — it identifies the project but does not bypass RLS.
- All security is enforced by RLS policies, not by keeping the anon key secret.

### Service-Role Key: Server-Side Only

- `SUPABASE_SERVICE_ROLE_KEY` **must never** appear in frontend code, `VITE_` variables, or be committed to the repository.
- The service-role key bypasses RLS. It may only be used in:
  - Supabase Edge Functions
  - Trusted server-side scripts (migrations, admin CLI tools)
  - CI/CD pipelines (as encrypted secrets)

### PERSON ≠ USER

This is a fundamental domain design rule:

- A **User** (`auth.users`) is an authentication identity — someone who can log in.
- A **Person** (`public.persons`) is a human being in the community census — they may or may not have a user account.
- A Person record can exist without any associated User (e.g., a deceased ancestor, an unregistered family member).
- A User may be linked to at most one Person record via a foreign key.
- Never conflate these two concepts in code, types, or queries.
- Do not expose `auth.users` data directly via queries; use the `persons` table with the user link.

---

## 6. Database Migration Rules

### Immutability

**Migrations are immutable once applied.** This is an absolute rule.

- Once a migration file has been applied to any environment (local, staging, production), it **must not be modified**.
- If a migration contains an error that has already been applied, create a **new migration** to correct it.
- Only migration files that have never been applied may be modified (i.e., during active development before first `supabase db push`).

### Naming Convention

```
YYYYMMDDHHMMSS_description.sql
```

Examples:
```
20240115120000_create_persons_table.sql
20240116090000_add_privacy_to_persons.sql
20240120143000_create_families_table.sql
```

### Migration Discipline

- Each migration should be a single, focused, logical unit of schema change.
- Migrations must be idempotent where possible (use `IF NOT EXISTS`, `IF EXISTS`).
- Always include both the schema change and corresponding RLS policies in the same migration.
- Never use raw `DROP TABLE` or destructive commands without a rollback strategy documented in a comment.
- Test migrations against a local Supabase instance before pushing to staging.

### Codegen

After applying migrations, regenerate TypeScript types:

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

Do not hand-edit `database.types.ts`. It is generated output.

---

## 7. Testing Requirements

### Test Categories

| Category | Tool | Scope |
|---|---|---|
| Unit | Vitest + Testing Library | Individual components, hooks, utilities, service functions |
| Integration | Vitest + Supabase local | Database queries, RLS policies, service layer |
| End-to-End | Playwright | Full user flows in the browser |
| Security | Vitest (RLS tests) | Access control validation — positive AND negative |
| Load | k6 or Artillery | Performance under realistic concurrent load |

### RLS Testing — Mandatory

Every RLS policy requires **both** a positive test and a negative test:

- **Positive test**: Authenticated user with correct permissions can perform the operation.
- **Negative test**: User without correct permissions (different user, unauthenticated, wrong role) is denied and receives an error — not empty results.

Example test structure:
```typescript
describe('persons RLS — SELECT', () => {
  it('owner can read their own person record', async () => { /* ... */ });
  it('unrelated user cannot read a private person record', async () => { /* ... */ });
  it('unauthenticated user cannot read any person record', async () => { /* ... */ });
});
```

### Coverage Expectations

- All service functions: ≥ 80% line coverage.
- All RLS policies: 100% policy coverage (every policy has at least one positive + one negative test).
- Critical user flows (auth, person creation, family creation, tree view): e2e test coverage.

### Test File Location

- Unit tests: `tests/unit/` mirroring `src/` structure, or co-located as `*.test.ts` beside the source file.
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`
- Security tests: `tests/security/`

---

## 8. Documentation Requirements

### When to Write Docs

- Every new feature domain added to `src/features/` must have a `README.md` in that directory explaining the domain model, key components, and service functions.
- Every Architecture Decision Record (ADR) must be written in `docs/adr/YYYYMMDD-title.md`.
- Every new RLS policy must have an inline SQL comment explaining the authorization logic.
- Every public service function must have a JSDoc comment.

### ADR Process

When making a significant architectural decision (choice of library, schema design pattern, security model change), create an ADR:

```
docs/adr/YYYYMMDD-short-title.md
```

ADR sections: **Context**, **Decision**, **Consequences**, **Alternatives Considered**.

### Inline Documentation

- Complex SQL (RLS policies, functions, triggers) must have explanatory comments.
- Non-obvious TypeScript types must have JSDoc comments.
- All environment variables in `.env.example` must have comments explaining their purpose and source.

---

## 9. Search-Before-Create Rule

Before creating any new file, component, hook, service, type, or utility:

1. **Search** the existing codebase for similar functionality.
2. **Check** `src/components/ui/` for shadcn components that may already solve the problem.
3. **Check** `src/hooks/` for existing shared hooks.
4. **Check** `src/services/` and `src/features/*/services/` for existing data access patterns.

If a suitable implementation already exists: **use it or extend it**. Do not create duplicates.

If creating something new that could be reused: place it in the appropriate shared directory (`src/components/`, `src/hooks/`, `src/utils/`), not buried inside a feature.

---

## 10. No-Unnecessary-Rewrite Rule

- Do not rewrite working code to match a different style preference.
- Do not replace a working pattern with an alternative pattern without an explicit technical justification.
- Do not refactor code that is outside the scope of the current task.
- If you identify code that should be refactored, document it (e.g., create a GitHub issue comment or TODO) but do not perform the refactor unless it is within the authorized phase scope.

**Scope creep is a defect.** Agents must do exactly what is required, no more.

---

## 11. Git Conventions

### Branch Naming

```
feature/phase-{N}-{short-description}
fix/phase-{N}-{short-description}
chore/phase-{N}-{short-description}
docs/{short-description}
```

Examples:
```
feature/phase-1-create-persons-table
fix/phase-2-auth-redirect-loop
chore/phase-0-configure-eslint
```

### Commit Messages

Use Conventional Commits format:

```
<type>(<scope>): <short description>

<optional body explaining why, not what>
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`

Examples:
```
feat(people): add PersonCard component with privacy badge
fix(rls): correct persons SELECT policy for family members
docs(architecture): add ADR for Supabase vs custom backend
test(security): add negative RLS tests for persons table
```

### Rules

- **Never commit secrets.** Run `git diff --staged` before every commit to verify.
- Commits must be focused — one logical change per commit.
- Commits must pass `npm run type-check` and `npm run lint`.
- Do not force-push to `main` or `staging` branches.
- Pull requests must be reviewed before merging to `main`.

---

## 12. Agent Workflow

Every agent task must follow this workflow in order. Do not skip steps.

### Step 1: READ
Read this `AGENTS.md` in full. Read any feature-specific `README.md` relevant to the task. Read `ROADMAP.md` to understand current phase authorization.

### Step 2: INSPECT
Inspect the current codebase state. Check `package.json`, `tsconfig.json`, existing `src/` structure, existing `supabase/migrations/`. Run `npm run type-check` and `npm run lint` to understand the current state of the codebase before making changes.

### Step 3: SEARCH
Apply the Search-Before-Create rule. Search for existing implementations, patterns, and components before introducing new ones.

### Step 4: DESIGN
Plan the implementation. For non-trivial tasks, write a brief design note (can be a comment at the top of a new file or a short message). Identify:
- What files will be created or modified?
- What DB changes are needed (if any)?
- What RLS policies are needed?
- What tests are needed?

### Step 5: IMPLEMENT
Execute the implementation. Follow all conventions in this document. Make focused, logical changes.

### Step 6: VALIDATE
After implementation:
- Run `npm run type-check` — must pass with zero errors.
- Run `npm run lint` — must pass with zero errors (warnings acceptable only if pre-existing).
- Run `npm run test` — all tests must pass.
- Manually verify the feature works as described (if possible).

### Step 7: DOCUMENT
Update or create documentation as required by Section 8. Update feature `README.md` if applicable. Add JSDoc to new public functions.

### Step 8: STATUS
Report the current status clearly:
- What was implemented.
- What tests were written and their results.
- Any known issues or follow-up tasks.
- Whether the Definition of Done (Section 13) is met.

### Step 9: HANDOFF
If handing off to another agent or human:
- Leave the codebase in a clean, passing state (`type-check`, `lint`, `test` all green).
- Document any in-progress work, assumptions made, or decisions taken.
- List explicitly any tasks that remain for the next agent.

### Step 10: PHASE GATE
Before marking a phase complete, verify every item in the phase's Definition of Done is met. Do not proceed to the next phase without explicit human authorization.

---

## 13. Definition of Done

A task or feature is **Done** when all of the following are true:

- [ ] All TypeScript types pass `npm run type-check` with zero errors.
- [ ] All ESLint rules pass `npm run lint` with zero new errors.
- [ ] All unit tests pass (`npm run test`).
- [ ] All integration tests pass (where applicable).
- [ ] All E2E tests pass (where applicable).
- [ ] Every new RLS policy has both a positive and a negative test.
- [ ] All new public functions have JSDoc comments.
- [ ] Feature `README.md` is created or updated.
- [ ] No secrets are committed to the repository.
- [ ] No console.log statements left in production code paths.
- [ ] PR is focused and does not include out-of-scope changes.
- [ ] Code has been reviewed (or self-reviewed with documented rationale for agent-only changes).

---

## 14. Phase-Gating Rule

**ONLY execute work authorized by the currently active phase.**

The project is divided into phases (see `ROADMAP.md`). Each phase has a specific scope. Agents must:

1. Read `ROADMAP.md` to identify the current active phase.
2. Only implement features and tasks described in the current phase.
3. Never implement functionality from future phases, even if it seems logical or convenient.
4. If a future-phase concern arises (e.g., a schema change that anticipates a future feature), document it as a note but do not implement it.

**Phase transitions require explicit human authorization.** An agent must never self-authorize moving to the next phase.

---

## 15. Technology Stack

### Frontend

| Library | Version | Purpose |
|---|---|---|
| React | ^18 | UI component framework |
| Vite | ^5 | Build tool and dev server |
| TypeScript | ^5 | Type safety (strict mode) |
| Tailwind CSS | ^3 | Utility-first CSS framework |
| shadcn/ui | latest | Accessible component library (Radix UI) |
| React Router | ^6 | Client-side routing |
| TanStack Query | ^5 | Server state management |
| React Hook Form | ^7 | Form state management |
| Zod | ^3 | Schema validation |
| React Flow | ^11 | Family tree graph visualization |

### Backend / Infrastructure

| Service | Purpose |
|---|---|
| Supabase Auth | User authentication (email/password, magic link, OAuth) |
| Supabase PostgreSQL | Primary database (v15+) |
| Supabase RLS | Row-Level Security for authorization |
| Supabase Storage | File and image storage |
| Supabase Edge Functions | Server-side logic requiring trust |
| Supabase Realtime | Live updates (where applicable) |

### Development Tools

| Tool | Purpose |
|---|---|
| Vitest | Unit and integration testing |
| Testing Library | React component testing utilities |
| Playwright | End-to-end testing |
| ESLint | Static code analysis |
| Prettier | Code formatting |
| Supabase CLI | Local development, migrations |

---

*Last updated: Phase 0 — Engineering Foundation*
*This document is maintained by the project lead and must be updated whenever architectural decisions change.*
