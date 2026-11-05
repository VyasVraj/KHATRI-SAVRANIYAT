/**
 * Security specification tests for defensive headers and CSP configuration (Phase 15 Subtask 1)
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Defensive Security Headers & CSP Configuration (Phase 15 Subtask 1)', () => {
  const rootDir = path.resolve(__dirname, '../../')
  const viteConfigContent = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf-8')
  const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8')

  describe('Vite Server & Preview Security Headers', () => {
    it('configures server.headers with defensive security headers', () => {
      expect(viteConfigContent).toMatch(/server:\s*\{[\s\S]*?headers:\s*\{/)
      expect(viteConfigContent).toContain("'X-Content-Type-Options': 'nosniff'")
      expect(viteConfigContent).toContain("'X-Frame-Options': 'DENY'")
      expect(viteConfigContent).toContain("'Referrer-Policy': 'strict-origin-when-cross-origin'")
      expect(viteConfigContent).toContain("'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'")
    })

    it('configures preview.headers with identical defensive security headers', () => {
      expect(viteConfigContent).toMatch(/preview:\s*\{[\s\S]*?headers:\s*\{/)
    })

    it('enforces complete CSP baseline with Realtime WebSocket support in Vite headers', () => {
      // Must contain all core CSP directives
      expect(viteConfigContent).toContain("default-src 'self'")
      expect(viteConfigContent).toContain("script-src 'self'")
      expect(viteConfigContent).toContain("style-src 'self' 'unsafe-inline'")
      expect(viteConfigContent).toContain("img-src 'self' data: blob: https://*.supabase.co")
      expect(viteConfigContent).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
      expect(viteConfigContent).toContain("font-src 'self'")
      expect(viteConfigContent).toContain("object-src 'none'")
      expect(viteConfigContent).toContain("frame-ancestors 'none'")
      expect(viteConfigContent).toContain("base-uri 'self'")
    })
  })

  describe('HTML Document Baseline Meta Tags', () => {
    it('contains nosniff and referrer meta tags in index.html', () => {
      expect(indexHtmlContent).toContain('<meta http-equiv="X-Content-Type-Options" content="nosniff" />')
      expect(indexHtmlContent).toContain('<meta name="referrer" content="strict-origin-when-cross-origin" />')
    })

    it('contains document CSP baseline allowing Supabase HTTPS and WSS connections', () => {
      expect(indexHtmlContent).toContain('http-equiv="Content-Security-Policy"')
      expect(indexHtmlContent).toContain("default-src 'self'")
      expect(indexHtmlContent).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
      expect(indexHtmlContent).toContain("img-src 'self' data: blob: https://*.supabase.co")
      expect(indexHtmlContent).toContain("object-src 'none'")
    })

    it('does NOT deliver frame-ancestors via <meta> tag (W3C specification rule)', () => {
      // The W3C specification dictates that frame-ancestors is ignored in meta tags.
      // Therefore, frame-ancestors must only exist in HTTP headers, not in index.html meta CSP.
      const metaCspMatch = indexHtmlContent.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
      expect(metaCspMatch).toBeTruthy()
      if (metaCspMatch) {
        expect(metaCspMatch[1]).not.toContain('frame-ancestors')
      }
    })
  })

  describe('Production Build, Hosting Headers & SPA Routing (Phase 16 Subtask 1)', () => {
    const publicHeadersPath = path.join(rootDir, 'public/_headers')
    const publicRedirectsPath = path.join(rootDir, 'public/_redirects')

    it('configures sourcemap generation to be environment-aware and disabled by default in production', () => {
      expect(viteConfigContent).toContain("sourcemap: process.env.VITE_ENABLE_SOURCEMAP === 'true'")
    })

    it('contains authoritative static security headers in public/_headers for production hosting', () => {
      expect(fs.existsSync(publicHeadersPath)).toBe(true)
      const headersContent = fs.readFileSync(publicHeadersPath, 'utf-8')

      // Verifies global headers
      expect(headersContent).toContain('X-Content-Type-Options: nosniff')
      expect(headersContent).toContain('X-Frame-Options: DENY')
      expect(headersContent).toContain('Referrer-Policy: strict-origin-when-cross-origin')
      expect(headersContent).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=()')

      // Verifies production Content-Security-Policy
      expect(headersContent).toContain("default-src 'self'")
      expect(headersContent).toContain("script-src 'self'")
      expect(headersContent).toContain("style-src 'self' 'unsafe-inline'")
      expect(headersContent).toContain('https://*.supabase.co')
      expect(headersContent).toContain('wss://*.supabase.co')
      expect(headersContent).toContain("frame-ancestors 'none'")
      expect(headersContent).toContain("base-uri 'self'")

      // Verifies caching directives
      expect(headersContent).toContain('/assets/*')
      expect(headersContent).toContain('Cache-Control: public, max-age=31536000, immutable')
      expect(headersContent).toContain('/index.html')
      expect(headersContent).toContain('Cache-Control: no-cache, no-store, must-revalidate')
    })

    it('contains SPA fallback redirect rules in public/_redirects for client-side routing', () => {
      expect(fs.existsSync(publicRedirectsPath)).toBe(true)
      const redirectsContent = fs.readFileSync(publicRedirectsPath, 'utf-8')
      expect(redirectsContent).toMatch(/\/\*\s+\/index\.html\s+200/)
    })

    it('contains public/health.json liveness probe and authoritative headers in public/_headers', () => {
      const publicHealthPath = path.join(rootDir, 'public/health.json')
      expect(fs.existsSync(publicHealthPath)).toBe(true)

      const healthContent = JSON.parse(fs.readFileSync(publicHealthPath, 'utf-8'))
      expect(healthContent.status).toBe('pass')
      expect(healthContent.service).toBe('community-roots')
      expect(healthContent.version).toBe('0.1.0')

      const headersContent = fs.readFileSync(publicHeadersPath, 'utf-8')
      expect(headersContent).toContain('/health.json')
      expect(headersContent).toContain('Content-Type: application/json; charset=utf-8')
    })
  })
})
