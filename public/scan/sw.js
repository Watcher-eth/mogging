// Only recover the scan navigation offline. Auth, payments, images, and reports
// always use the network and are never written to Cache Storage by this worker.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin ||
      !/^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?(?:analysis|app\/home)\/?$/.test(url.pathname)) return

  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mogging · Offline</title><main style="font: 16px system-ui; margin: 15vh auto; max-width: 24rem; padding: 1.5rem"><h1>You’re offline</h1><p>Reconnect to continue your evaluation.</p><a href="">Try again</a></main></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )))
})
