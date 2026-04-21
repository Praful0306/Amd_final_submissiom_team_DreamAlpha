// Sahayak AI — Service Worker (Offline-First)
// Caches static assets; queues API writes when offline, auto-syncs when online.

const CACHE_VERSION = 'sahayak-v3';
const STATIC_ASSETS = [
  '/', '/auth.html', '/patient.html', '/doctor.html',
  '/asha_portal.html', '/asha_demo.html', '/vitals.html',
  '/portal.css', '/patient.js', '/doctor.js',
  '/firebase_refresh.js', '/offline_sync.js',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── API path matcher ──────────────────────────────────────────────────────────
function isApiPath(pathname) {
  const apiPaths = [
    '/diagnose', '/reports', '/analytics', '/auth', '/doctor',
    '/patient', '/vapi', '/agent', '/deep_impact', '/sync', '/chat',
    '/government-report', '/reminder', '/voice', '/health', '/transcribe',
  ];
  return apiPaths.some(p => pathname.startsWith(p));
}

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);

  // API calls: network-first
  if (isApiPath(url.pathname)) {
    if (evt.request.method === 'GET') {
      // GET: try network, fall back to offline response
      evt.respondWith(
        fetch(evt.request).catch(() =>
          new Response(
            JSON.stringify({ offline: true, error: 'No network', status: 'offline' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )
      );
    } else {
      // POST/PATCH/PUT: try network, queue offline writes
      evt.respondWith(
        fetch(evt.request.clone()).catch(async () => {
          const body = await evt.request.clone().text().catch(() => '{}');
          notifyClients({ type: 'STORE_OFFLINE', request: { url: evt.request.url, method: evt.request.method, body } });
          return new Response(
            JSON.stringify({ success: true, offline: true, queued: true, message: 'Stored offline. Will sync when connected.' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
      );
    }
    return;
  }

  // Static assets: cache-first, update in background
  evt.respondWith(
    caches.match(evt.request).then(cached => {
      const networkFetch = fetch(evt.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(evt.request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    }).catch(() => new Response('Offline — please reload when connected.'))
  );
});

// ── Background sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', evt => {
  if (evt.tag === 'sahayak-sync') {
    evt.waitUntil(notifyClients({ type: 'FLUSH_OFFLINE_QUEUE' }));
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener('message', evt => {
  if (!evt.data) return;
  if (evt.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (evt.data.type === 'FLUSH_QUEUE') {
    notifyClients({ type: 'FLUSH_OFFLINE_QUEUE' });
    evt.source && evt.source.postMessage({ type: 'QUEUE_FLUSHED', count: 0 });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
async function notifyClients(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(c => c.postMessage(msg));
}
