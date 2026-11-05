/**
 * Auth Fixtures for Playwright E2E Tests
 *
 * Provides reusable test fixtures for:
 * - unauthenticatedPage: Clean browser session with no cached credentials
 * - authenticatedPage: Browser session authenticated using configured test user
 *
 * SECURITY NOTICE:
 * - NEVER hardcode real or production credentials in tests or fixtures.
 * - Test users must be provisioned in a dedicated test/staging environment.
 * - Authenticated tests require:
 *     E2E_TEST_USER_EMAIL
 *     E2E_TEST_USER_PASSWORD
 * - When running in an environment without test user credentials, tests requiring
 *   authenticatedPage will fail early with a clear configuration message.
 */

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture runner passes `use` callback which triggers false-positive React 19 hook warning */

import { test as base, expect, type Page } from '@playwright/test'

/**
 * Helper to perform UI sign-in via the /auth/sign-in form.
 * Uses accessible form controls to simulate real user interactions.
 */
export async function signInWithCredentials(
  page: Page,
  email: string,
  pass: string,
): Promise<void> {
  await page.goto('/auth/sign-in')
  await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible()

  // Fill credentials using accessible form controls
  await page.getByLabel(/email address/i).fill(email)
  await page.getByLabel(/^password/i).fill(pass)

  // Submit form
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait for redirect away from auth page upon successful sign in
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/sign-in'), {
    timeout: 10_000,
  })
}

/**
 * Helper to ensure a completely unauthenticated state by clearing cookies,
 * localStorage, and sessionStorage.
 */
export async function clearAuthState(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

export interface AuthFixtures {
  /**
   * Guaranteed clean, unauthenticated page context.
   */
  unauthenticatedPage: Page

  /**
   * Page context authenticated with the test user specified in environment variables.
   * Throws an informative error if E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not set.
   */
  authenticatedPage: Page
}

export const test = base.extend<AuthFixtures>({
  unauthenticatedPage: async ({ page }, use) => {
    await clearAuthState(page)
    await use(page)
  },

  authenticatedPage: async ({ page }, use) => {
    const testEmail = process.env.E2E_TEST_USER_EMAIL
    const testPassword = process.env.E2E_TEST_USER_PASSWORD

    if (!testEmail || !testPassword) {
      throw new Error(
        'Authenticated E2E tests require E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD to be defined in the environment. ' +
          'Never use production credentials. See docs/TESTING.md for test user configuration instructions.',
      )
    }

    await clearAuthState(page)
    await signInWithCredentials(page, testEmail, testPassword)
    await use(page)
  },
})

export { expect }
