import { expect, test, type Page } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

// Exercise navigation only. All Offering/attendance responses are synthetic and
// the test never sends a mutation to the production (or local) attendance API.
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

for (const width of [390, 1280]) {
  test(`unsaved class/date/history guard at ${width}px`, async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await stubAttendance(page);
    await page.goto("/attendance");

    const offering = page.locator("select").first();
    const date = page.locator('input[type="date"]');
    const week = page.locator("#attendance-week");
    const weekProgress = page.getByRole("group", { name: "16-week attendance record progress" });
    await expect(page.getByText("Synthetic Student").filter({ visible: true })).toBeVisible();
    await expect(weekProgress.getByRole("button")).toHaveCount(16);
    await expect(week.locator('option:not([value=""])')).toHaveCount(16);
    await page.getByRole("button", { name: "Mark all present" }).click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    const initialDate = await date.inputValue();
    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    await weekProgress.getByRole("button", { name: /Week 1:/ }).click();
    await expect(date).toHaveValue(initialDate);

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    await offering.selectOption(offeringIds[1]);
    await expect(offering).toHaveValue(offeringIds[0]);
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    const originalDate = await date.inputValue();
    // Always switch to a DIFFERENT date. On Oct 16 the previous hard-coded
    // date matched today and left a dangling one-shot dialog listener.
    const otherDate = originalDate === "2026-10-16" ? "2026-10-17" : "2026-10-16";
    await date.fill(otherDate);
    await expect(date).toHaveValue(originalDate);

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    await page.getByRole("button", { name: /Open register|^Open$/ }).first().click();
    await expect(date).toHaveValue(originalDate);

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.accept(); });
    await offering.selectOption(offeringIds[1]);
    await expect(offering).toHaveValue(offeringIds[1]);
    await expect(page.getByText("Not saved yet")).toBeVisible();
    await week.selectOption("1");
    // Every synthetic weekday is scheduled; pick the latest past unsaved date in Week 1.
    await expect(date).toHaveValue("2020-01-07");
    await expect(offering).toHaveValue(offeringIds[1]);

    await context.close();
  });
}

for (const width of [390, 1280]) {
  test(`cached week/date/class navigation restores the register at ${width}px`, async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await stubAttendance(page);
    await page.goto("/attendance");

    const offering = page.locator("select").first();
    const date = page.locator('input[type="date"]');
    const week = page.locator("#attendance-week");
    const visibleStudent = page.getByText("Synthetic Student").filter({ visible: true });
    const originalDate = await date.inputValue();

    // Load two distinct weeks, then revisit Week 1 from React Query cache.
    await expect(visibleStudent).toBeVisible();
    await week.selectOption("1");
    await expect(date).toHaveValue("2020-01-07");
    await expect(visibleStudent).toBeVisible();
    await week.selectOption("2");
    await expect(date).toHaveValue("2020-01-14");
    await expect(visibleStudent).toBeVisible();
    await week.selectOption("1");
    await expect(date).toHaveValue("2020-01-07");
    await expect(visibleStudent).toBeVisible();

    // Date picker and class selector must also restore cached server rosters.
    await date.fill(originalDate);
    await expect(visibleStudent).toBeVisible();
    await date.fill("2020-01-07");
    await expect(visibleStudent).toBeVisible();
    await offering.selectOption(offeringIds[1]);
    await expect(visibleStudent).toBeVisible();
    await offering.selectOption(offeringIds[0]);
    await expect(visibleStudent).toBeVisible();

    await expect(page.getByText("This class has no enrolled students yet")).toHaveCount(0);
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);
    await context.close();
  });
}

for (const width of [390, 1280]) {
  test(`private semester note persists across 16-week navigation at ${width}px`, async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await stubAttendance(page);

    const notes = new Map<string, { studentId: string; note: string; version: number; updatedAt: string }>();
    await page.route("**/api/offerings/*/attendance/semester-notes**", async (route) => {
      const url = new URL(route.request().url());
      const selectedOffering = offeringIds.find((id) => url.pathname.includes(id))!;
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({ json: notes.has(selectedOffering) ? [notes.get(selectedOffering)] : [] });
        return;
      }
      if (method !== "PUT") throw Error("Unexpected semester note request");
      const body = route.request().postDataJSON() as { note: string; expectedVersion: number };
      const current = notes.get(selectedOffering);
      if ((current?.version ?? 0) !== body.expectedVersion) {
        await route.fulfill({ status: 409, json: { error: "Student note changed" } });
        return;
      }
      const saved = {
        studentId, note: body.note, version: (current?.version ?? 0) + 1,
        updatedAt: "2026-10-17T09:00:00.000Z",
      };
      notes.set(selectedOffering, saved);
      await route.fulfill({ json: saved });
    });

    await page.goto("/attendance");
    const visibleStudent = page.getByText("Synthetic Student").filter({ visible: true });
    await expect(visibleStudent).toBeVisible();
    await page.getByRole("button", { name: "Add persistent student note" }).click();
    await page.getByRole("textbox", { name: "Lecturer-only note" }).fill("Discuss tutorial exercises next week");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("button", { name: "Edit persistent student note" })).toBeVisible();
    await expect(page.getByText("Discuss tutorial exercises next week").filter({ visible: true })).toBeVisible();

    const week = page.locator("#attendance-week");
    await week.selectOption("1");
    await expect(visibleStudent).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit persistent student note" })).toBeVisible();
    await week.selectOption("2");
    await expect(page.getByRole("button", { name: "Edit persistent student note" })).toBeVisible();
    await week.selectOption("1");
    await expect(page.getByRole("button", { name: "Edit persistent student note" })).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    // The note must not leak across sections of the same course.
    await page.locator("select").first().selectOption(offeringIds[1]);
    await expect(visibleStudent).toBeVisible();
    await expect(page.getByRole("button", { name: "Add persistent student note" })).toBeVisible();
    await page.locator("select").first().selectOption(offeringIds[0]);
    await expect(page.getByRole("button", { name: "Edit persistent student note" })).toBeVisible();
    await context.close();
  });
}

for (const width of [390, 1280]) {
  test(`Roll Call displays only the current student's persistent private note at ${width}px`, async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await stubAttendance(page, true);
    await page.route("**/api/offerings/*/attendance/semester-notes", async (route) => {
      if (route.request().method() !== "GET") throw Error("Roll Call must never write a semester note");
      await route.fulfill({ json: [{
        // The roster sorts "Second Synthetic Student" before "Synthetic Student".
        studentId: "66666666-6666-4666-8666-666666666666",
        note: "Follow up on previous week's lab.\nAsk about the missing exercise.",
        version: 1, updatedAt: "2026-10-17T09:00:00.000Z",
      }] });
    });
    await page.goto("/attendance");
    await expect(page.getByText("Synthetic Student", { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "Start Roll Call" }).click();
    await page.getByRole("button", { name: "Start DSS301 M1 Roll Call" }).click();

    const pinnedNote = page.locator('[data-testid="roll-call-semester-note"]:visible');
    await expect(pinnedNote).toHaveCount(1);
    await expect(pinnedNote).toContainText("Follow up on previous week's lab.");
    await expect(pinnedNote).toContainText("Ask about the missing exercise.");
    await expect(pinnedNote).toContainText("read-only during roll call");

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Synthetic Student", exact: true })).toBeVisible();
    await expect(pinnedNote).toHaveCount(0);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Second Synthetic Student" })).toBeVisible();
    await expect(pinnedNote).toContainText("Follow up on previous week's lab.");

    // Marking automatically advances; it must also clear the prior student's note.
    await page.getByRole("button", { name: "Present P" }).click();
    await expect(page.getByRole("heading", { name: "Synthetic Student", exact: true })).toBeVisible();
    await expect(pinnedNote).toHaveCount(0);
    await context.close();
  });

  test(`Roll Call explicitly reports private note load failure without blocking attendance at ${width}px`, async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await stubAttendance(page);
    await page.route("**/api/offerings/*/attendance/semester-notes", async (route) => {
      await route.fulfill({ status: 503, json: { error: "Notes unavailable" } });
    });
    await page.goto("/attendance");
    await expect(page.getByText("Synthetic Student", { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "Start Roll Call" }).click();
    await page.getByRole("button", { name: "Start DSS301 M1 Roll Call" }).click();
    await expect(page.getByText("Private semester notes are unavailable. Attendance marking still works.").filter({ visible: true })).toBeVisible();
    await expect(page.locator('[data-testid="roll-call-semester-note"]:visible')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Present", exact: false })).toBeEnabled();
    await context.close();
  });
}
