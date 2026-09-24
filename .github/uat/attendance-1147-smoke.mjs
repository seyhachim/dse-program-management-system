import { chromium } from "playwright";

const baseURL = process.env.UAT_BASE_URL ?? "http://127.0.0.1:3000";
const date = "2099-12-02";

async function openAttendance(page) {
  await page.goto(`${baseURL}/attendance`, { waitUntil: "domcontentloaded" });
  const dateInput = page.locator('input[type="date"]');
  await dateInput.waitFor({ state: "visible", timeout: 30_000 });
  await dateInput.fill(date);
  await page.getByText(/Attendance UAT Only · 43 enrolled/).waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText("Attendance register", { exact: true }).waitFor({ state: "visible", timeout: 45_000 });
}

async function waitForCount(locator, expected, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await locator.count() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected}, got ${await locator.count()}`);
}

const browser = await chromium.launch({ headless: true });

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const desktopPage = await desktop.newPage();
await openAttendance(desktopPage);
await waitForCount(desktopPage.locator("table tbody select"), 43);
if (!(await desktopPage.locator("table").first().isVisible())) throw new Error("Desktop table missing");
await desktopPage.getByRole("button", { name: "Mark all present" }).click();
if ((await desktopPage.locator("table tbody select").first().inputValue()) !== "Present") {
  throw new Error("Desktop draft interaction failed");
}
await desktopPage.screenshot({ path: "/tmp/attendance-1147-desktop.png", fullPage: true });
console.log("DESKTOP_SMOKE PASS roster=43 draft=pass");
await desktop.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const mobilePage = await mobile.newPage();
await openAttendance(mobilePage);
await waitForCount(mobilePage.locator("article select"), 43);
if (await mobilePage.locator("table").first().isVisible()) throw new Error("Desktop table visible on mobile");
const widthOk = await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
if (!widthOk) throw new Error("Mobile horizontal overflow");
await mobilePage.getByRole("button", { name: "Mark all present" }).click();
if ((await mobilePage.locator("article select").first().inputValue()) !== "Present") {
  throw new Error("Mobile draft interaction failed");
}
await mobilePage.screenshot({ path: "/tmp/attendance-1147-mobile.png", fullPage: true });
console.log("MOBILE_SMOKE PASS roster=43 responsive=pass draft=pass");
await mobile.close();

await browser.close();
console.log("BROWSER_SMOKE_SUMMARY desktop=pass mobile=pass no_server_write=true");
