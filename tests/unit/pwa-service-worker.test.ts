/**
 * PWA Service Worker Cache & Security Boundary Tests
 *
 * Verifies:
 * 1. sw.js defines strict cache boundaries.
 * 2. Static application bundle (/assets/*, /index.html) is allowed.
 * 3. Supabase REST, RPC, Auth, and Storage are strictly excluded from Cache Storage.
 * 4. Mutations (POST, PUT, PATCH, DELETE) are never cached.
 * 5. SKIP_WAITING event is listened for and handled.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('PWA Service Worker Cache & Security Boundaries', () => {
  const swPath = path.join(process.cwd(), 'public', 'sw.js')

  it('1. sw.js exists and defines explicit static precache list', () => {
    expect(fs.existsSync(swPath)).toBe(true)
    const swCode = fs.readFileSync(swPath, 'utf8')

    expect(swCode).toContain('STATIC_PRECACHE_URLS')
    expect(swCode).toContain("'/index.html'")
    expect(swCode).toContain("'/manifest.webmanifest'")
    expect(swCode).toContain("'/pwa-192x192.png'")
    expect(swCode).toContain("'/pwa-512x512.png'")
  })

  it('2. service worker enforces strict static-only cache eligibility rules', () => {
    const swCode = fs.readFileSync(swPath, 'utf8')

    // Only GET requests allowed
    expect(swCode).toContain("request.method !== 'GET'")

    // Rejects external origins (e.g. *.supabase.co)
    expect(swCode).toContain("url.origin !== self.location.origin")

    // Explicitly rejects API and Supabase paths
    expect(swCode).toContain("pathname.startsWith('/rest/')")
    expect(swCode).toContain("pathname.startsWith('/auth/')")
    expect(swCode).toContain("pathname.startsWith('/storage/')")
    expect(swCode).toContain("pathname.startsWith('/realtime/')")

    // Allows only content-hashed Vite bundle assets and declared shell assets
    expect(swCode).toContain("pathname.startsWith('/assets/')")
  })

  it('3. service worker listens for SKIP_WAITING message', () => {
    const swCode = fs.readFileSync(swPath, 'utf8')

    expect(swCode).toContain("event.data.type === 'SKIP_WAITING'")
    expect(swCode).toContain('self.skipWaiting()')
  })

  it('4. service worker provides safe offline HTML shell fallback for navigations', () => {
    const swCode = fs.readFileSync(swPath, 'utf8')

    expect(swCode).toContain("request.mode === 'navigate'")
    expect(swCode).toContain("cache.match('/index.html')")
  })
})
