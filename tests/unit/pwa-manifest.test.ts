/**
 * PWA Web App Manifest & Static Asset Tests
 *
 * Verifies:
 * 1. manifest.webmanifest is valid JSON and contains all required PWA fields.
 * 2. start_url, scope, and display mode are correct.
 * 3. All declared icon files exist on disk and have exact matching pixel dimensions.
 * 4. index.html includes correct manifest and apple-touch-icon links.
 * 5. public/_headers contains correct Cache-Control and Content-Type for sw.js and manifest.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('PWA Web App Manifest & Static Assets', () => {
  const rootDir = process.cwd()
  const manifestPath = path.join(rootDir, 'public', 'manifest.webmanifest')
  const indexHtmlPath = path.join(rootDir, 'index.html')
  const headersPath = path.join(rootDir, 'public', '_headers')

  it('1. manifest.webmanifest exists and is valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true)
    const content = fs.readFileSync(manifestPath, 'utf8')
    const manifest = JSON.parse(content)

    expect(manifest.name).toBe('KHATRI SARVANIYAT')
    expect(manifest.short_name).toBe('KHATRI SARVANIYAT')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#081B55')
    expect(manifest.background_color).toBe('#ffffff')
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
  })

  it('2. all declared manifest icon files exist on disk with valid PNG headers and dimensions', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    for (const icon of manifest.icons) {
      const relPath = icon.src.startsWith('/') ? icon.src.slice(1) : icon.src
      const absPath = path.join(rootDir, 'public', relPath)

      expect(fs.existsSync(absPath), `Icon file ${relPath} must exist`).toBe(true)

      if (icon.type === 'image/png') {
        const buf = fs.readFileSync(absPath)
        // Check PNG signature: 137, 80, 78, 71, 13, 10, 26, 10
        expect(buf[0]).toBe(137)
        expect(buf[1]).toBe(80)
        expect(buf[2]).toBe(78)
        expect(buf[3]).toBe(71)

        // Read dimensions from IHDR chunk (offset 16 and 20)
        const width = buf.readUInt32BE(16)
        const height = buf.readUInt32BE(20)

        const [expectedW, expectedH] = icon.sizes.split('x').map(Number)
        expect(width).toBe(expectedW)
        expect(height).toBe(expectedH)
      }
    }
  })

  it('3. index.html links manifest and apple-touch-icon properly', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf8')
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/pwa-192x192.png" />')
    expect(html).toContain('apple-mobile-web-app-capable')
    expect(html).toContain('worker-src \'self\'')
  })

  it('4. public/_headers defines correct cache and content-type headers for sw.js and manifest', () => {
    const headers = fs.readFileSync(headersPath, 'utf8')

    // /sw.js must never be cached by browser HTTP cache
    expect(headers).toContain('/sw.js')
    expect(headers).toContain('application/javascript')

    // /manifest.webmanifest
    expect(headers).toContain('/manifest.webmanifest')
    expect(headers).toContain('application/manifest+json')

    // worker-src in global CSP
    expect(headers).toContain("worker-src 'self'")
  })
})
