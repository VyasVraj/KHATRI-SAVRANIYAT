/**
 * Smoke Tests — Playwright E2E Test Suite
 *
 * Scaffolding smoke tests for Community Roots:
 * 1. Root landing page loads with hero and CTA elements.
 * 2. Unauthenticated navigation to protected routes redirects to /auth/sign-in.
 * 3. Sign-in page renders accessible form controls and links.
 * 4. Non-existent routes display the accessible 404 Not Found page.
 *
 * These tests are deterministic, non-flaky, and do not mutate any persistent state.
 */

import { test, expect } from '../fixtures/auth.fixture'
import {
  gotoHome,
  gotoSignIn,
  gotoProtectedRoute,
  expectRedirectToSignIn,
  expectNotFoundPage,
} from '../helpers/navigation.helper'

test.describe('Community Roots — E2E Smoke Suite', () => {
  test('Root landing page loads and displays core hero content', async ({
    unauthenticatedPage,
  }) => {
    await gotoHome(unauthenticatedPage)

    // Verify main hero heading
    await expect(
      unauthenticatedPage.getByRole('heading', {
        name: /preserve your family legacy/i,
      }),
    ).toBeVisible()

    // Verify call-to-action buttons
    await expect(
      unauthenticatedPage.getByRole('link', { name: /register your family/i }),
    ).toBeVisible()
    await expect(
      unauthenticatedPage.getByRole('link', { name: /find my family/i }),
    ).toBeVisible()

    // Verify features section heading
    await expect(
      unauthenticatedPage.getByRole('heading', {
        name: /everything your community needs/i,
      }),
    ).toBeVisible()
  })

  test('Protected route (/people) redirects unauthenticated user to sign-in', async ({
    unauthenticatedPage,
  }) => {
    await gotoProtectedRoute(unauthenticatedPage, '/people')
    await expectRedirectToSignIn(unauthenticatedPage)
  })

  test('Protected route (/families) redirects unauthenticated user to sign-in', async ({
    unauthenticatedPage,
  }) => {
    await gotoProtectedRoute(unauthenticatedPage, '/families')
    await expectRedirectToSignIn(unauthenticatedPage)
  })

  test('Sign-in page renders expected form fields and accessible controls', async ({
    unauthenticatedPage,
  }) => {
    await gotoSignIn(unauthenticatedPage)

    // Form heading
    await expect(
      unauthenticatedPage.getByRole('heading', {
        name: /sign in to your account/i,
      }),
    ).toBeVisible()

    // Form inputs and submit button
    await expect(
      unauthenticatedPage.getByLabel(/email address/i),
    ).toBeVisible()
    await expect(
      unauthenticatedPage.getByLabel(/^password/i),
    ).toBeVisible()
    await expect(
      unauthenticatedPage.getByRole('button', { name: /sign in/i }),
    ).toBeVisible()

    // Auxiliary navigation links
    await expect(
      unauthenticatedPage.getByRole('link', { name: /forgot password\?/i }),
    ).toBeVisible()
    await expect(
      unauthenticatedPage.getByRole('link', { name: /sign up/i }),
    ).toBeVisible()
  })

  test('Non-existent route renders 404 Not Found page with return link', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/non-existent-route-smoke-test')
    await expectNotFoundPage(unauthenticatedPage)

    // Clicking "Back to Home" navigates back to root
    await unauthenticatedPage.getByRole('link', { name: /back to home/i }).click()
    await expect(
      unauthenticatedPage.getByRole('heading', {
        name: /preserve your family legacy/i,
      }),
    ).toBeVisible()
  })
})
