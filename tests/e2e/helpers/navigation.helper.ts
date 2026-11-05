/**
 * Navigation Helpers and Assertions for Playwright E2E Tests
 *
 * Provides reusable, resilient navigation functions and accessible assertions.
 */

import { expect, type Page } from '@playwright/test'

/**
 * Navigate to home/landing page
 */
export async function gotoHome(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Navigate to sign-in page
 */
export async function gotoSignIn(page: Page): Promise<void> {
  await page.goto('/auth/sign-in')
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Navigate to sign-up page
 */
export async function gotoSignUp(page: Page): Promise<void> {
  await page.goto('/auth/sign-up')
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Navigate to a protected route directly (e.g. /people, /families, /admin)
 */
export async function gotoProtectedRoute(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Assert that an unauthenticated navigation was redirected to the sign-in page
 */
export async function expectRedirectToSignIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await expect(
    page.getByRole('heading', { name: /sign in to your account/i }),
  ).toBeVisible()
}

/**
 * Assert that the 404 Not Found page is displayed
 */
export async function expectNotFoundPage(page: Page): Promise<void> {
  await expect(page.getByText('404')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: /page not found/i }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible()
}
