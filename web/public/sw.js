const CACHE_NAME = 'postern-shell-v1'
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/postern.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
]
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'image', 'font'])

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('postern-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/health'
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedPage = await caches.match('/')
        if (!cachedPage) {
          throw new Error('No cached page available for offline navigation.')
        }
        return cachedPage
      }),
    )
    return
  }

  if (!CACHEABLE_DESTINATIONS.has(request.destination)) {
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseToCache = response.clone()
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache)),
          )
        }
        return response
      })
    }),
  )
})
