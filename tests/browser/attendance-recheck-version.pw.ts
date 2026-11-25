import { expect, test, type Page } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

// Synthetic Offering and attendance responses; no academic records are changed.
const offeringIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const studentId = "33333333-3333-4333-8333-333333333333";
const meetingDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function stubAttendance(page: Page, includeSecondStudent = false) {
  await page.route("**/api/offerings", async (route) => {
    if (route.request().method() !== "GET") throw Error("Unexpected Offering mutation");
    await route.fulfill({ json: offeringIds.map((id, index) => ({
      id, term: "2026-2027-S1", sectionCode: index ? "M2" : "M1",
      status: "Planned", capacity: 50, enrolledCount: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      semester: "First", programmeYear: 3,
      academicCalendarPeriodId: "44444444-4444-4444-8444-444444444444",
      startDate: "2020-01-01", endDate: "2035-12-31",
      meetings: meetingDays.map((dayOfWeek) => ({ dayOfWeek })),
      course: { id, code: "DSS301", title: "Test Agriculture", programmeId: id },
      students: [], lecturer: null, coLecturers: [], courseSpec: null,
    })) });
  });
  await page.route("**/api/offerings/*/attendance**", async (route) => {
    if (route.request().method() !== "GET") throw Error("Unexpected attendance mutation");
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/semester-notes")) { await route.fulfill({ json: [] }); return; }
    const id = offeringIds.find((value) => pathname.includes(value))!;
    if (pathname.includes("/attendance/students/")) {
      await route.fulfill({ json: { offeringId: id, studentId, history: [] } });
      return;
    }
    const date = pathname.match(/attendance\/(\d{4}-\d{2}-\d{2})/)?.[1];
    const counts = { Present: 0, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0, Unmarked: includeSecondStudent ? 2 : 1 };
    await route.fulfill({ json: date
      ? { sessionId: null, offeringId: id, date, updatedAt: null, counts,
          records: [{ studentId, studentNumber: "TEST001", studentName: "Synthetic Student",
            studentKhmerName: null, studentGender: "Male", status: null, permissionPending: false,
            permissionPendingSince: null, note: "", checkpoints: [], recheckEligible: true },
            ...(includeSecondStudent ? [{ studentId: "66666666-6666-4666-8666-666666666666", studentNumber: "TEST002", studentName: "Second Synthetic Student",
              studentKhmerName: null, studentGender: "Female", status: null, permissionPending: false,
              permissionPendingSince: null, note: "", checkpoints: [], recheckEligible: true }] : [])] }
      : [{ sessionId: "55555555-5555-4555-8555-555555555555", offeringId: id,
           date: "2026-10-02", updatedAt: "2026-10-02T12:00:00.000Z",
           counts: { Present: 1, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 } }] });
  });
}


test("Check 2 refuses a background-refreshed register version", async ({ browser }) => {
  const context = await newRoleContext(browser, "lecturer");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubAttendance(page);

  const firstVersion = "2026-10-02T12:00:00.000Z";
  const newerVersion = "2026-10-02T12:01:00.000Z";
  const sessionId = "55555555-5555-4555-8555-555555555555";
  let refreshed = false;
  let mutationCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/attendance/") && request.method() !== "GET") mutationCount++;
  });
  const dateRoute = /\/api\/offerings\/[^/]+\/attendance\/\d{4}-\d{2}-\d{2}$/;
  await page.route(dateRoute, async (route) => {
    if (route.request().method() !== "GET") throw Error("Unexpected attendance mutation");
    const pathname = new URL(route.request().url()).pathname;
    const offeringId = offeringIds.find((id) => pathname.includes(id))!;
    const date = pathname.split("/").at(-1)!;
    const status = refreshed ? "Present" : "Absent";
    await route.fulfill({ json: {
      sessionId, offeringId, date, updatedAt: refreshed ? newerVersion : firstVersion,
      counts: { Present: refreshed ? 1 : 0, Absent: refreshed ? 0 : 1, Late: 0,
        Excused: 0, PermissionPending: 0, Unmarked: 0 },
      records: [{
        studentId, studentNumber: "TEST001", studentName: "Synthetic Student",
        studentKhmerName: null, studentGender: "Male", status, permissionPending: false,
        permissionPendingSince: null, note: refreshed ? "New correction" : "First roll",
        recheckEligible: true,
        checkpoints: [{ id: "77777777-7777-4777-8777-777777777777",
          checkNumber: 1, status: "Absent", permissionPending: false,
          note: "First roll", checkedAt: firstVersion, checkedById: null }],
      }],
    } });
  });

  await page.goto("/attendance");
  await page.getByRole("button", { name: "Record late arrival", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Student attendance recheck" });
  await expect(dialog.getByRole("button", { name: "Confirm late arrival & save" })).toBeEnabled();
  await dialog.getByRole("textbox", { name: "Final note" }).fill("Unsubmitted draft");

  // The attendance query has a 5-second stale time and refetches on visibility.
  // Simulate another lecturer's correction without navigating away from the dialog.
  refreshed = true;
  await page.waitForTimeout(5100);
  const response = page.waitForResponse((r) => dateRoute.test(r.url()) && r.request().method() === "GET");
  await page.evaluate(() => {
    // React Query reacts to an actual hidden → visible transition, not merely
    // a repeated visibility event while the page is already focused.
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    window.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("visibilitychange"));
    Reflect.deleteProperty(document, "visibilityState");
  });
  await response;
  await expect(dialog.getByText("Final attendance", { exact: true }).locator("..")
    .getByText("Present", { exact: true })).toBeVisible();

  await expect(dialog.getByRole("textbox", { name: "Final note" })).toHaveValue("Unsubmitted draft");
  await dialog.getByRole("button", { name: "Save Check 2 & final status" }).click();
  await expect(dialog.getByText("Attendance changed or is still loading. Reload the register before recording Check 2.")).toBeVisible();
  expect(mutationCount).toBe(0);
  await context.close();
});
