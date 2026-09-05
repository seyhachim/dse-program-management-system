import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import manifest from "./app/manifest.ts";
import nextConfig from "./next.config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA_CACHE = "dse-pms-public-data-v1";

async function readServiceWorker() {
  return readFile(join(here, "public", "sw.js"), "utf8");
}

function fakeResponse(body, { status = 200, type = "basic" } = {}) {
  return {
    status,
    type,
    clone() {
      return fakeResponse(body, { status, type });
    },
    async text() {
      return body;
    },
  };
}

function requestFor(
  path,
  { credentials = "omit", authorization = false, method = "GET", mode = "cors" } = {},
) {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", "Bearer should-never-be-cached");

  return {
    method,
    mode,
    credentials,
    headers,
    url: `https://pms.test${path}`,
  };
}

async function serviceWorkerHarness({ fetchImpl, cacheKeys = [] } = {}) {
  const source = await readServiceWorker();
  const listeners = {};
  const stores = new Map();
  const deletedCaches = [];
  const fetchCalls = [];

  const keyFor = (request) => (typeof request === "string" ? request : request.url);
  const storeFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };

  const cachesMock = {
    async open(name) {
      const store = storeFor(name);
      return {
        async addAll() {},
        async match(request) {
          const value = store.get(keyFor(request));
          return value?.clone ? value.clone() : value;
        },
        async put(request, response) {
          store.set(keyFor(request), response?.clone ? response.clone() : response);
        },
      };
    },
    async match(request) {
      const key = keyFor(request);
      for (const store of stores.values()) {
        if (store.has(key)) {
          const value = store.get(key);
          return value?.clone ? value.clone() : value;
        }
      }
      return undefined;
    },
    async keys() {
      return cacheKeys.length > 0 ? [...cacheKeys] : [...stores.keys()];
    },
    async delete(name) {
      deletedCaches.push(name);
      stores.delete(name);
      return true;
    },
  };

  const selfMock = {
    location: { origin: "https://pms.test" },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };

  const wrappedFetch = async (request) => {
    fetchCalls.push(request);
    if (fetchImpl) return fetchImpl(request);
    return fakeResponse("fresh");
  };

  runInNewContext(source, {
    self: selfMock,
    caches: cachesMock,
    fetch: wrappedFetch,
    URL,
    Response,
    Promise,
    console,
  });

  return {
    deletedCaches,
    fetchCalls,
    async seed(cacheName, request, response) {
      const cache = await cachesMock.open(cacheName);
      await cache.put(request, response);
    },
    async read(cacheName, request) {
      const cache = await cachesMock.open(cacheName);
      return cache.match(request);
    },
    dispatchFetch(request) {
      let responsePromise;
      const waits = [];
      listeners.fetch({
        request,
        respondWith(value) {
          responsePromise = Promise.resolve(value);
        },
        waitUntil(value) {
          waits.push(Promise.resolve(value));
        },
      });
      return { responsePromise, waits };
    },
    dispatchActivate() {
      const waits = [];
      listeners.activate({
        waitUntil(value) {
          waits.push(Promise.resolve(value));
        },
      });
      return waits;
    },
  };
}

describe("DSE PMS PWA", () => {
  test("manifest describes the existing application as an installable standalone app", () => {
    const value = manifest();

    expect(value.id).toBe("/");
    expect(value.name).toBe("DSE Program Management System");
    expect(value.short_name).toBe("DSE PMS");
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.orientation).toBe("any");
    expect(value.icons?.some((icon) => icon.src === "/pwa-icon-192.png" && icon.sizes === "192x192")).toBe(true);
    expect(value.icons?.some((icon) => icon.src === "/pwa-icon-512.png" && icon.sizes === "512x512")).toBe(true);
    expect(value.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  test("ships real 192px and 512px PNG install icons", async () => {
    for (const file of ["pwa-icon-192.png", "pwa-icon-512.png"]) {
      const icon = await readFile(join(here, "public", file));

      expect(icon.length).toBeGreaterThan(1000);
      expect([...icon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  });

  test("navigation stays network-first and never writes protected screens to cache", async () => {
    const source = await readServiceWorker();
    const navigationStart = source.indexOf('if (request.mode === "navigate")');
    const staticStart = source.indexOf("const isStaticBuildAsset");
    const navigationBlock = source.slice(navigationStart, staticStart);

    expect(navigationStart).toBeGreaterThan(-1);
    expect(staticStart).toBeGreaterThan(navigationStart);
    expect(source).toContain('if (url.pathname.startsWith("/api/")) return;');
    expect(navigationBlock).toContain("fetch(request)");
    expect(navigationBlock).toContain("caches.match(OFFLINE_URL)");
    expect(navigationBlock).not.toContain("cache.put");
  });

  test("runtime static caching remains limited to build and explicit branding assets", async () => {
    const source = await readServiceWorker();

    expect(source).toContain('url.pathname.startsWith("/_next/static/")');
    expect(source).toContain("PRECACHE_URLS.includes(url.pathname)");
    expect(source).toContain("if (!isStaticBuildAsset && !isExplicitPublicAsset) return;");
  });

  test("public data cache intercepts only the explicit anonymous programme allowlist", async () => {
    const harness = await serviceWorkerHarness();
    const allowlisted = [
      "/api/programme/public/programmes/dse",
      "/api/programme/public/programmes/dse/faqs",
      "/api/programme/public/programmes/dse/important-dates",
      "/api/programme/public/programmes/dse/curriculum/courses",
      "/api/programme/public/programmes/dse/curriculum/totals",
    ];

    for (const path of allowlisted) {
      const event = harness.dispatchFetch(requestFor(path));
      expect(event.responsePromise).toBeDefined();
      await event.responsePromise;
      await Promise.all(event.waits);
    }

    const fetchCount = harness.fetchCalls.length;
    const denied = [
      requestFor("/api/student-portal/home"),
      requestFor("/api/programme/public/programmes/dse/admission"),
      requestFor("/api/programme/public/programmes/dse?locale=km"),
      requestFor("/api/programme/public/programmes/dse", { credentials: "same-origin" }),
      requestFor("/api/programme/public/programmes/dse", { authorization: true }),
    ];

    for (const request of denied) {
      const event = harness.dispatchFetch(request);
      expect(event.responsePromise).toBeUndefined();
    }
    expect(harness.fetchCalls).toHaveLength(fetchCount);
  });

  test("public data uses stale-while-revalidate and keeps cached data on refresh failure", async () => {
    let shouldFail = false;
    const harness = await serviceWorkerHarness({
      fetchImpl: async () => {
        if (shouldFail) throw new Error("offline");
        return fakeResponse("fresh-public-data");
      },
    });
    const request = requestFor("/api/programme/public/programmes/dse/curriculum/totals");
    await harness.seed(PUBLIC_DATA_CACHE, request, fakeResponse("cached-public-data"));

    const first = harness.dispatchFetch(request);
    expect(await (await first.responsePromise).text()).toBe("cached-public-data");
    await Promise.all(first.waits);
    expect(await (await harness.read(PUBLIC_DATA_CACHE, request)).text()).toBe("fresh-public-data");

    shouldFail = true;
    const offline = harness.dispatchFetch(request);
    expect(await (await offline.responsePromise).text()).toBe("fresh-public-data");
    await Promise.all(offline.waits);
    expect(await (await harness.read(PUBLIC_DATA_CACHE, request)).text()).toBe("fresh-public-data");
  });

  test("activation deletes only obsolete DSE static and public-data cache versions", async () => {
    const harness = await serviceWorkerHarness({
      cacheKeys: [
        "dse-pms-static-v0",
        "dse-pms-static-v1",
        "dse-pms-public-data-v0",
        "dse-pms-public-data-v1",
        "unrelated-cache-v1",
      ],
    });

    await Promise.all(harness.dispatchActivate());

    expect(harness.deletedCaches.sort()).toEqual([
      "dse-pms-public-data-v0",
      "dse-pms-static-v0",
    ]);
  });

  test("browser public programme loader is anonymous and uses only same-origin allowlisted paths", async () => {
    const source = await readFile(join(here, "lib", "public-programme-browser.ts"), "utf8");

    expect(source).toContain('credentials: "omit"');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain("/api/programme/public/programmes/");
    expect(source).not.toContain("Authorization");
    expect(source).not.toContain("accessToken");
  });

  test("Next proxies only the five public programme projections used by the browser loader", async () => {
    const rewrites = await nextConfig.rewrites();
    const sources = rewrites.map((rewrite) => rewrite.source);

    expect(sources).toEqual([
      "/api/programme/public/programmes/:programmeId",
      "/api/programme/public/programmes/:programmeId/faqs",
      "/api/programme/public/programmes/:programmeId/important-dates",
      "/api/programme/public/programmes/:programmeId/curriculum/courses",
      "/api/programme/public/programmes/:programmeId/curriculum/totals",
    ]);
    expect(sources.some((source) => source.includes("*"))).toBe(false);
  });

  test("install UI stays out of the Telegram companion routes", async () => {
    const source = await readFile(join(here, "components", "pwa-runtime.tsx"), "utf8");

    expect(source).toContain('pathname.startsWith("/telegram")');
    expect(source).toContain('pathname === "/offline"');
  });

  test("service worker is served without a stale HTTP cache", async () => {
    const rules = await nextConfig.headers();
    const serviceWorker = rules.find((rule) => rule.source === "/sw.js");

    expect(serviceWorker).toBeDefined();
    expect(serviceWorker.headers).toContainEqual({
      key: "Cache-Control",
      value: "no-cache, no-store, must-revalidate",
    });
    expect(serviceWorker.headers).toContainEqual({
      key: "Service-Worker-Allowed",
      value: "/",
    });
  });
});
