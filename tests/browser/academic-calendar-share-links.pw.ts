import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

type ClipboardWindow = Window & { __copiedCalendarUrl?: string; __denyCalendarCopy?: boolean };

test.describe("#1288 Academic Calendar share actions", () => {
  test("copies a clean all-years URL and retains every individual-year link", async ({ browser }) => {
    const context = await newRoleContext(browser, "coordinator");
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              const view = window as ClipboardWindow;
              if (view.__denyCalendarCopy) throw new Error("Clipboard denied");
              view.__copiedCalendarUrl = text;
            },
          },
        });
      });

      // The calendar share panel's read data is isolated from mutable test database state.
      await page.route("**/api/programme/academic-calendar/programme", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "dse", name: "DSE" }) }),
      );
      await page.route("**/api/programme/programmes/dse/academic-calendar/years", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: "ay26", label: "2026-2027", startYear: 2026, endYear: 2027, isCurrent: true },
            { id: "ay27", label: "2027-2028", startYear: 2027, endYear: 2028, isCurrent: false },
          ]),
        }),
      );
      await page.route("**/api/programme/programmes/dse/academic-calendar/calendars?*", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
      );

      await page.goto("/academic-calendar?utm_source=chatgpt.com");
      const share = page.locator("section").filter({ has: page.getByRole("heading", { name: "Public calendar links" }) }).last();
      await expect(share.getByText("All years · 2026-2027")).toBeVisible();

      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const screenWidth = await page.evaluate(() => document.documentElement.clientWidth);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(screenWidth + 1);
        await expect(share.getByRole("button", { name: "Copy link for all years" })).toBeVisible();
      }

      await share.getByRole("button", { name: "Copy link for all years" }).click();
      await expect(share.getByRole("button", { name: "Link copied" })).toBeVisible();
      expect(await page.evaluate(() => (window as ClipboardWindow).__copiedCalendarUrl)).toBe(
        "http://127.0.0.1:3000/calendar/dse/2026-2027",
      );

      for (const year of [1, 2, 3, 4]) {
        const card = share.locator("article").filter({ has: page.getByRole("heading", { name: `Year ${year}` }) });
        await card.getByRole("button", { name: "Copy public link" }).click();
        expect(await page.evaluate(() => (window as ClipboardWindow).__copiedCalendarUrl)).toBe(
          `http://127.0.0.1:3000/calendar/dse/2026-2027/year-${year}`,
        );
      }

      await share.getByLabel("Academic Year").selectOption("ay27");
      await expect(share.getByText("All years · 2027-2028")).toBeVisible();
      await share.getByRole("button", { name: "Copy link for all years" }).click();
      expect(await page.evaluate(() => (window as ClipboardWindow).__copiedCalendarUrl)).toBe(
        "http://127.0.0.1:3000/calendar/dse/2027-2028",
      );

      await page.evaluate(() => { (window as ClipboardWindow).__denyCalendarCopy = true; });
      await share.getByRole("button", { name: "Copy link for all years" }).click();
      await expect(share.getByRole("alert")).toContainText("Could not copy the link");
      await expect(share.getByRole("button", { name: "Copy link for all years" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
