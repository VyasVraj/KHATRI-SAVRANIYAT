# Community Roots

A community-facing platform for family census, genealogical family tree building, community directory, and connection management.

---

## Overview

**Community Roots** enables communities to:

- Maintain a **community census** — a structured, verified registry of individuals and families.
- Build and explore **family trees** — interactive genealogical trees with relationship management.
- Browse a **community directory** — a searchable, privacy-respecting listing of members.
- Manage **connections** — track relationships between individuals, families, and community groups.

The platform is designed for close-knit communities (cultural, religious, regional) that need to preserve family history while respecting modern privacy expectations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript 5 |
| Styling | Tailwind CSS, shadcn/ui (Radix UI) |
| Routing | React Router v6 |
| Data Fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Tree Visualization | React Flow |
| Backend | Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions) |

---

## Quick Start

### Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher
- A [Supabase](https://supabase.com) account (free tier is sufficient for development)

### Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd "family Tree"

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
```

Edit `.env` with your Supabase project credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Supabase Setup**: Create a project at [supabase.com](https://supabase.com/dashboard). Find your Project URL and anon key under **Project Settings → API**.

```bash
# 4. Start the development server
npm run dev
```

The application will be available at [http://localhost:5173](http://localhost:5173).

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite development server with HMR |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run type-check` | Run TypeScript compiler check without emitting |
| `npm run lint` | Run ESLint across all source files |
| `npm run test` | Run Vitest unit and integration test suite |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run preview` | Preview the production build locally |
| `npm run format` | Format code with Prettier |

---

## Project Structure

```
family Tree/
├── src/
│   ├── app/            # Router, providers, global store
│   ├── features/       # Feature domains (auth, people, families, tree, ...)
│   ├── components/     # Shared UI components (shadcn/ui, layout, forms)
│   ├── hooks/          # Shared custom hooks
│   ├── lib/            # Core singletons (supabase client, query client)
│   ├── services/       # Shared data-access service functions
│   ├── types/          # Global TypeScript types (includes DB codegen)
│   ├── constants/      # Routes, privacy levels, config
│   ├── utils/          # Pure utility functions
│   └── styles/         # Global CSS
├── supabase/
│   ├── migrations/     # SQL migrations (immutable once applied)
│   └── functions/      # Edge Functions
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── security/       # RLS policy tests
└── docs/               # Engineering documentation
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for a detailed walkthrough of the project structure and developer setup.

---

## Documentation

| Document | Description |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Primary instruction file for AI agents and contributors |
| [`ROADMAP.md`](ROADMAP.md) | Project phases and feature roadmap |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture and design decisions |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security model, threat model, and rules |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Database schema, RLS strategy, migration discipline |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Developer setup, workflow, and code conventions |

---

## Contributing

All contributors (human and AI) must read [`AGENTS.md`](AGENTS.md) before making any changes to this project. It contains the architectural rules, security requirements, testing standards, and workflow that all contributions must follow.

Key rules:
- **Search before creating** — check for existing implementations first.
- **Phase-gating** — only implement work authorized by the current phase.
- **RLS tests** — every database policy needs positive and negative tests.
- **Never commit secrets** — use `.env` (gitignored), never `VITE_SERVICE_ROLE_KEY`.

---

## License

*License TBD — All rights reserved until further notice.*

---

*Built for community, by the community.*
