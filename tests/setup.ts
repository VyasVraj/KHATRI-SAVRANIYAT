/**
 * Vitest test setup
 *
 * Runs before each test file.
 * Configures testing-library and any global mocks.
 */

import '@testing-library/jest-dom'

// Mock environment variables for tests
// These do NOT contain real credentials — tests should mock Supabase
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_SUPABASE_URL: 'https://test-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    VITE_APP_NAME: 'Community Roots (Test)',
    VITE_APP_VERSION: '0.1.0',
    VITE_APP_ENV: 'development',
    VITE_FEATURE_REGISTRATION: 'true',
    VITE_FEATURE_FAMILY_TREE: 'false',
    VITE_FEATURE_COMMUNITY: 'false',
    MODE: 'test',
    DEV: true,
    PROD: false,
  },
  writable: true,
})
