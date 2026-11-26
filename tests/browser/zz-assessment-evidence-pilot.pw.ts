import { expect, test, request } from "@playwright/test";
import { DEV_TOKEN_STORAGE_KEY, newRoleContext } from "./auth.ts";

test("synthetic TSA301 M1/M2 evidence pilot: desktop lecturer, mobile review, group separation", async ({ browser }) => {
  test.setTimeout(90000);
  const token = process.env.BROWSER_SMOKE_EVIDENCE_LECTURER_TOKEN;
  if (!token) throw new Error("Exact synthetic evidence lecturer token is required");
  const lecturer = await browser.newContext();
  await lecturer.addInitScript(({ key, token }) => localStorage.setItem(key, token), { key: DEV_TOKEN_STORAGE_KEY, token });
  const coordinator = await newRoleContext(browser, "coordinator");
  const student = await request.newContext({ baseURL: "http://127.0.0.1:4000", extraHTTPHeaders: { Authorization: "Bearer " + process.env.BROWSER_SMOKE_STUDENT_TOKEN } });
  try {
    const staffApi = await request.newContext({ baseURL: "http://127.0.0.1:4000", extraHTTPHeaders: { Authorization: "Bearer " + token } });
    try {
      const response = await staffApi.get("/api/student-portal/manage/offerings");
      expect(response.status(), "Assigned lecturer offerings must be accessible").toBe(200);
      const offerings = await response.json() as { code: string; sectionCode: string; term: string }[];
      expect(offerings.filter(o => o.code === "TSA301-CI" && o.term === "Evidence pilot CI only").map(o => o.sectionCode).sort()).toEqual(["M1","M2"]);
    } finally { await staffApi.dispose(); }
    const page = await lecturer.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/course-delivery");
    const section = page.getByLabel("Course section");
    await expect(section).toBeVisible({ timeout: 15000 });
    await section.selectOption({ label: "TSA301-CI · Section M1 · Evidence pilot CI only" });
    await page.getByRole("tab", { name: "Assessment Evidence" }).click();
    await page.getByRole("button", { name: /Synthetic M1 Learner 3.*high/ }).click();
    await page.getByLabel("Sample selection reason").fill("Synthetic high sample");
    await page.getByLabel("Restricted evidence reference").fill("https://drive.google.com/file/d/synthetic-m1-marked-work/view");
    await page.getByRole("button", { name: /^(Save draft|Save new draft revision)$/ }).click();
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible();
    await page.getByLabel("I confirm this is actual marked student work and its access is restricted.").check();
    await page.getByRole("button", { name: "Submit for verification" }).click();
    await expect(page.getByRole("button", { name: /Synthetic M1 Learner 3.*revision \d+.*submitted/i })).toBeVisible();
    await section.selectOption({ label: "TSA301-CI · Section M2 · Evidence pilot CI only" });
    await expect(page.getByRole("button", { name: /Synthetic M2 Learner 3.*high/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Synthetic M1 Learner 3/ })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Assessment", { exact: true }).selectOption("pilot-project");
    await page.getByRole("button", { name: /Synthetic M2 Group.*middle/ }).click();
    await expect(page.getByText("Locked group membership", { exact: true })).toBeVisible();
    await page.getByLabel("Sample selection reason").fill("Synthetic shared project");
    await page.getByLabel("Restricted evidence reference").fill("https://drive.google.com/file/d/synthetic-m2-group-work/view");
    await page.getByRole("button", { name: /^(Save draft|Save new draft revision)$/ }).click();
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible();
    await page.getByLabel("I confirm this is actual marked student work and its access is restricted.").check();
    await page.getByRole("button", { name: "Submit for verification" }).click();
    await expect(page.getByRole("button", { name: /Synthetic M2 Group.*revision \d+.*submitted/i })).toBeVisible();
    await page.getByLabel("Evidence population").selectOption("component");
    await expect(page.getByRole("button", { name: /Synthetic M2 Learner 3.*high/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Synthetic M2 Group.*revision/ })).toHaveCount(0);
    const mobile = await coordinator.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto("/course-delivery/assessment-evidence");
    await expect(mobile.getByRole("heading", { name: "Programme assessment evidence", exact: true })).toBeVisible();
    await mobile.getByLabel("Programme", { exact: true }).selectOption("dse");
    await mobile.getByLabel("Term", { exact: true }).selectOption("Evidence pilot CI only");
    await mobile.getByLabel("Course code or title").fill("TSA301-CI");
    await mobile.getByRole("button", { name: "Search", exact: true }).click();
    const m1 = mobile.locator("article").filter({ has: mobile.getByRole("heading", { name: /TSA301-CI.*M1/ }) });
    await expect(m1).toContainText("1 submitted");
    await m1.getByRole("button", { name: "Open evidence", exact: true }).first().click();
    await mobile.getByRole("button", { name: /Synthetic M1 Learner 3.*revision \d+.*submitted/i }).click();
    await mobile.getByLabel("Review reason").fill("Synthetic independent review");
    await mobile.getByLabel("I checked the restricted work and official marks.").check();
    await mobile.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(mobile.getByRole("button", { name: /Synthetic M1 Learner 3.*revision \d+.*verified/i })).toBeVisible();
    await mobile.getByRole("button", { name: "View recent revision history" }).click();
    await expect(mobile.getByText(/Revision \d+ · verified/).first()).toBeVisible();
    const dimensions = await mobile.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect((await student.get("/api/qa/assessment-evidence/programmes/dse/dashboard?term=Evidence%20pilot%20CI%20only")).status()).toBe(404);
  } finally {
    await lecturer.close(); await coordinator.close(); await student.dispose();
  }
});
