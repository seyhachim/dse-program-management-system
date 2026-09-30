import type { Browser, BrowserContext, Page } from "@playwright/test";

export const DEV_TOKEN_STORAGE_KEY = "dse-pms-dev-token";

export type BrowserRole = "admin" | "coordinator" | "readOnly";

function tokenFor(role: BrowserRole): string {
  const name =
    role === "admin"
      ? "BROWSER_SMOKE_ADMIN_TOKEN"
      : role === "coordinator"
        ? "BROWSER_SMOKE_COORDINATOR_TOKEN"
        : "BROWSER_SMOKE_READONLY_TOKEN";
  const token = process.env[name]?.trim();
  if (!token) throw new Error(`${name} is required for authenticated browser smoke`);
  return token;
}

export async function newRoleContext(
  browser: Browser,
  role: BrowserRole,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  const token = tokenFor(role);
  await context.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: DEV_TOKEN_STORAGE_KEY, value: token },
  );
  return context;
}

export async function openCurriculum(page: Page) {
  await page.goto("/curriculum");
  await page.getByRole("heading", { name: "Curriculum" }).waitFor();
  await page.getByRole("heading", { name: "Competency framework" }).waitFor();
}
