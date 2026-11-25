import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

type Activity = {
  id: string; offeringId: string; type: string; title: string; date: string;
  startTime: string | null; endTime: string | null; host: string;
  location: string; description: string; objectives: string;
  reflectionPrompt: string; evidenceLinks: unknown[]; status: string;
  version: number; createdAt: string; updatedAt: string;
};

test.describe("Course Activities #1328 Sindora lecturer workflow", () => {
  test("creates, edits and archives one activity without touching production data", async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    try {
      const page = await context.newPage();
      const offeringId = "isolated-activities-browser-pilot";
      let items: Activity[] = [];
      await page.route("**/api/offerings/" + offeringId + "/activities**", async (route) => {
        const method = route.request().method();
        const url = route.request().url();
        const detail = url.endsWith("/activities/pilot-1");
        const reply = (status: number, body: unknown) =>
          route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

        if (method === "GET" && !detail) {
          await reply(200, items);
          return;
        }
        if (method === "POST" && !detail) {
          const input = route.request().postDataJSON() as Record<string, unknown>;
          const item: Activity = {
            ...input as Activity,
            id: "pilot-1", offeringId, version: 1,
            createdAt: "2026-11-23T00:00:00.000Z",
            updatedAt: "2026-11-23T00:00:00.000Z",
          };
          items = [item];
          await reply(201, item);
          return;
        }
        if (method === "PATCH" && detail && items[0]) {
          const input = route.request().postDataJSON() as Record<string, unknown>;
          if (input.expectedVersion !== items[0].version) {
            await reply(409, { error: "Activity changed in another session" });
            return;
          }
          items = [{ ...items[0], ...input, version: items[0].version + 1 }];
          await reply(200, items[0]);
          return;
        }
        await reply(404, { error: "Not found" });
      });

      await page.goto("/course-delivery/activities/" + offeringId);
      await expect(page.getByText("No recorded activities yet.")).toBeVisible();
      await page.getByRole("button", { name: "Add Activity" }).click();
      await page.getByLabel("Title").fill("Sindora Garden Field Visit");
      await page.getByLabel("Date").fill("2026-11-22");
      await page.getByLabel("Host / organization").fill("Sindora Garden of Pepper");
      await page.getByLabel("Learning objectives").fill("Study regenerative pepper farming and identify AI opportunities.");
      await page.getByRole("button", { name: "Create activity" }).click();
      await expect(page.getByRole("heading", { name: "Sindora Garden Field Visit" })).toBeVisible();

      await page.setViewportSize({ width: 375, height: 850 });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

      await page.getByRole("button", { name: "Edit" }).click();
      await page.getByLabel("Description / observations").fill("Farm observation notes, pending student reflections.");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Farm observation notes, pending student reflections.")).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Archive" }).click();
      await expect(page.getByText("Archived records are preserved for audit.")).toBeVisible();
      await expect(page.getByText("Revision 3")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
