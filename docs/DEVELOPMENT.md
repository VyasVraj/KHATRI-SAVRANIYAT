# Development Guide — Community Roots

**Document Type**: Developer Setup Reference
**Audience**: Engineers and AI agents working on the codebase
**Status**: Phase 0 Baseline

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Initial Setup](#2-initial-setup)
3. [Supabase Setup](#3-supabase-setup)
4. [Available Commands](#4-available-commands)
5. [Project Structure](#5-project-structure)
6. [Feature Development Workflow](#6-feature-development-workflow)
7. [Code Style](#7-code-style)
8. [Testing](#8-testing)
9. [Environment Variables](#9-environment-variables)
10. [Common Issues and Solutions](#10-common-issues-and-solutions)

---

## 1. Prerequisites

| Tool | Minimum Version | Install |
|---|---|---|
| Node.js | 18.x LTS or higher | [nodejs.org](https://nodejs.org) |
| npm | 9.x or higher | Included with Node.js |
| Git | 2.x | [git-scm.com](https://git-scm.com) |
| Supabase CLI | latest | `npm install -g supabase` |

### Optional (Recommended)

- **VS Code** with the following extensions:
  - `dbaeumer.vscode-eslint` — ESLint integration
  - `esbenp.prettier-vscode` — Prettier formatter
  - `bradlc.vscode-tailwindcss` — Tailwind CSS IntelliSense
  - `Prisma.vscode-supabase` — Supabase integration (optional)
- **Supabase account** at [supabase.com](https://supabase.com) for cloud development.
- **Docker Desktop** — Required if running Supabase locally via the CLI.

### Verify Prerequisites

```bash
node --version    # Should print v18.x.x or higher
npm --version     # Should print 9.x.x or higher
git --version     # Should print git version 2.x
supabase --version  # Should print supabase version
```

---

## 2. Initial Setup

### Clone the Repository

```bash
git clone <repository-url>
cd "family Tree"
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration. See [Section 9](#9-environment-variables) for variable descriptions.

At minimum, you need:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Verify the Setup

```bash
npm run type-check   # Should complete with 0 errors
npm run lint         # Should complete with 0 errors
npm run test         # Should pass (Phase 0: minimal tests)
npm run dev          # Should start dev server at localhost:5173
```

---

## 3. Supabase Setup

### Option A: Supabase Cloud (Recommended for Development)

1. Create a free account at [supabase.com](https://supabase.com).
2. Create a new project. Note the project reference ID.
3. Navigate to **Project Settings → API**.
4. Copy the **Project URL** → `VITE_SUPABASE_URL`.
5. Copy the **anon public** key → `VITE_SUPABASE_ANON_KEY`.
6. Copy the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (store securely, never commit).

Apply migrations to your cloud project:

```bash
# Link local CLI to your cloud project
supabase link --project-ref your-project-ref

# Push all migrations (development sandbox only)
supabase db push

# Generate TypeScript types from the deployed schema
npx supabase gen types typescript --project-id your-project-ref \
  > src/types/database.types.ts
```

> **Production Note:** In production, schema migrations are never applied via `db push`. They are deployed manually via the Supabase Dashboard SQL Editor in ascending timestamp order with remote verification.

### Option B: Local Supabase (Requires Docker)

```bash
# Start local Supabase stack (PostgreSQL, Auth, Storage, etc.)
supabase start

# This will output local credentials:
# API URL:       http://localhost:54321
# anon key:      eyJ...
# service_role:  eyJ...
```

Use the local credentials in your `.env`:
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
```

Apply migrations locally:
```bash
supabase db reset   # Resets DB and applies all migrations + seed.sql
```

Generate types from local schema:
```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

Stop local Supabase:
```bash
supabase stop
```

### Supabase CLI Reference

| Command | Purpose |
|---|---|
| `supabase start` | Start local Supabase stack |
| `supabase stop` | Stop local Supabase stack |
| `supabase db push` | Push local migrations to linked development project (development only) |
| `supabase db reset` | Reset local DB and re-apply migrations |
| `supabase db diff` | Show schema diff between local and remote |
| `supabase migration new <name>` | Create a new timestamped migration file |
| `supabase functions serve` | Run Edge Functions locally |
| `supabase functions deploy <name>` | Deploy an Edge Function to cloud |

---

## 4. Available Commands

Run all commands from the project root directory.

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR at `localhost:5173` |
| `npm run build` | Type-check and build for production (outputs to `dist/`) |
| `npm run type-check` | Run `tsc --noEmit` — validates TypeScript without emitting files |
| `npm run lint` | Run ESLint across `src/` |
| `npm run lint:fix` | Run ESLint and auto-fix fixable issues |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without modifying files |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once (CI mode) |
| `npm run test:coverage` | Run tests with V8 coverage report |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run test:e2e:ui` | Run Playwright tests with interactive UI |
| `npm run preview` | Preview the production build at `localhost:4173` |

### CI Validation Sequence

Before committing or opening a PR, run:

```bash
npm run type-check && npm run lint && npm run test:run
```

All three must pass with zero errors.

---

## 5. Project Structure

```
src/
├── main.tsx                    # React entry point; mounts <App />
├── App.tsx                     # Root component; renders <Providers> + <RouterProvider>
│
├── app/
│   ├── router.tsx              # createBrowserRouter: full route tree
│   ├── providers.tsx           # QueryClientProvider, theme, auth context
│   └── store.ts                # Zustand or Jotai global client state (if needed)
│
├── features/                   # Self-contained feature domains
│   ├── auth/                   # Authentication (login, register, reset)
│   ├── people/                 # Person profiles
│   ├── families/               # Family management
│   ├── tree/                   # Family tree visualization (React Flow)
│   ├── directory/              # Community directory + search
│   ├── connections/            # Connections between users
│   ├── discovery/              # Search and discovery
│   ├── verification/           # Record verification system
│   ├── media/                  # Photos and documents
│   ├── notifications/          # In-app notifications
│   ├── community/              # Groups, announcements, events
│   └── admin/                  # Admin panel
│
├── components/
│   ├── ui/                     # shadcn/ui generated components
│   ├── layout/                 # AppShell, Sidebar, Header, Footer
│   ├── forms/                  # Shared form primitives (FormField, etc.)
│   └── common/                 # Other shared components (Avatar, Badge, etc.)
│
├── hooks/                      # Shared custom hooks (useDebounce, useMediaQuery)
│
├── lib/
│   ├── supabase.ts             # Supabase client singleton
│   ├── query-client.ts         # TanStack QueryClient configuration
│   └── utils.ts                # cn() and other general utilities
│
├── services/                   # Shared service functions (cross-feature)
│
├── types/
│   ├── database.types.ts       # Generated by Supabase CLI (do not hand-edit)
│   ├── api.types.ts            # API response wrapper types
│   └── app.types.ts            # Application domain types
│
├── constants/
│   ├── routes.ts               # Route path constants (ROUTES.HOME, etc.)
│   ├── privacy.ts              # Privacy level constants and labels
│   └── config.ts               # Feature flags, app configuration
│
├── utils/                      # Pure utility functions (no side effects)
│
└── styles/
    └── globals.css             # Tailwind directives + CSS custom properties
```

### Feature Module Internal Structure

```
src/features/<domain>/
├── components/         # UI components for this domain
├── hooks/              # Custom hooks for this domain
├── services/           # Data-access functions (query Supabase)
├── types.ts            # Domain-specific TypeScript types
├── constants.ts        # Domain constants (optional)
├── README.md           # Domain documentation
└── index.ts            # Public API (what other modules may import)
```

---

## 6. Feature Development Workflow

### Before Starting

1. **Read `AGENTS.md`** in full. All architectural and security rules apply.
2. **Check `ROADMAP.md`** to confirm the feature is in the currently authorized phase.
3. **Inspect the existing codebase** for similar implementations before creating new files.

### Branch and Setup

```bash
# Create a feature branch
git checkout -b feature/phase-N-short-description

# Ensure you're on a clean, passing baseline
npm run type-check && npm run lint && npm run test:run
```

### Development Pattern

1. **Define types first**: Add TypeScript types to `src/features/<domain>/types.ts` or `src/types/app.types.ts`.
2. **Write the service function**: Implement the Supabase query in `src/features/<domain>/services/`.
3. **Write tests for the service**: Integration tests against local Supabase; RLS positive and negative tests.
4. **Build the hook**: Wrap the service function with a TanStack Query hook.
5. **Build the component**: Compose the UI from shadcn/ui components and feature-specific components.
6. **Add the route**: Register the route in `src/app/router.tsx`.
7. **Write component tests**: Render tests with Testing Library.

### Committing

```bash
# Stage only the files relevant to the current task
git add <specific-files>

# Verify no secrets are staged
git diff --staged | grep -E '(service_role|DB_PASSWORD|eyJ[A-Za-z0-9])'

# Commit with a conventional commit message
git commit -m "feat(people): add PersonCard component with privacy badge"

# Verify again before push
npm run type-check && npm run lint && npm run test:run
```

---

## 7. Code Style

### TypeScript

- **Strict mode**: `"strict": true` in `tsconfig.json`. All strict checks are enabled.
- **No `any`**: Explicit type assertions (`as T`) require a code comment justifying them.
- **Prefer `type` over `interface`** for object shapes (interfaces are for class contracts and extension).
- **Named exports preferred** over default exports (easier to refactor and search).

### Import Paths

Use the `@/` alias for all imports from `src/`:

```typescript
// ✅ Correct
import { supabase } from '@/lib/supabase';
import { PersonCard } from '@/features/people/components/PersonCard';
import { Button } from '@/components/ui/button';

// ❌ Incorrect
import { supabase } from '../../lib/supabase';
```

The `@/` alias is configured in `tsconfig.json` and `vite.config.ts`.

### React Components

```typescript
// ✅ Functional component with explicit typed props
interface PersonCardProps {
  personId: string;
  className?: string;
}

export function PersonCard({ personId, className }: PersonCardProps) {
  // ...
}

// ❌ Avoid default exports for components
export default PersonCard;

// ❌ Avoid class components
class PersonCard extends React.Component {}
```

### Styling

```typescript
import { cn } from '@/lib/utils';

// ✅ Use cn() for conditional classes
<div className={cn('base-class', isActive && 'active-class', className)} />

// ❌ Avoid inline style objects for static values
<div style={{ color: 'red' }} />
```

### Prettier Configuration

Prettier is configured in `.prettierrc` (or `prettier.config.js`). Key settings:
- `printWidth`: 100
- `singleQuote`: true
- `semi`: true
- `trailingComma`: 'es5'
- `tabWidth`: 2

Format files: `npm run format`
Check formatting in CI: `npm run format:check`

### ESLint

ESLint configuration in `eslint.config.js`. Key rules enforced:
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unused-vars`
- `react-hooks/rules-of-hooks`
- `react-hooks/exhaustive-deps`
- `import/no-duplicates`

---

## 8. Testing

### Test Runner: Vitest

Vitest is configured in `vite.config.ts` (or `vitest.config.ts`). It uses the same Vite configuration as the main app.

```bash
npm run test           # Watch mode
npm run test:run       # Run once (CI)
npm run test:coverage  # With coverage
```

### Testing Library (Component Tests)

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonCard } from '@/features/people/components/PersonCard';

describe('PersonCard', () => {
  it('renders the person name', () => {
    render(<PersonCard personId="test-id" />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('does not render contact info for private-level records', () => {
    // ...
  });
});
```

### Integration Tests (RLS)

Integration tests run against a local Supabase instance. They require `supabase start` to be running.

```typescript
import { createClient } from '@supabase/supabase-js';

const ownerClient = createClient(LOCAL_URL, LOCAL_ANON_KEY);
// Sign in as a specific test user to set auth context
await ownerClient.auth.signInWithPassword({ email: 'owner@test.com', password: 'test-password' });

const { data } = await ownerClient.from('persons').select('*').eq('id', testPersonId).single();
expect(data?.id).toBe(testPersonId);  // Positive: owner can read
```

### End-to-End Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test('user can log in and view their profile', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('[name=email]', 'user@example.com');
  await page.fill('[name=password]', 'password123');
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/app/dashboard');
});
```

### Test File Organization

| Test Type | Location | Naming |
|---|---|---|
| Unit (utils, hooks) | `tests/unit/` or co-located | `*.test.ts` |
| Component | Co-located with component | `ComponentName.test.tsx` |
| Integration (DB/RLS) | `tests/integration/` | `*.integration.test.ts` |
| E2E | `tests/e2e/` | `*.e2e.ts` |
| Security (RLS) | `tests/security/` | `*.security.test.ts` |

---

## 9. Environment Variables

### `.env.example` (committed to repo)

```env
# Supabase — get from Project Settings > API
# https://supabase.com/dashboard/project/<project-ref>/settings/api
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Service Role Key — NEVER commit the real value
# Only used in Edge Functions and server-side scripts
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# App Configuration
VITE_APP_ENV=development
```

### Variable Reference

| Variable | Prefix | Description | Safe to Commit? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `VITE_` | Supabase project API URL | Placeholder only |
| `VITE_SUPABASE_ANON_KEY` | `VITE_` | Public anon key (identifies project, does not bypass RLS) | Placeholder only |
| `SUPABASE_SERVICE_ROLE_KEY` | none | Bypasses RLS. Server-side / CI only. | **Never** |
| `SUPABASE_DB_PASSWORD` | none | Direct DB connection password | **Never** |
| `VITE_APP_ENV` | `VITE_` | Environment identifier (development, staging, production) | Yes |

### VITE_ Prefix Warning

Any variable with the `VITE_` prefix is **embedded in the JavaScript bundle** and visible to end users. Never use this prefix for secrets.

---

## 10. Common Issues and Solutions

### `npm run type-check` fails with "Cannot find module '@/...'"

**Cause**: TypeScript path alias not configured correctly.

**Solution**: Verify `tsconfig.json` contains:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```
And `vite.config.ts` contains:
```typescript
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

---

### `npm run dev` shows "supabaseUrl is required"

**Cause**: `.env` file is missing or `VITE_SUPABASE_URL` is not set.

**Solution**:
```bash
cp .env.example .env
# Edit .env and add your Supabase URL and anon key
```

---

### Supabase local instance shows auth errors in tests

**Cause**: Test users are not set up in the local auth schema.

**Solution**: Add test user creation to `supabase/seed.sql` or add a test setup fixture:
```sql
-- supabase/seed.sql
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, ...)
VALUES ('test-user-uuid', 'test@example.com', crypt('password', gen_salt('bf')), now(), ...);
```

---

### ESLint reports `react-hooks/exhaustive-deps` warning

**Cause**: A hook dependency array is missing a value.

**Solution**: Add the missing dependency. If the value is stable (e.g., a setter from `useState`), it can safely be included. If adding it causes an infinite loop, the hook needs to be redesigned (memoize the dependency).

**Do not** add `// eslint-disable-next-line` without a documented reason.

---

### `database.types.ts` is out of sync with the schema

**Cause**: A migration was applied but types were not regenerated.

**Solution**:
```bash
# From local Supabase
npx supabase gen types typescript --local > src/types/database.types.ts

# From cloud project
npx supabase gen types typescript --project-id your-project-ref > src/types/database.types.ts
```

---

### Supabase RLS policy returning empty results instead of data

**Cause**: The authenticated user's JWT claim is not matching the policy condition.

**Solution**:
1. Check that the user is authenticated: `const { data: { session } } = await supabase.auth.getSession()`.
2. Inspect the JWT: `console.log(session?.access_token)` and decode at [jwt.io](https://jwt.io).
3. Verify the policy condition matches the actual JWT structure.
4. Check that `auth.uid()` is returning the expected UUID.

Use the Supabase dashboard's **SQL Editor** to test policies directly:
```sql
-- Test as a specific user
SET local role authenticated;
SET local "request.jwt.claims" TO '{"sub": "user-uuid-here", "role": "authenticated"}';
SELECT * FROM persons WHERE id = 'target-person-id';
```

---

*This document should be updated whenever the development workflow, tooling, or environment requirements change.*
