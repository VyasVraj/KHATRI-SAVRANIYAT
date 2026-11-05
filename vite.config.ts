import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; object-src 'none'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self';",
    },
  },
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; object-src 'none'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self';",
    },
  },
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
    tsconfigPaths: true,
  },
  build: {
    // Disable sourcemaps in production builds to prevent exposing source code and DB schemas,
    // while allowing opt-in for internal debugging via VITE_ENABLE_SOURCEMAP=true
    sourcemap: process.env.VITE_ENABLE_SOURCEMAP === 'true',
    // Improve chunk splitting for production
    rollupOptions: {
      output: {
        // In Vite 8, manualChunks must be a function
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor'
            }
            if (id.includes('@radix-ui')) {
              return 'ui'
            }
            if (id.includes('@tanstack')) {
              return 'query'
            }
            if (id.includes('@supabase')) {
              return 'supabase'
            }
            if (id.includes('react-hook-form') || id.includes('zod')) {
              return 'forms'
            }
            if (id.includes('reactflow')) {
              return 'flow'
            }
            if (id.includes('recharts')) {
              return 'charts'
            }
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    env: {
      VITE_SUPABASE_URL: 'https://test-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_APP_NAME: 'Community Roots (Test)',
      VITE_APP_VERSION: '0.1.0',
      VITE_APP_ENV: 'development',
      VITE_FEATURE_REGISTRATION: 'true',
      VITE_FEATURE_FAMILY_TREE: 'false',
      VITE_FEATURE_COMMUNITY: 'false',
    },
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/setup.ts'],
    },
  },
})
