# Community Roots — Load Testing Suite (k6)

This directory contains the performance and concurrency validation suite for Community Roots, designed to evaluate application responsiveness under realistic community usage patterns (100 to 5,000+ concurrent users).

---

## ⚠️ MANDATORY SAFETY RULE: NO PRODUCTION TESTING

**NEVER execute k6 load tests against the live production deployment (`<PRODUCTION_DOMAIN>`) or the production Supabase database.**

- Load tests must only be run against **isolated local instances** or **dedicated staging environments**.
- The load testing suite requires the target URL to be explicitly provided via environment variables.

---

## 1. Prerequisites & Installation

k6 is an external performance testing executable. It is not bundled as an npm package.

### Windows (Developer Environment)
Install via Winget or Chocolatey:
```powershell
# Using Winget
winget install k6 --source winget

# Or using Chocolatey
choco install k6
```

### macOS
```bash
brew install k6
```

### Linux / CI
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

---

## 2. Workload Distribution

The suite implements the Phase 16 discovery performance profile:

| Workload Category | Traffic Ratio | Operation Examples |
|---|---|---|
| **Directory & Profiles** | **80%** | Browsing `/discover`, directory pagination, profile details |
| **Family Tree** | **15%** | Loading tree shell, retrieving bounded relationships |
| **Authenticated Operations** | **5%** | Idempotent preference update via `rpc/update_my_notification_preferences` (when credentials provided); skipped/fallback to `/auth/sign-in` when credentials absent |

All scenarios are strictly **non-destructive**. The suite never executes DELETE operations, deletes user accounts, accepts invitations, or modifies canonical genealogy data.

### Workload Semantics (With vs Without Credentials)
- **With Test Credentials (`K6_TEST_EMAIL` & `K6_TEST_PASSWORD`)**:
  - Setup logs in via Supabase Auth and acquires a scoped bearer JWT.
  - The 5% workload executes the authoritative `update_my_notification_preferences` RPC, validating write concurrency, transactional upsert performance, and auth verification.
- **Without Test Credentials**:
  - The test suite executes in **pure unauthenticated mode**.
  - The 5% workload falls back to requesting the public `/auth/sign-in` landing page and is explicitly recorded under `Unauthenticated Fallback (Authenticated Scenario Skipped)`.
  - It is **never** counted or mislabeled as an authenticated write.

---

## 3. Concurrency Tiers

Select the concurrency tier via the `K6_TIER` environment variable:

| Tier Key | Virtual Users (VUs) | Target Use Case |
|---|---|---|
| `smoke` | 5 VUs | Smoke validation of script correctness and connectivity |
| `100` | 100 VUs | Typical community active baseline |
| `500` | 500 VUs | Weekend community event or active browsing |
| `1000` | 1,000 VUs | Community announcement / newsletter broadcast surge |
| `2000` | 2,000 VUs | Annual census / record verification campaign |
| `5000` | 5,000 VUs | Peak stress / viral community engagement |

---

## 4. Running Load Tests

### A. Safe Smoke Test (Local Dev / Preview Server)
Start the local preview server in one terminal:
```bash
npm run build
npm run preview -- --port 5173
```

In a second terminal, execute the k6 smoke test:
```bash
# Windows PowerShell
$env:K6_BASE_URL="http://localhost:5173"
$env:K6_TIER="smoke"
k6 run tests/load/community-load.js

# Linux / macOS
K6_BASE_URL=http://localhost:5173 K6_TIER=smoke k6 run tests/load/community-load.js
```

### B. Higher Tiers with Staging Target & Authentication
To test against a provisioned staging environment with an authenticated test user:
```bash
K6_BASE_URL=https://staging.yourdomain.example \
K6_SUPABASE_URL=https://staging-project.supabase.co \
K6_SUPABASE_ANON_KEY=eyJ... \
K6_TEST_EMAIL=loadtest-user@example.com \
K6_TEST_PASSWORD="TestPassword123!" \
K6_TIER=100 \
k6 run --summary-export=tests/load/results/tier-100-summary.json tests/load/community-load.js
```

---

## 5. Performance Thresholds

Per `docs/SCALING.md`, the suite establishes the following engineering acceptance targets:

- `http_req_duration`: **p(95) < 500ms**, **p(99) < 1000ms**
- `http_req_failed`: **< 1% error rate**
- `checks`: **> 99% assertion pass rate**

Threshold breaches highlight performance degradation under load and identify database query bottlenecks (e.g. index contention on trigram search or unindexed relationship traversals).

---

## 6. Security & Credentials Policy

- **No Hardcoded Secrets**: All URLs, keys, and credentials must be injected at runtime via environment variables.
- **Credential Masking**: k6 scripts never log authorization headers, Bearer tokens, or raw credentials to stdout.
- **Git Safety**: Results in `tests/load/results/` and `*.k6-summary.json` are excluded in `.gitignore`.
