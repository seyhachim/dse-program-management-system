import { chromium } from "playwright";

const baseURL = process.env.UAT_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.env.UAT_EMAIL;
const password = process.env.UAT_PASSWORD;
if (!email || !password) throw new Error("UAT credentials missing");

const browser = await chromium.launch({ headless: true });

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function waitForCount(locator, expected, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const count = await locator.count();
    if (count === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected locator count ${expected}, got ${await locator.count()}`);
}

async function openAttendance(page, date) {
  await page.goto(`${baseURL}/attendance`, { waitUntil: "domcontentloaded" });
  const dateInput = page.locator('input[type="date"]');
  await dateInput.waitFor({ state: "visible", timeout: 30_000 });
  await dateInput.fill(date);
  await page.getByText(/Attendance UAT Only · 43 enrolled/).waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText("Attendance register", { exact: true }).waitFor({ state: "visible", timeout: 45_000 });
}

async function saveAndWait(page) {
  const save = page.getByRole("button", { name: /Save attendance/ });
  await save.click();
  await page.getByText(/Attendance saved for .*43 marked, 0 unmarked./).waitFor({
    state: "visible",
    timeout: 70_000,
  });
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const desktopPage = await desktop.newPage();
try {
  await login(desktopPage);
  await openAttendance(desktopPage, "2026-09-30");

  const desktopSelects = desktopPage.locator("table tbody select");
  await waitForCount(desktopSelects, 43);
  if (!(await desktopPage.locator("table").isVisible())) throw new Error("Desktop attendance table is not visible");

  await desktopPage.getByRole("button", { name: "Mark all present" }).click();
  for (let i = 0; i < 5; i += 1) {
    await desktopSelects.nth(i).selectOption("__permission_pending__");
  }
  for (let i = 0; i < 5; i += 1) {
    if ((await desktopSelects.nth(i).inputValue()) !== "__permission_pending__") {
      throw new Error(`Desktop pending mark ${i} did not stick`);
    }
  }
  await saveAndWait(desktopPage);

  await desktopPage.reload({ waitUntil: "domcontentloaded" });
  await desktopPage.getByText(/Attendance UAT Only · 43 enrolled/).waitFor({ state: "visible", timeout: 45_000 });
  await waitForCount(desktopPage.locator("table tbody select"), 43);
  const desktopAfter = desktopPage.locator("table tbody select");
  for (let i = 0; i < 5; i += 1) {
    if ((await desktopAfter.nth(i).inputValue()) !== "__permission_pending__") {
      throw new Error(`Desktop readback pending mark ${i} mismatch`);
    }
  }
  if ((await desktopAfter.nth(5).inputValue()) !== "Present") {
    throw new Error("Desktop readback Present mark mismatch");
  }

  await desktopPage.getByRole("button", { name: "Start Roll Call" }).click();
  await desktopPage.getByText("Confirm class before marking attendance", { exact: true }).waitFor({ state: "visible" });
  await desktopPage.getByRole("button", { name: "Cancel" }).click();

  await desktopPage.screenshot({ path: "/tmp/attendance-desktop.png", fullPage: true });
  console.log("DESKTOP_UAT PASS roster=43 pending=5 save_readback=pass roll_call_confirmation=pass");
} finally {
  await desktop.close();
}

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const mobilePage = await mobile.newPage();
try {
  await login(mobilePage);
  await openAttendance(mobilePage, "2026-10-07");

  const mobileSelects = mobilePage.locator("article select");
  await waitForCount(mobileSelects, 43);
  if (await mobilePage.locator("table").isVisible()) throw new Error("Desktop table visible in mobile layout");

  const widthOk = await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  if (!widthOk) throw new Error("Mobile layout has horizontal page overflow");

  await mobilePage.getByRole("button", { name: "Mark all present" }).click();
  await mobilePage.waitForTimeout(800);
  if ((await mobileSelects.nth(0).inputValue()) !== "Present") throw new Error("Mobile local mark failed");

  await mobilePage.reload({ waitUntil: "domcontentloaded" });
  await mobilePage.getByText(/Attendance UAT Only · 43 enrolled/).waitFor({ state: "visible", timeout: 45_000 });
  await mobilePage.getByText("Unsaved attendance draft recovered on this device. Review the marks before saving.", { exact: true })
    .waitFor({ state: "visible", timeout: 30_000 });
  const recovered = mobilePage.locator("article select");
  await waitForCount(recovered, 43);
  if ((await recovered.nth(0).inputValue()) !== "Present") throw new Error("Mobile draft mark was not recovered");

  await saveAndWait(mobilePage);
  await mobilePage.reload({ waitUntil: "domcontentloaded" });
  await mobilePage.getByText(/Attendance UAT Only · 43 enrolled/).waitFor({ state: "visible", timeout: 45_000 });
  await waitForCount(mobilePage.locator("article select"), 43);
  if ((await mobilePage.locator("article select").nth(0).inputValue()) !== "Present") {
    throw new Error("Mobile saved readback mismatch");
  }
  if (await mobilePage.getByText("Unsaved attendance draft recovered on this device. Review the marks before saving.", { exact: true }).isVisible().catch(() => false)) {
    throw new Error("Mobile draft banner remained after authoritative save");
  }

  const widthStillOk = await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  if (!widthStillOk) throw new Error("Mobile layout overflow after save");

  await mobilePage.screenshot({ path: "/tmp/attendance-mobile.png", fullPage: true });
  console.log("MOBILE_UAT PASS roster=43 responsive=pass draft_recovery=pass save_readback=pass");
} finally {
  await mobile.close();
}

await browser.close();
console.log("BROWSER_UAT_SUMMARY desktop=pass mobile=pass authenticated=pass");
