import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * Real hosted staging UAT: NO public dev JWT and NO production IdP.
 * Tests only synthetic, disposable accounts created on the isolated Neon branch.
 * Not included in the existing disposable CI testMatch ("*.pw.ts").
 */
const API = "https://dse-pms-staging-isolated-free.onrender.com";
const PREVIEW = "https://dse-p91wom5qc-seyhachims-projects.vercel.app";
const fixtureLabel = "STAGING Verified Competition Evidence";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for hosted UAT");
  return value;
}

async function login(page: Page, role: "COORD" | "STUDENT" | "SECRETARY" | "OUTSIDER", next = "/opportunities") {
  await page.goto(PREVIEW + "/login?next=" + encodeURIComponent(next));
  await page.getByLabel("Email").fill(required("STAGE_" + role + "_EMAIL"));
  await page.getByLabel("Password").fill(required("STAGE_" + role + "_PASS"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next.replace("/", "\\/")), { timeout: 45_000 });
}

async function authenticatedApiStatus(page: Page, path: string, method = "GET", body?: unknown): Promise<number> {
  return page.evaluate(async ({ api, path, method, body }) => {
    const authResponse = await fetch("/staging-auth/get-session", { credentials: "include" });
    const session = await authResponse.json() as {
      session?: { token?: string };
      data?: { session?: { token?: string } };
    };
    const token = session.session?.token ?? session.data?.session?.token;
    if (!token) throw new Error("No first-party Neon session bearer");
    const response = await fetch(api + path, {
      method,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.status;
  }, { api: API, path, method, body });
}

test.describe("DSE PMS isolated hosted staging — Student Opportunities #1284", () => {
  test.setTimeout(180_000);

  test("real first-party sign-in, staff publication, mobile student consent, review, withdrawal and RBAC", async ({ browser }) => {
    const staff: BrowserContext = await browser.newContext();
    const student: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const secretary: BrowserContext = await browser.newContext();
    const outsider: BrowserContext = await browser.newContext();
    const staffPage = await staff.newPage();
    const studentPage = await student.newPage();
    const secretaryPage = await secretary.newPage();
    const outsiderPage = await outsider.newPage();
    const title = "STAGING Real Browser Opportunity " + Date.now();
    try {
      // First-party Neon session survives page reload; server independently derives roles.
      await login(staffPage, "COORD", "/opportunities/manage");
      await expect(staffPage.getByRole("heading", { name: "Create a verified opportunity" })).toBeVisible();
      await staffPage.reload();
      await expect(staffPage.getByRole("heading", { name: "Create a verified opportunity" })).toBeVisible();
      console.log("PASS: staging coordinator session reload + PMS role");

      await staffPage.getByLabel("Opportunity type").selectOption("competition");
      await staffPage.getByLabel("Organizer").fill("Synthetic Test Organizer");
      await staffPage.getByLabel("Title").fill(title);
      await staffPage.getByLabel("Student-friendly summary").fill("Synthetic staging opportunity for hosted browser permissions and consent validation.");
      await staffPage.getByLabel("Eligibility (do not infer)").fill("Only synthetic DSE staging students");
      await staffPage.getByLabel("Official source URL").fill("https://example.org/staging-opportunity");
      await staffPage.getByRole("button", { name: "Save draft" }).click();
      await expect(staffPage.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
      const staffArticle = staffPage.getByRole("article").filter({ hasText: title });
      await expect(staffArticle).toBeVisible();
      await staffArticle.getByRole("button", { name: "Publish" }).click();
      await expect(staffPage.getByRole("status").filter({ hasText: "published to students" })).toBeVisible();
      console.log("PASS: staff draft/publish");

      await login(studentPage, "STUDENT", "/opportunities");
      await expect(studentPage.getByRole("heading", { name: "Discover your next opportunity" })).toBeVisible();
      await studentPage.getByRole("searchbox", { name: "Search opportunities" }).fill(title);
      const card = studentPage.getByRole("article").filter({ hasText: title });
      await expect(card).toBeVisible();
      const official = card.getByRole("link", { name: "Official source" });
      await expect(official).toHaveAttribute("href", "https://example.org/staging-opportunity");
      await expect(official).toHaveAttribute("rel", /noopener/);
      await card.getByRole("link", { name: "View details" }).click();
      await expect(studentPage.getByRole("heading", { name: title })).toBeVisible();
      const widths = await studentPage.evaluate(() => ({
        screen: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.screen + 1);
      console.log("PASS: mobile browse + official safe source + no horizontal overflow");

      await expect(studentPage.getByRole("heading", { name: "Share your experience (optional)" })).toBeVisible();
      await studentPage.getByLabel("Public portfolio evidence").selectOption({ label: fixtureLabel });
      await studentPage.getByLabel("Your result").selectOption("Participant");
      await studentPage.getByLabel(/I consent to publicly show/).check();
      await studentPage.getByRole("button", { name: "Submit for review" }).click();
      await expect(studentPage.getByRole("status").filter({ hasText: "Submitted for programme staff review" })).toBeVisible();
      console.log("PASS: student explicit consent, request pending");

      await staffPage.reload();
      const review = staffPage.getByRole("article").filter({ hasText: title + " · Participant" });
      await expect(review).toBeVisible({ timeout: 25_000 });
      await review.getByLabel("Review evidence / official result reference")
        .fill("Synthetic staging-only verification entry; no external winner claims.");
      await review.getByRole("button", { name: "Approve" }).click();
      await expect(staffPage.getByRole("status").filter({ hasText: "Student experience approved" })).toBeVisible();
      await studentPage.reload();
      await expect(studentPage.getByText("Verified participant")).toBeVisible();
      await studentPage.getByRole("button", { name: "Withdraw consent" }).click();
      await expect(studentPage.getByRole("status").filter({ hasText: "Your consent was withdrawn" })).toBeVisible();
      await studentPage.reload();
      await expect(studentPage.getByText("No past DSE experiences have been approved")).toBeVisible();
      console.log("PASS: staff review evidence note, public display, student withdrawal");

      await login(secretaryPage, "SECRETARY");
      expect(await authenticatedApiStatus(secretaryPage, "/api/opportunities/manage")).toBe(403);
      await login(outsiderPage, "OUTSIDER");
      expect(await authenticatedApiStatus(outsiderPage, "/api/opportunities")).toBe(401);
      expect(await authenticatedApiStatus(studentPage, "/api/opportunities/manage")).toBe(403);
      console.log("PASS: secretary/student denied writes; unprovisioned identity denied");

      await staffPage.goto(PREVIEW + "/opportunities/manage");
      const existing = staffPage.getByRole("article").filter({ hasText: title });
      await existing.getByRole("button", { name: "Archive" }).click();
      await expect(staffPage.getByRole("status").filter({ hasText: "Opportunity archived" })).toBeVisible();
      await studentPage.goto(PREVIEW + "/opportunities");
      await expect(studentPage.getByRole("article").filter({ hasText: title })).toHaveCount(0);
      console.log("PASS: archive hides from hosted student feed");

      // Sign-out ends a real first-party session; a later shell visit must redirect.
      await staffPage.getByRole("button", { name: /Open account menu/ }).click();
      await staffPage.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(staffPage).toHaveURL(/\/login/, { timeout: 30_000 });
      console.log("PASS: staging sign-out and protected shell");
    } finally {
      await Promise.all([staff.close(), student.close(), secretary.close(), outsider.close()]);
    }
  });
});
