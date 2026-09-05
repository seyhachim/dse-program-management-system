import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./app/manifest.ts";
import nextConfig from "./next.config.mjs";

const here = dirname(fileURLToPath(import.meta.url));

async function readServiceWorker() {
  return readFile(join(here, "public", "sw.js"), "utf8");
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
    expect(value.icons?.some((icon) => icon.src === "/pwa-icon-192.png" && icon.sizes === "192x192")).toBe(true);
    expect(value.icons?.some((icon) => icon.src === "/rupp-logo.png" && icon.sizes === "512x512")).toBe(true);
    expect(value.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  test("ships a real 192px PNG install icon", async () => {
    const icon = await readFile(join(here, "public", "pwa-icon-192.png"));

    expect(icon.length).toBeGreaterThan(1000);
    expect([...icon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
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

  test("runtime caching is limited to build assets and explicitly public branding assets", async () => {
    const source = await readServiceWorker();

    expect(source).toContain('url.pathname.startsWith("/_next/static/")');
    expect(source).toContain("PRECACHE_URLS.includes(url.pathname)");
    expect(source).toContain("if (!isStaticBuildAsset && !isExplicitPublicAsset) return;");
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
