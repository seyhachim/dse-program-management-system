import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

test("admin can discover and preview published DSE News without student enrollment", async ({ browser }) => {
  const ctx = await newRoleContext(browser, "admin");
  try {
    const page = await ctx.newPage();
    const article = {
      id: "synthetic-news-preview",
      programmeId: "dse",
      activityId: null,
      title: "Synthetic Sindora Garden Field Visit",
      summary: "An approved programme story",
      body: "DSE Year 4 students explored sustainable pepper farming and practical field decision-making.",
      coverImageUrl: null,
      coverAlt: "",
      gallery: [],
      uploadedMedia: [],
      tags: ["Field Visit"],
      mediaApproved: true,
      status: "Published",
      version: 2,
      authorName: "Synthetic Staff",
      publishedAt: "2026-11-24T08:59:50.884Z",
      createdAt: "2026-11-23T00:00:00.000Z",
      updatedAt: "2026-11-24T08:59:50.884Z",
    };
    await page.route("**/api/student-portal/news/manage**", async (route) => {
      const uri = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(uri.endsWith("/manage") ? [article] : article),
      });
    });
    await page.goto("/dse-news");
    await expect(page.getByRole("link", { name: "DSE News", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View published article" })).toBeVisible();
    await page.getByRole("link", { name: "View published article" }).click();
    await expect(page).toHaveURL(/\/dse-news\/view\/synthetic-news-preview$/);
    await expect(page.getByRole("heading", { name: "Synthetic Sindora Garden Field Visit" })).toBeVisible();
    await expect(page.getByText("DSE Year 4 students explored sustainable pepper farming", { exact: false })).toBeVisible();
    await expect(page.getByText("Staff preview · Only the published article", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "DSE News" }).last().click();
    await expect(page).toHaveURL(/\/dse-news$/);
  } finally {
    await ctx.close();
  }
});
