/**
 * KHATRI SARVANIYAT — Production Progressive Web App Service Worker
 *
 * Strict Cache Security & Architecture Invariants:
 * 1. ONLY static application shell resources are allowed in Cache Storage:
 *    - HTML application shell (/index.html)
 *    - Content-hashed JavaScript and CSS (/assets/*)
 *    - Safe public static branding assets (/favicon.svg, /manifest.webmanifest, icons, /offline.html)
 * 2. STRICTLY FORBIDDEN from Cache Storage:
 *    - All Supabase requests (REST API, RPCs, Auth, Realtime, Storage)
 *    - Auth tokens, session cookies, and login credentials
 *    - Private family, person, relationship, and directory data
 *    - Non-GET HTTP methods (POST, PUT, PATCH, DELETE)
 * 3. Offline Behavior:
 *    - Navigation requests fallback to cached /index.html allowing React Router to mount.
 *    - If /index.html is unavailable, falls back to /offline.html.
 *    - API calls fail closed when offline; never serves stale or unauthenticated census data.
 * 4. Update Lifecycle:
 *    - Listens for SKIP_WAITING to allow safe user-controlled updates.
 *    - Automatically claims clients on activation.
 * 5. Push Notifications:
 *    - Handles push and notificationclick events safely without exposing private data.
 */

const CACHE_VERSION = 'cr-shell-v7'

// Core static assets required to render the application shell
const STATIC_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/health.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-icon-192x192.png',
  '/maskable-icon-512x512.png',
  '/apple-touch-icon.png',
  '/logo.png',
  '/khatri-logo.png',
  '/offline.html',
]

// ---------------------------------------------------------------------------
// Lifecycle: Install & Activate
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_PRECACHE_URLS))
      .catch((err) => {
        // Log in dev only; do not abort install if non-critical asset fails
        console.warn('[PWA] Pre-cache warning:', err)
      })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((oldKey) => caches.delete(oldKey))
      ).then(() => self.clients.claim())
    })
  )
})

// ---------------------------------------------------------------------------
// Lifecycle: Messaging (User-controlled update flow)
// ---------------------------------------------------------------------------

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ---------------------------------------------------------------------------
// Request Interception & Caching Boundaries
// ---------------------------------------------------------------------------

/**
 * Validates whether a request qualifies for static asset caching.
 * Explicitly rejects all Supabase, dynamic API, auth, or mutation requests.
 */
function isStaticAssetRequest(url, request) {
  // 1. Only GET requests can ever be cached
  if (request.method !== 'GET') {
    return false
  }

  // 2. Reject ANY external or Supabase origin
  if (url.origin !== self.location.origin) {
    return false
  }

  // 3. Reject any Supabase API path pattern if proxied
  const pathname = url.pathname
  if (
    pathname.startsWith('/rest/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/storage/') ||
    pathname.startsWith('/realtime/')
  ) {
    return false
  }

  // 4. Allow content-hashed Vite bundle assets
  if (pathname.startsWith('/assets/')) {
    return true
  }

  // 5. Allow declared public static shell assets
  if (STATIC_PRECACHE_URLS.includes(pathname)) {
    return true
  }

  return false
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // 1. Navigation requests (HTML document loads)
  // Network-First with cached application shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION)
        const cachedShell = await cache.match('/index.html')
        if (cachedShell) {
          return cachedShell
        }
        const cachedOffline = await cache.match('/offline.html')
        if (cachedOffline) {
          return cachedOffline
        }
        return new Response('Network offline. Please reconnect to access KHATRI SARVANIYAT.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      })
    )
    return
  }

  // 2. Static application bundle & branding assets
  // Cache-First with Network fallback and dynamic caching
  if (isStaticAssetRequest(url, request)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse
          }

          const responseToCache = networkResponse.clone()
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseToCache)
          })

          return networkResponse
        })
      })
    )
    return
  }

  // 3. All other requests (Supabase REST, RPC, Auth, Storage, etc.)
  // Strictly Network-Only. Never intercepted by Cache Storage.
})

// ---------------------------------------------------------------------------
// Push Notifications & Interaction Handlers
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const payload = event.data.json()
    const title = payload.title || 'KHATRI SARVANIYAT'
    const options = {
      body: payload.body || 'New community update available.',
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/favicon-32x32.png',
      tag: payload.tag || 'community-notification',
      data: {
        url: payload.url || '/',
        ...payload.data,
      },
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch {
    const text = event.data.text()
    event.waitUntil(
      self.registration.showNotification('KHATRI SARVANIYAT', {
        body: text,
        icon: '/pwa-192x192.png',
      })
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
