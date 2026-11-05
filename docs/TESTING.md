# docs/TESTING.md

# Testing Strategy

**Product:** Community Roots
**Version:** 0.1.0
**Status:** Phase 16 — Load / Production Readiness Complete

---

## Testing Philosophy

A feature is not complete merely because it works visually.

Testing layers enforce:
1. Logic correctness
2. Data integrity
3. Authorization boundaries
4. Privacy enforcement
5. Critical user workflows

---

## Testing Layers

### Unit Tests (`tests/unit/`)

Test isolated functions, hooks, and components.

Framework: **Vitest + Testing Library**

Scope:
- Utility functions
- Validation schemas (Zod)
- Business logic functions
- Custom hooks
- Individual component rendering and interaction

### Integration Tests (`tests/integration/`)

Test service integrations and multi-component workflows.

Framework: **Vitest + Testing Library**

Scope:
- Service functions with mocked Supabase
- Form submission workflows
- Complex state interactions

### E2E Tests (`tests/e2e/`)

Test full user workflows in a real browser.

Framework: **Playwright** (scaffolded in Phase 15)

Structure:
- `tests/e2e/fixtures/`: Reusable fixtures (`auth.fixture.ts` for unauthenticated & authenticated sessions)
- `tests/e2e/helpers/`: Reusable navigation and UI assertions (`navigation.helper.ts`)
- `tests/e2e/specs/`: E2E test specs (e.g., `smoke.spec.ts`)

Scope:
- Smoke tests: root landing page, route guards, sign-in forms, 404 pages
- Registration and login flows
- Family creation wizard
- Discovery and search
- Connection requests
- Critical admin flows

### Security Tests (`tests/security/`)

Test authorization, privacy, and access control boundaries.

**CRITICAL RULE:** Every RLS policy must have BOTH:
1. A **positive test** — user CAN access their own authorized data
2. A **negative test** — user CANNOT access another user's private data

Scope:
- RLS policy tests (positive + negative)
- IDOR prevention
- Privilege escalation attempts
- Privacy level enforcement
- Unauthorized family access attempts

### Load Tests (`tests/load/`)

Test system behavior under realistic concurrent load (Phase 16 Subtask 3).

Tool: **k6** (see `tests/load/README.md` for installation and execution instructions).

**MANDATORY SAFETY RULE:** Never run load tests against the production environment. Tests must target local preview or isolated staging instances via `K6_BASE_URL`.

Configurable Concurrency Tiers:
- `smoke`: 5 VUs (script validation)
- `100`: 100 VUs (baseline active community)
- `500`: 500 VUs (event peak)
- `1000`: 1,000 VUs (announcement / newsletter surge)
- `2000`: 2,000 VUs (census campaign)
- `5000`: 5,000 VUs (stress test)

Workload Distribution:
- 80% directory and profile reads
- 15% family tree graph retrieval
- 5% safe, non-destructive authenticated actions

Performance Thresholds (per `docs/SCALING.md`):
- `http_req_duration`: p(95) < 500ms, p(99) < 1000ms
- `http_req_failed`: < 1% error rate
- `checks`: > 99% pass rate


---

## Running Tests

```bash
# Run all unit/integration/security tests once (Vitest)
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run Vitest with UI
npm run test:ui

# Run Playwright E2E tests (headless)
npm run test:e2e

# Run Playwright E2E tests with Interactive UI
npm run test:e2e:ui

# Run Playwright E2E tests with headed browser
npm run test:e2e:headed
```

---

## E2E Testing Guide (Playwright)

### Local Execution
Playwright tests reside in `tests/e2e/specs/`.
When `npm run test:e2e` is executed locally:
1. Playwright inspects `PLAYWRIGHT_BASE_URL` (defaults to `http://localhost:5173`).
2. If no server is already running, Playwright automatically spawns the Vite dev server via `webServer` in `playwright.config.ts`.
3. Tests run in parallel using the installed Chromium browser binary.

### Environment Variables
- `PLAYWRIGHT_BASE_URL`: Base URL for test target (e.g., `http://localhost:5173` or preview/staging URL).
- `E2E_TEST_USER_EMAIL`: Dedicated test user email for authenticated fixtures.
- `E2E_TEST_USER_PASSWORD`: Dedicated test user password for authenticated fixtures.
- `CI`: Set to `true` in CI environments to enforce single-worker runs, 2 retries, and failure tracing.

### Security and Isolation Rules for E2E
- **NEVER** use real production credentials or personal accounts in E2E tests.
- **NEVER** commit `.env` or secret variables containing test passwords.
- Test accounts must only be provisioned in local Supabase or dedicated testing environments.
- E2E tests interact strictly through UI controls and do not bypass RLS policies or inject `service_role` keys.
- Unauthenticated smoke tests run deterministically without requiring seeded users or live network credentials.

### Guidelines for Adding New E2E Tests
1. Place test files in `tests/e2e/specs/` with the `.spec.ts` suffix.
2. Import `test` and `expect` from `@/tests/e2e/fixtures/auth.fixture` (or relative path `../fixtures/auth.fixture`).
3. Use accessible locators (`page.getByRole(...)`, `page.getByLabel(...)`, `page.getByText(...)`) rather than fragile CSS class selectors.
4. Use helpers in `tests/e2e/helpers/navigation.helper.ts` for common navigation and assertions.
5. Ensure tests clean up any created state or operate on isolated entities.

---

## Continuous Integration (GitHub Actions)

The repository runs an automated CI pipeline (`.github/workflows/ci.yml`) on:
- Every pull request targeting `main`
- Every push to `main`

### CI Verification Sequence
1. **Dependency Installation**: `npm ci` ensuring reproducible installations from `package-lock.json` with npm cache.
2. **TypeScript Validation**: `npm run type-check` (`tsc --noEmit`) in strict mode.
3. **Static Analysis**: `npm run lint` (`eslint`) with zero warnings tolerated (`--max-warnings 0`).
4. **Unit, Integration & Security Tests**: `npm run test` (`vitest run`) executing all 2,247 automated tests.
5. **Production Build**: `npm run build` validating production compilation, tree-shaking, and sourcemap suppression.
6. **Playwright E2E Smoke Tests**: `npx playwright test` with headless Chromium, auto-spawning the Vite preview server.

### Local Reproduction of CI
To reproduce the full CI gate locally, run:
```bash
npm ci
npm run type-check
npm run lint
npm run test
npm run build
npx playwright test
```

### Security & Token Permissions
- CI workflow permissions are restricted to `contents: read`.
- No `service_role` keys, database passwords, or production secrets are exposed or required in CI.
- Smoke tests run deterministically against unauthenticated routes and route guards without live third-party network dependencies.

---

## Test Coverage Targets

| Layer | Target Coverage |
|---|---|
| Utility functions | 95%+ |
| Validation schemas | 90%+ |
| Business logic | 80%+ |
| Components | 70%+ (critical paths) |
| RLS policies | 100% (positive + negative for each) |

Coverage numbers are targets, not gates for Phase 0.
Security tests must achieve 100% RLS coverage.

---

## Test Data Rules

- Test data must NOT contain real personal information
- Use realistic-looking but entirely fictional data
- Never run tests against production data
- Never commit real credentials in test files
- Mock Supabase client in unit/integration tests
