import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

test.describe("#1224 current study year browser smoke", () => {
  test("programme coordinator can review the safe initialization UI without writing", async ({ browser }) => {
    const coordinator = await newRoleContext(browser, "coordinator");
    const page = await coordinator.newPage();

    await page.goto("/students/cohorts");

    const heading = page.getByRole("heading", { name: "Initialize current study year" });
    await expect(heading).toBeVisible();
    const initializer = heading.locator("..").locator("..");

    await expect(initializer.getByText("PMS never derives programme year from cohort intake.")).toBeVisible();
    await expect(initializer.getByText("Cohort", { exact: true })).toBeVisible();
    await expect(initializer.getByText("Default study year", { exact: true })).toBeVisible();
    await expect(initializer.getByText("Academic year", { exact: true })).toBeVisible();
    await expect(initializer.getByText("Period start", { exact: true })).toBeVisible();
    await expect(initializer.getByText("Period end", { exact: true })).toBeVisible();
    await expect(initializer.getByRole("button", { name: "Preview current study year" })).toBeVisible();

    await coordinator.close();
  });
});
