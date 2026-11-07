import { expect, test } from "@playwright/test";

const HUB_PATH = "/calendar/dse/2026-2027";
const YEARS = [1, 2, 3, 4] as const;

test.describe("#1282 public Academic Calendar hub", () => {
  test("opens every official study-year route in a separate tab without login", async ({ browser }) => {
    // Deliberately no auth token: this page must be shareable to all students.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      const response = await page.goto(HUB_PATH);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(HUB_PATH);
      await expect(page.getByRole("heading", { level: 1, name: "Academic Calendar" })).toBeVisible();
      await expect(page.getByText("2026–2027", { exact: true })).toBeVisible();
      await expect(page.getByText("Select your year to view the calendar.")).toBeVisible();
      await expect(page.getByText("Only published academic calendars are shown.")).toBeVisible();

      for (const year of YEARS) {
        const href = `${HUB_PATH}/year-${year}`;
        const link = page.getByRole("link", {
          name: `Open Year ${year} academic calendar in a new tab`,
        });
        await expect(link.getByRole("heading", { name: `Year ${year}` })).toBeVisible();
        await expect(link.getByText("View calendar", { exact: true })).toBeVisible();
        await expect(link).toHaveAttribute("href", href);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");

        const newTabPromise = page.waitForEvent("popup");
        await link.click();
        const newTab = await newTabPromise;
        await newTab.waitForLoadState("domcontentloaded");
        expect(new URL(newTab.url()).pathname).toBe(href);
        await expect(newTab.getByRole("heading", { level: 1, name: "Academic Calendar" })).toBeVisible();
        await expect(newTab.getByText(`2026-2027 · Year ${year}`)).toBeVisible();
        // Published-only projection may legitimately say "not issued yet" on this isolated CI DB.
        // It must not reveal a private login page or switch to a different study year.
        await expect(newTab.getByRole("heading", { name: "Calendar not issued yet" }).or(
          newTab.getByRole("heading", { name: "Semester 1" }),
        )).toBeVisible();
        await newTab.close();
      }
    } finally {
      await context.close();
    }
  });

  test("keeps four accessible cards inside mobile and desktop viewports", async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      for (const width of [320, 360, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(HUB_PATH);
        await expect(page.getByRole("heading", { level: 1, name: "Academic Calendar" })).toBeVisible();
        const links = page.getByRole("region", { name: "Study year calendars" }).getByRole("link");
        await expect(links).toHaveCount(4);

        const actualWidth = await page.evaluate(() => document.documentElement.clientWidth);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(actualWidth + 1);

        const rects = await links.evaluateAll((anchors) =>
          anchors.map((anchor) => {
            const rect = anchor.getBoundingClientRect();
            return { x: rect.x, right: rect.right, y: rect.y, width: rect.width };
          }),
        );
        for (const rect of rects) {
          expect(rect.x).toBeGreaterThanOrEqual(-1);
          expect(rect.right).toBeLessThanOrEqual(actualWidth + 1);
          expect(rect.width).toBeGreaterThan(0);
        }
        if (width < 640) {
          expect(rects[1].y).toBeGreaterThan(rects[0].y + 1);
        } else {
          expect(Math.abs(rects[1].y - rects[0].y)).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await context.close();
    }
  });
});
