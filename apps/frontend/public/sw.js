const STATIC_CACHE_PREFIX = "dse-pms-static-";
const STATIC_CACHE_NAME = `${STATIC_CACHE_PREFIX}v1`;
const PUBLIC_DATA_CACHE_PREFIX = "dse-pms-public-data-";
const PUBLIC_DATA_CACHE_NAME = `${PUBLIC_DATA_CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline";
const INLINE_OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0f172a" />
    <title>DSE PMS temporarily unavailable</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #f8fafc; }
      main { width: min(28rem, calc(100% - 2rem)); box-sizing: border-box; padding: 2rem; border: 1px solid #334155; border-radius: 1rem; background: #111827; }
      h1 { margin: 0 0 0.75rem; font-size: 1.5rem; line-height: 1.25; }
      p { margin: 0 0 1.25rem; color: #cbd5e1; line-height: 1.6; }
      a { display: inline-block; min-height: 2.75rem; box-sizing: border-box; padding: 0.7rem 1rem; border-radius: 0.65rem; background: #f8fafc; color: #0f172a; font-weight: 600; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <h1>DSE PMS is temporarily unavailable</h1>
      <p>We could not load this page. Check your internet connection, then try again.</p>
      <a href="">Try again</a>
    </main>
  </body>
</html>`;

function createInlineOfflineResponse() {
  return new Response(INLINE_OFFLINE_HTML, {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
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
        return offline ?? createInlineOfflineResponse();
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
