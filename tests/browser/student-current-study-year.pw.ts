import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

test.describe("#1224 current study year browser smoke", () => {
  test("programme coordinator can review the safe initialization UI without writing", async ({ browser }) => {
    const coordinator = await newRoleContext(browser, "coordinator");
    const page = await coordinator.newPage();

    await page.goto("/students/cohorts");

    await expect(page.getByRole("heading", { name: "Initialize current study year" })).toBeVisible();
    await expect(page.getByText("PMS never derives programme year from cohort intake.")).toBeVisible();
    await expect(page.getByText("Cohort", { exact: true })).toBeVisible();
    await expect(page.getByText("Default study year", { exact: true })).toBeVisible();
    await expect(page.getByText("Academic year", { exact: true })).toBeVisible();
    await expect(page.getByText("Period start", { exact: true })).toBeVisible();
    await expect(page.getByText("Period end", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview current study year" })).toBeVisible();

    await coordinator.close();
  });
});
