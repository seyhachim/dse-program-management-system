import { defineConfig, devices } from "@playwright/test";

/** Hosted Neon/Render/Vercel only. No local services, no dev JWTs, no production DB. */
export default defineConfig({
  testDir: ".",
  testMatch: "**/hosted-opportunities.staging.ts",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["line"], ["html", { outputFolder: "staging-uat-report", open: "never" }]],
  use: {
    baseURL: "https://dse-p91wom5qc-seyhachims-projects.vercel.app",
    screenshot: "only-on-failure",
    trace: "off", // Browser traces can capture test passwords; never upload them.
    video: "off",
  },
  outputDir: "staging-test-results",
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
