const CACHE_VERSION = "cantero-v1";
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([PAGES_CACHE, STATIC_CACHE, API_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// A cache-then-network-error fallback that never resolves to `undefined`: an
// event.respondWith(undefined) is reported by the browser as a hard network
// error (ERR_FAILED), so a genuine miss must still return a real Response.
function offlineFallback(request) {
  return caches.match(request).then(
    (cached) =>
      cached ||
      new Response(JSON.stringify({ message: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only handle same-origin requests. The API typically runs on a different
  // origin in dev (a different port); replaying a captured cross-origin
  // FetchEvent.request through fetch() again is unreliable across browsers,
  // so those are left untouched and go straight to the network natively.
  if (url.origin !== self.location.origin) return;

  // Navigations (HTML pages): network-first, cache successful responses, fall back
  // to the last cached copy of that page, and finally to a generic offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))),
    );
    return;
  }

  // Next.js build assets are content-hashed and immutable: cache-first is safe and fast.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Same-origin API reads (e.g. behind a same-origin proxy in production):
  // network-first so data is fresh when online, cached fallback offline.
  if (url.pathname.includes("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => offlineFallback(request)),
    );
    return;
  }
});
