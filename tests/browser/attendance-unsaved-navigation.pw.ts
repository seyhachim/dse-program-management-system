import { expect, test, type Page } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

// Exercise navigation only. All Offering/attendance responses are synthetic and
// the test never sends a mutation to the production (or local) attendance API.
const offeringIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const studentId = "33333333-3333-4333-8333-333333333333";
const meetingDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function stubAttendance(page: Page) {
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
    const id = offeringIds.find((value) => pathname.includes(value))!;
    const date = pathname.match(/attendance\/(\d{4}-\d{2}-\d{2})/)?.[1];
    const counts = { Present: 0, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0, Unmarked: 1 };
    await route.fulfill({ json: date
      ? { sessionId: null, offeringId: id, date, updatedAt: null, counts,
          records: [{ studentId, studentNumber: "TEST001", studentName: "Synthetic Student",
            studentKhmerName: null, studentGender: "Male", status: null, permissionPending: false,
            permissionPendingSince: null, note: "", checkpoints: [], recheckEligible: true }] }
      : [{ sessionId: "55555555-5555-4555-8555-555555555555", offeringId: id,
           date: "2026-10-02", updatedAt: "2026-10-02T12:00:00.000Z",
           counts: { Present: 1, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 } }] });
  });
}

for (const width of [390, 1280]) {
  test(`unsaved class/date/history guard at ${width}px`, async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await stubAttendance(page);
    await page.goto("/attendance");

    const offering = page.getByLabel("Class scheduled on date");
    const date = page.getByLabel("Attendance date");
    await expect(page.getByText("Synthetic Student")).toBeVisible();
    await page.getByRole("button", { name: "Mark all present" }).click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    await offering.selectOption(offeringIds[1]);
    await expect(offering).toHaveValue(offeringIds[0]);
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    const originalDate = await date.inputValue();
    await date.fill("2026-10-16");
    await expect(date).toHaveValue(originalDate);

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    await page.getByRole("button", { name: /Open register|^Open$/ }).first().click();
    await expect(date).toHaveValue(originalDate);

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.accept(); });
    await offering.selectOption(offeringIds[1]);
    await expect(offering).toHaveValue(offeringIds[1]);
    await expect(page.getByText("No unsaved changes")).toBeVisible();

    await context.close();
  });
}
