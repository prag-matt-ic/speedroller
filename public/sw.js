const CACHE_NAME = 'speedroller-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  const keepCaches = async () => {
    const cacheKeys = await caches.keys()
    await Promise.all(
      cacheKeys.map((key) => {
        if (key === CACHE_NAME) return Promise.resolve()
        return caches.delete(key)
      }),
    )
    await self.clients.claim()
  }
  event.waitUntil(keepCaches())
})

self.addEventListener('fetch', () => {
  // For now we rely on the network; add custom caching here if needed.
})
