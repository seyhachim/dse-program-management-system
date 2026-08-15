import { fileURLToPath } from "node:url";
import { validateProductionAuthConfig } from "./auth-config.mjs";

validateProductionAuthConfig();

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
