import { fileURLToPath } from "node:url";

function requireProductionAuthConfig() {
  if (process.env.NODE_ENV !== "production") return;

  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "supabase") {
    throw new Error("Production frontend builds require NEXT_PUBLIC_AUTH_MODE=supabase");
  }

  if (process.env.NEXT_PUBLIC_DEV_TOKEN) {
    throw new Error("NEXT_PUBLIC_DEV_TOKEN must not be configured in a production frontend build");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Production frontend builds require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
}

requireProductionAuthConfig();

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
};

export default config;
