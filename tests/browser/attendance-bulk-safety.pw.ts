import { expect, test, type Page } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

// Entirely synthetic read/write responses. Never send attendance mutations to a live backend.
const offeringId = "11111111-1111-4111-8111-111111111111";
const meetingDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const sourceRecords = [
  { studentId: "33333333-3333-4333-8333-333333333333", studentNumber: "TEST001",
    studentName: "Synthetic A", studentKhmerName: null, studentGender: "Male",
    status: "Present", permissionPending: false, permissionPendingSince: null, note: "kept note",
    recheckEligible: true, checkpoints: [{ checkNumber: 1, status: "Present", permissionPending: false }] },
  { studentId: "44444444-4444-4444-8444-444444444444", studentNumber: null,
    studentName: "Synthetic B", studentKhmerName: null, studentGender: "Female",
    status: "Absent", permissionPending: false, permissionPendingSince: null, note: "",
    recheckEligible: true, checkpoints: [{ checkNumber: 1, status: "Absent", permissionPending: false }] },
  { studentId: "55555555-5555-4555-8555-555555555555", studentNumber: "TEST003",
    studentName: "Synthetic C", studentKhmerName: null, studentGender: "Female",
    status: null, permissionPending: true, permissionPendingSince: "2026-10-15T00:00:00.000Z", note: "paper pending",
    recheckEligible: true, checkpoints: [
      { checkNumber: 1, status: null, permissionPending: true },
      { checkNumber: 2, status: null, permissionPending: true },
    ] },
];

async function stubAttendance(page: Page): Promise<{ saveCount: () => number }> {
  let savedAt = "2026-10-15T03:00:00.000Z";
  let currentRecords = structuredClone(sourceRecords);
  let saves = 0;
  await page.route("**/api/offerings", async (route) => {
    if (route.request().method() !== "GET") throw Error("Unexpected Offering mutation");
    await route.fulfill({ json: [{
      id: offeringId, term: "2026-2027-S1", sectionCode: "E1",
      status: "Planned", capacity: 50, enrolledCount: 3,
      createdAt: "2026-09-01T00:00:00.000Z", semester: "First", programmeYear: 4,
      academicCalendarPeriodId: "77777777-7777-4777-8777-777777777777",
      startDate: "2020-01-01", endDate: "2035-12-31",
      meetings: meetingDays.map((dayOfWeek) => ({ dayOfWeek })),
      course: { id: offeringId, code: "AIE401", title: "Synthetic AI Engineering", programmeId: offeringId },
      students: [], lecturer: null, coLecturers: [], courseSpec: null,
    }] });
  });
  await page.route("**/api/offerings/*/attendance**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      const date = pathname.match(/attendance\/(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!date) {
        await route.fulfill({ json: [] });
        return;
      }
      await route.fulfill({ json: { sessionId: "66666666-6666-4666-8666-666666666666",
        offeringId, date, updatedAt: savedAt, records: currentRecords,
        counts: { Present: currentRecords.filter((r) => r.status === "Present").length,
          Absent: currentRecords.filter((r) => r.status === "Absent").length,
          Late: 0, Excused: 0,
          PermissionPending: currentRecords.filter((r) => r.permissionPending).length,
          Unmarked: 0 } } });
      return;
    }
    if (request.method() !== "PUT") throw Error("Unexpected attendance mutation: " + request.method());
    const body = request.postDataJSON();
    expect(body.expectedUpdatedAt).toBe(savedAt);
    expect(body.records).toHaveLength(3);
    saves += 1;
    savedAt = "2026-10-15T03:15:00.000Z";
    currentRecords = currentRecords.map((row) => {
      const incoming = body.records.find((item: { studentId: string }) => item.studentId === row.studentId);
      return { ...row, status: incoming.status, permissionPending: incoming.permissionPending, note: incoming.note };
    });
    await route.fulfill({ json: { sessionId: "66666666-6666-4666-8666-666666666666",
      offeringId, date: pathname.match(/attendance\/(\d{4}-\d{2}-\d{2})/)?.[1],
      updatedAt: savedAt, records: currentRecords } });
  });
  return { saveCount: () => saves };
}

for (const width of [390, 1280]) {
  test(`bulk marking cancellation, undo, recheck filter and synthetic save at ${width}px`, async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    const stub = await stubAttendance(page);
    await page.goto("/attendance");
    await expect(page.getByText("Synthetic A").filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/Saved at /).first()).toBeVisible();
    await expect(page.getByText("Check 2: 1/3 students")).toBeVisible();

    const needs = page.getByRole("checkbox", { name: "Needs recheck (2)" });
    await needs.check();
    await expect(page.getByText("Synthetic C").filter({ visible: true })).toHaveCount(0);
    await needs.uncheck();

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    await page.getByRole("button", { name: "Mark all present" }).click();
    await expect(page.getByText("Undo bulk change")).toHaveCount(0);
    await expect(page.getByText(/Saved at /).first()).toBeVisible();

    page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("pending permission"); await dialog.accept(); });
    await page.getByRole("button", { name: "Mark all present" }).click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "Undo bulk change" }).click();
    await expect(page.getByText(/Saved at /).first()).toBeVisible();

    page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); await dialog.accept(); });
    await page.getByRole("button", { name: "Clear marks" }).click();
    await expect(page.getByRole("button", { name: "Save attendance" })).toBeDisabled();
    await page.getByRole("button", { name: "Undo bulk change" }).click();
    await expect(page.getByText(/Saved at /).first()).toBeVisible();

    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await page.getByRole("button", { name: "Mark all present" }).click();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText(/Saved at /).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save attendance" })).toBeDisabled();
    expect(stub.saveCount()).toBe(1);

    await page.reload();
    await expect(page.getByText(/Saved at /).first()).toBeVisible();
    expect(stub.saveCount()).toBe(1);
    await context.close();
  });
}
