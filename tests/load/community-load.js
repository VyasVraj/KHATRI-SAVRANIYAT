import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  options as baseOptions,
} from './config.js';

export const options = baseOptions;

// Custom Metrics
const directorySearchLatency = new Trend('directory_search_duration');
const familyTreeLatency = new Trend('family_tree_duration');
const authLatency = new Trend('auth_duration');
const failedActions = new Rate('failed_actions');
const iterationsCounter = new Counter('completed_iterations');

/**
 * Setup function: Validates environment and establishes optional test user token.
 * Never logs credentials, tokens, or sensitive headers.
 */
export function setup() {
  if (!BASE_URL) {
    throw new Error('K6_BASE_URL environment variable must be set.');
  }

  let authToken = null;

  // Optional: Authenticate test user against target if credentials provided
  if (SUPABASE_URL && SUPABASE_ANON_KEY && TEST_USER_EMAIL && TEST_USER_PASSWORD) {
    const authPayload = JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    const res = http.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      authPayload,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (res.status === 200) {
      const data = res.json();
      authToken = data.access_token || null;
    }
  }

  return { authToken };
}

/**
 * Default scenario execution:
 * Target Workload Distribution:
 * - 80% Directory & Profile Reads
 * - 15% Family Tree Navigation
 * - 5% Authenticated / Write Operations (Profile preferences or read-after-write)
 */
export default function (data) {
  const rand = Math.random();

  if (rand < 0.8) {
    // 80% — Directory & Profile Reads
    group('Directory & Profile Browsing', function () {
      // 1. Directory Page Shell & Assets
      const dirRes = http.get(`${BASE_URL}/discover`);
      check(dirRes, {
        'discover page status is 200': (r) => r.status === 200,
      });

      // 2. Direct API query to persons directory (if SUPABASE_URL configured)
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        const queryStart = Date.now();
        const apiRes = http.get(
          `${SUPABASE_URL}/rest/v1/persons?select=id,first_name,last_name,status,profile_privacy&limit=25`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: data.authToken ? `Bearer ${data.authToken}` : `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );
        directorySearchLatency.add(Date.now() - queryStart);

        check(apiRes, {
          'persons query returns valid status (200 or 401 if unauth)': (r) =>
            r.status === 200 || r.status === 401,
        });
      }

      sleep(1);
    });
  } else if (rand < 0.95) {
    // 15% — Family Tree Navigation
    group('Family Tree Retrieval', function () {
      // 1. Tree Page Shell
      const treeRes = http.get(`${BASE_URL}/people`);
      check(treeRes, {
        'people tree shell loads with 200': (r) => r.status === 200,
      });

      // 2. Direct API call to relationships (bounded traversal)
      if (SUPABASE_URL && SUPABASE_ANON_KEY && data.authToken) {
        const treeStart = Date.now();
        const relRes = http.get(
          `${SUPABASE_URL}/rest/v1/relationships?select=id,person_a_id,person_b_id,relationship_type&limit=50`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${data.authToken}`,
            },
          }
        );
        familyTreeLatency.add(Date.now() - treeStart);

        check(relRes, {
          'relationships query returns 200': (r) => r.status === 200,
        });
      }

      sleep(2);
    });
  } else {
    // 5% — Authenticated Operations (Safe, idempotent user preference update via authoritative RPC)
    if (data.authToken && SUPABASE_URL && SUPABASE_ANON_KEY) {
      group('Authenticated Preferences Mutation (RPC)', function () {
        const opStart = Date.now();
        // Uses the authoritative update_my_notification_preferences SECURITY DEFINER RPC
        // Idempotent, scoped strictly to auth.uid(), zero fan-out, zero uncontrolled side-effects
        const prefPayload = JSON.stringify({
          p_in_app_enabled: true,
          p_email_enabled: true,
          p_email_connections: true,
          p_email_invitations: true,
          p_email_claims: true,
          p_email_verifications: true,
          p_email_announcements: false,
          p_email_events: true,
          p_email_family_media: false,
        });

        const prefRes = http.post(
          `${SUPABASE_URL}/rest/v1/rpc/update_my_notification_preferences`,
          prefPayload,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${data.authToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        authLatency.add(Date.now() - opStart);

        check(prefRes, {
          'update notification preferences RPC succeeds with 200': (r) => r.status === 200,
        });

        sleep(2);
      });
    } else {
      // When credentials are unavailable, authenticated operations cannot be performed.
      // Explicitly mark scenario as unauthenticated fallback rather than mislabeling as an authenticated write.
      group('Unauthenticated Fallback (Authenticated Scenario Skipped)', function () {
        const authRes = http.get(`${BASE_URL}/auth/sign-in`);
        check(authRes, {
          'unauthenticated sign-in page fallback status is 200': (r) => r.status === 200,
        });
        sleep(1);
      });
    }
  }

  iterationsCounter.add(1);
}

/**
 * Teardown function: Safely finishes test execution.
 */
export function teardown(data) {
  // No destructive cleanup needed since all operations are non-destructive
}
