import { fileURLToPath } from "node:url";
import { validateProductionAuthConfig } from "./auth-config.mjs";

validateProductionAuthConfig();

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Workspace packages ship raw TS/TSX — let Next transpile them.
  transpilePackages: ["@dse-pms/ui", "@dse-pms/shared-types"],
  turbopack: {
    // Pin the monorepo root so Turbopack doesn't get confused by an
    // unrelated lockfile above the repo (e.g. ~/package-lock.json).
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
  async rewrites() {
    // These exact anonymous read projections are exposed same-origin so the
    // PWA service worker can persist only this explicit public-data allowlist.
    // Do not replace these with a broad /api proxy.
    return [
      {
        source: "/api/programme/public/programmes/:programmeId",
        destination: `${apiUrl}/api/programme/public/programmes/:programmeId`,
      },
      {
        source: "/api/programme/public/programmes/:programmeId/faqs",
        destination: `${apiUrl}/api/programme/public/programmes/:programmeId/faqs`,
      },
      {
        source: "/api/programme/public/programmes/:programmeId/important-dates",
        destination: `${apiUrl}/api/programme/public/programmes/:programmeId/important-dates`,
      },
      {
        source: "/api/programme/public/programmes/:programmeId/curriculum/courses",
        destination: `${apiUrl}/api/programme/public/programmes/:programmeId/curriculum/courses`,
      },
      {
        source: "/api/programme/public/programmes/:programmeId/curriculum/totals",
        destination: `${apiUrl}/api/programme/public/programmes/:programmeId/curriculum/totals`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default config;
