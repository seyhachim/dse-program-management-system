const CACHE_PREFIX = "dse-pms-static-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/dse-logo.svg",
  "/rupp-logo.png",
  "/pwa-icon.svg",
  "/pwa-maskable-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Protected API responses and other application data are never persisted in
  // the service-worker cache. Authorization and freshness remain server-owned.
  if (url.pathname.startsWith("/api/")) return;

  // Navigation is always network-first and is never written to cache. If the
  // network is unavailable, show a deliberately data-free offline page rather
  // than a stale authenticated screen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);
        return offline ?? Response.error();
      }),
    );
    return;
  }

  // Only immutable Next build assets and explicit public branding assets are
  // cacheable. Do not broaden this to /_next/image or arbitrary GET requests,
  // which may contain user-specific or protected content.
  const isStaticBuildAsset = url.pathname.startsWith("/_next/static/");
  const isExplicitPublicAsset = PRECACHE_URLS.includes(url.pathname);
  if (!isStaticBuildAsset && !isExplicitPublicAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const copy = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => undefined);
        return response;
      });
    }),
  );
});
