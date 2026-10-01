import { defineConfig, devices } from "@playwright/test";

const repoRoot = new URL("../../", import.meta.url).pathname;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ci:ci@127.0.0.1:5432/dse_browser?schema=public";
const jwtSecret =
  process.env.JWT_SECRET ??
  "issue-823-browser-smoke-secret-at-least-32-characters";
const adminToken = process.env.BROWSER_SMOKE_ADMIN_TOKEN ?? "";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  outputDir: "test-results",
  webServer: [
    {
      command: "bun run --cwd apps/backend dev",
      cwd: repoRoot,
      url: "http://127.0.0.1:4000/health",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        AUTH_MODE: "dev",
        JWT_SECRET: jwtSecret,
        PORT: "4000",
        CORS_ORIGIN: "http://127.0.0.1:3000",
        TELEGRAM_PMS_ENABLED: "false",
        TELEGRAM_PUBLIC_ENABLED: "false",
      },
    },
    {
      command: "bun run --cwd apps/frontend dev --hostname 127.0.0.1",
      cwd: repoRoot,
      url: "http://127.0.0.1:3000",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NEXT_PUBLIC_AUTH_MODE: "dev",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
        NEXT_PUBLIC_DEV_TOKEN: adminToken,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
