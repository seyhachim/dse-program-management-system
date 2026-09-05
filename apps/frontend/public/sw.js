const STATIC_CACHE_PREFIX = "dse-pms-static-";
const STATIC_CACHE_NAME = `${STATIC_CACHE_PREFIX}v1`;
const PUBLIC_DATA_CACHE_PREFIX = "dse-pms-public-data-";
const PUBLIC_DATA_CACHE_NAME = `${PUBLIC_DATA_CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/dse-logo.svg",
  "/rupp-logo.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-icon.svg",
  "/pwa-maskable-icon.svg",
];

const PUBLIC_PROGRAMME_DATA_PATH =
  /^\/api\/programme\/public\/programmes\/[A-Za-z0-9_-]+(?:\/faqs|\/important-dates|\/curriculum\/(?:courses|totals))?$/;

function isAllowlistedPublicDataRequest(request, url) {
  if (!PUBLIC_PROGRAMME_DATA_PATH.test(url.pathname)) return false;
  if (url.search !== "") return false;
  if (request.credentials !== "omit") return false;
  if (request.headers.has("authorization")) return false;
  return true;
}

function canPersistPublicData(response) {
  return Boolean(response && response.status === 200 && response.type === "basic");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
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
            .filter(
              (key) =>
                (key.startsWith(STATIC_CACHE_PREFIX) && key !== STATIC_CACHE_NAME) ||
                (key.startsWith(PUBLIC_DATA_CACHE_PREFIX) && key !== PUBLIC_DATA_CACHE_NAME),
            )
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

  if (isAllowlistedPublicDataRequest(request, url)) {
    const cachePromise = caches.open(PUBLIC_DATA_CACHE_NAME);
    const cachedPromise = cachePromise.then((cache) => cache.match(request));
    const networkPromise = fetch(request);

    // Stale-while-revalidate: a repeat load gets the persisted public response
    // immediately while a fresh anonymous projection updates the cache in the
    // background. Failed refreshes never evict the last known public response.
    const refreshPromise = networkPromise.then(async (response) => {
      if (canPersistPublicData(response)) {
        const cache = await cachePromise;
        await cache.put(request, response.clone());
      }
      return response;
    });

    event.waitUntil(refreshPromise.catch(() => undefined));
    event.respondWith(
      cachedPromise.then((cached) => {
        if (cached) return cached;
        return refreshPromise;
      }),
    );
    return;
  }

  // All other API responses remain deny-by-default. Protected academic data,
  // account/session data and arbitrary GET requests are never persisted here.
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
          .open(STATIC_CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => undefined);
        return response;
      });
    }),
  );
});
