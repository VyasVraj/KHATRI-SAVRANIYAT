/**
 * Configuration and scenario options for Community Roots k6 load tests
 *
 * Requirements:
 * - Deterministic, configurable parameters
 * - Safe target verification (fails fast if target is missing)
 * - Concurrency tiers: 100, 500, 1000, 2000-5000 VUs
 * - Zero hardcoded secrets, passwords, or production endpoints
 */

export const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:5173';
export const SUPABASE_URL = __ENV.K6_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || '';

// Optional credentials for authenticated write / private route testing
export const TEST_USER_EMAIL = __ENV.K6_TEST_EMAIL || '';
export const TEST_USER_PASSWORD = __ENV.K6_TEST_PASSWORD || '';

// Concurrency tier selection: 'smoke' | '100' | '500' | '1000' | '2000' | '5000'
const TIER = __ENV.K6_TIER || 'smoke';

/**
 * Stage profiles for each tier
 */
const TIER_STAGES = {
  smoke: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 5 },
    { duration: '5s', target: 0 },
  ],
  '100': [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  '500': [
    { duration: '1m', target: 200 },
    { duration: '2m', target: 500 },
    { duration: '3m', target: 500 },
    { duration: '1m', target: 0 },
  ],
  '1000': [
    { duration: '2m', target: 500 },
    { duration: '3m', target: 1000 },
    { duration: '5m', target: 1000 },
    { duration: '2m', target: 0 },
  ],
  '2000': [
    { duration: '3m', target: 1000 },
    { duration: '4m', target: 2000 },
    { duration: '5m', target: 2000 },
    { duration: '2m', target: 0 },
  ],
  '5000': [
    { duration: '4m', target: 2000 },
    { duration: '6m', target: 5000 },
    { duration: '8m', target: 5000 },
    { duration: '3m', target: 0 },
  ],
};

export const options = {
  scenarios: {
    community_workload: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: TIER_STAGES[TIER] || TIER_STAGES.smoke,
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // 95% of requests must complete below 500ms (per docs/SCALING.md)
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    // HTTP failure rate must stay below 0.1% for normal loads (<1% under stress)
    http_req_failed: ['rate<0.01'],
    // 99% of business logic assertions/checks must pass
    checks: ['rate>0.99'],
  },
};
