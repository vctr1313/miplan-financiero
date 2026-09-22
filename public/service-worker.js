const CACHE_NAME = 'miplan-v3'
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

// Network-first for API calls (Supabase) and HTML navigation, cache-first
// for fingerprinted static assets (CRA's /static/ bundle files include a
// content hash in their filename, so caching them long-term is safe).
// HTML must always be checked against the network first: caching it
// cache-first meant a stale index.html (pointing at an old, since-deleted
// hashed bundle) could be served indefinitely after a new deploy, hiding
// any new feature shipped after the first cache was primed.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never cache Supabase API calls — always go to network
  if (url.hostname.includes('supabase.co') || url.hostname.includes('anthropic.com')) {
    return
  }
  // Our own serverless endpoints (and any non-GET) are never cached.
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return

  const isNavigation = event.request.mode === 'navigate' ||
    url.pathname === '/' || url.pathname === '/index.html'

  if (isNavigation) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const responseClone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
        return response
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response
        }
        const responseClone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
        return response
      }).catch(() => caches.match('/index.html'))
    })
  )
})

// ── PUSH ──────────────────────────────────────────────────────
// Daily budget alerts from api/cron-alerts.js. Payload:
// { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Mi Plan', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'miplan',
      renotify: true,
      data: { url: data.url || '/' },
    })
  )
})

// Tapping the notification focuses the app if it's already open
// (navigating it to the relevant page), otherwise opens it there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (win) return win.focus().then((w) => (w && 'navigate' in w ? w.navigate(target) : w))
      return self.clients.openWindow(target)
    })
  )
})
