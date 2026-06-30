const CACHE_NAME = 'miplan-v2'
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
