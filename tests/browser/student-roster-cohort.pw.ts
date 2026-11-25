import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

async function apiFor(role: "ADMIN" | "STUDENT") {
  const token = process.env["BROWSER_SMOKE_" + role + "_TOKEN"];
  if (!token) throw new Error("Isolated browser smoke token required");
  return request.newContext({
    baseURL: "http://127.0.0.1:4000",
    extraHTTPHeaders: { Authorization: "Bearer " + token },
  });
}

async function create(api: APIRequestContext, path: string, data: object): Promise<{ id: string }> {
  const response = await api.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("#1348 real cohort roster counts, class scope, pagination and desktop/mobile filtering", async ({ browser }) => {
  const api = await apiFor("ADMIN");
  const studentApi = await apiFor("STUDENT");
  const staff = await newRoleContext(browser, "admin");
  try {
    // Only synthetic data in the isolated browser-smoke database.
    const marker = "RosterCI-" + Date.now();
    const first = await create(api, "/api/students/cohorts", {
      programmeId: "dse", code: marker + "-A", name: marker + " Alpha",
      intakeYear: 2026, expectedGraduationYear: 2030,
    });
    const second = await create(api, "/api/students/cohorts", {
      programmeId: "dse", code: marker + "-B", name: marker + " Beta",
      intakeYear: 2025, expectedGraduationYear: 2029,
    });
    const a = await create(api, "/api/students", { name: marker + " Alice", studentId: marker + "-1", status: "Active" });
    const b = await create(api, "/api/students", { name: marker + " Bob", studentId: marker + "-2", status: "Pending" });
    const c = await create(api, "/api/students", { name: marker + " Closed", studentId: marker + "-3", status: "Active" });
    const d = await create(api, "/api/students", { name: marker + " Other", studentId: marker + "-4", status: "Active" });
    const date = "2026-01-01";
    for (const [cohort, student] of [[first, a], [first, b], [second, d]] as const) {
      await create(api, "/api/students/cohorts/" + cohort.id + "/memberships", { studentId: student.id, joinedAt: date });
    }
    const closed = await create(api, "/api/students/cohorts/" + first.id + "/memberships", { studentId: c.id, joinedAt: date });
    const exit = await api.post("/api/students/cohorts/" + first.id + "/memberships/" + closed.id + "/exit", {
      data: { exitedAt: "2026-02-01", exitReason: "Other" },
    });
    expect(exit.ok(), await exit.text()).toBe(true);
    const section = await create(api, "/api/students/cohort-sections", { cohortId: first.id, code: "M1", name: "Class one" });
    const otherSection = await create(api, "/api/students/cohort-sections", { cohortId: second.id, code: "M1", name: "Other class" });
    await create(api, "/api/students/cohort-sections/" + section.id + "/memberships", { studentId: a.id, joinedAt: date });
    await create(api, "/api/students/cohort-sections/" + otherSection.id + "/memberships", { studentId: d.id, joinedAt: date });

    const counts = await api.get("/api/students/roster-cohorts");
    expect(counts.ok(), await counts.text()).toBe(true);
    const overview = await counts.json();
    expect(overview.cohorts.find((row: { id: string }) => row.id === first.id)).toMatchObject({
      memberCount: 2, activeCount: 1, pendingCount: 1,
    });
    const denied = await studentApi.get("/api/students/roster-cohorts");
    expect(denied.status()).toBe(403);
    const deniedPage = await studentApi.get("/api/students/page?cohortId=" + first.id);
    expect(deniedPage.status()).toBe(403);

    const path = "/api/students/page?cohortId=" + first.id;
    const p1 = await api.get(path + "&limit=1");
    expect(p1.ok()).toBe(true);
    const firstPage = await p1.json();
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    const p2 = await api.get(path + "&limit=1&cursor=" + encodeURIComponent(firstPage.nextCursor));
    expect(p2.ok()).toBe(true);
    const secondPage = await p2.json();
    expect(secondPage.nextCursor).toBeNull();
    expect([firstPage.items[0].id, secondPage.items[0].id].sort()).toEqual([a.id, b.id].sort());
    const exact = await api.get(path + "&sectionId=" + section.id);
    expect(exact.ok()).toBe(true);
    expect((await exact.json()).items.map((row: { id: string }) => row.id)).toEqual([a.id]);
    const wrong = await api.get(path + "&sectionId=" + otherSection.id);
    expect(wrong.ok()).toBe(true);
    expect((await wrong.json()).items).toEqual([]);
    const unassigned = await api.get("/api/students/page?cohortId=unassigned&search=" + encodeURIComponent(marker + " Closed"));
    expect(unassigned.ok()).toBe(true);
    expect((await unassigned.json()).items.map((row: { id: string }) => row.id)).toEqual([c.id]);

    const page = await staff.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto("/students");
    const card = page.getByRole("button", { name: new RegExp(marker + "-A") });
    await expect(card).toContainText("2 current members");
    await expect(card).toContainText("1 active · 1 pending student records");
    await card.click();
    await expect(page.getByText(marker + " Alice", { exact: true })).toBeVisible();
    await expect(page.getByText(marker + " Bob", { exact: true })).toBeVisible();
    await expect(page.getByText(marker + " Closed", { exact: true })).toHaveCount(0);
    await page.getByLabel("Filter by class").click();
    await page.getByRole("option", { name: "M1 — Class one" }).click();
    await expect(page.getByText(marker + " Alice", { exact: true })).toBeVisible();
    await expect(page.getByText(marker + " Bob", { exact: true })).toHaveCount(0);
    await page.getByPlaceholder("Search students…").fill("nonexistent-" + marker);
    await expect(page.getByText("No students match the selected filters.")).toBeVisible();
    await page.getByPlaceholder("Search students…").fill("");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: new RegExp(marker + "-B") }).click();
    await expect(page.getByText(marker + " Other", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Filter by class")).toContainText("All classes");
    await expect(page.getByText(marker + " Alice", { exact: true })).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  } finally {
    await staff.close();
    await api.dispose();
    await studentApi.dispose();
  }
});
