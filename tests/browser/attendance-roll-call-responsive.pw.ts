import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

async function rollCallLayoutAt(page: import("@playwright/test").Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/attendance");

  const action = page.getByRole("button", { name: "Start Roll Call" });
  await expect(action).toBeVisible();
  const context = action.locator("..");
  await expect(context).toBeVisible();

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const contextBox = await context.boundingBox();
  const actionBox = await action.boundingBox();
  expect(contextBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect((contextBox?.x ?? 0) + (contextBox?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1);
  expect((actionBox?.x ?? 0) + (actionBox?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1);

  return {
    direction: await context.evaluate((element) => getComputedStyle(element).flexDirection),
    contextWidth: contextBox?.width ?? 0,
    actionWidth: actionBox?.width ?? 0,
  };
}

test.describe("#1205 Attendance Roll Call responsive smoke", () => {
  test("keeps the CTA contained at the 640–767px risk range and switches to a row on desktop", async ({ browser }) => {
    const admin = await newRoleContext(browser, "admin");
    const page = await admin.newPage();

    const narrow = await rollCallLayoutAt(page, 700);
    expect(narrow.direction).toBe("column");
    expect(narrow.actionWidth).toBeLessThanOrEqual(narrow.contextWidth + 1);

    const desktop = await rollCallLayoutAt(page, 1280);
    expect(desktop.direction).toBe("row");
    expect(desktop.actionWidth).toBeLessThan(desktop.contextWidth);

    await admin.close();
  });
});
