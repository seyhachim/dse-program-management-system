import { expect, test, type Page } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

// Synthetic attendance only. The browser never mutates production records.
const offeringId = "11111111-1111-4111-8111-111111111111";
const absentId = "44444444-4444-4444-8444-444444444444";
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function stubAttendance(page: Page) {
  let rechecks = 0;
  let updatedAt = "2026-10-15T03:00:00.000Z";
  let records = [
    { studentId: "33333333-3333-4333-8333-333333333333", studentName: "Synthetic A",
      studentNumber: "TEST001", studentKhmerName: null, studentGender: "Male",
      status: "Present", permissionPending: false, permissionPendingSince: null, note: "",
      recheckEligible: true, checkpoints: [
        { checkNumber: 1, status: "Present", permissionPending: false, checkedAt: "2026-10-15T02:00:00Z", note: "", checkedById: null },
      ] },
    { studentId: absentId, studentName: "Synthetic B",
      studentNumber: null, studentKhmerName: null, studentGender: "Female",
      status: "Absent", permissionPending: false, permissionPendingSince: null, note: "",
      recheckEligible: true, checkpoints: [
        { checkNumber: 1, status: "Absent", permissionPending: false, checkedAt: "2026-10-15T02:00:00Z", note: "", checkedById: null },
      ] },
    { studentId: "55555555-5555-4555-8555-555555555555", studentName: "Synthetic C",
      studentNumber: "TEST003", studentKhmerName: null, studentGender: "Female",
      status: "Late", permissionPending: false, permissionPendingSince: null, note: "",
      recheckEligible: true, checkpoints: [
        { checkNumber: 1, status: "Absent", permissionPending: false, checkedAt: "2026-10-15T02:00:00Z", note: "", checkedById: null },
        { checkNumber: 2, status: "Late", permissionPending: false, checkedAt: "2026-10-15T02:30:00Z", note: "", checkedById: null },
      ] },
    { studentId: "66666666-6666-4666-8666-666666666666", studentName: "Historical D",
      studentNumber: "OLD004", studentKhmerName: null, studentGender: "Male",
      status: "Absent", permissionPending: false, permissionPendingSince: null, note: "",
      recheckEligible: false, checkpoints: [
        { checkNumber: 1, status: "Absent", permissionPending: false, checkedAt: "2026-10-15T02:00:00Z", note: "", checkedById: null },
      ] },
  ];
  // API rosters are presented in canonical name order; matching that baseline
  // prevents a synthetic ordering difference from looking like a dirty edit.
  records.sort((a, b) => a.studentName.localeCompare(b.studentName, "en"));

  const response = (date: string) => ({
    sessionId: "77777777-7777-4777-8777-777777777777", offeringId, date, updatedAt, records,
    counts: { Present: records.filter((r) => r.status === "Present").length,
      Absent: records.filter((r) => r.status === "Absent").length,
      Late: records.filter((r) => r.status === "Late").length,
      Excused: 0, PermissionPending: 0, Unmarked: 0 },
  });

  await page.route("**/api/offerings", async (route) => {
    if (route.request().method() !== "GET") throw Error("Unexpected offering mutation");
    await route.fulfill({ json: [{
      id: offeringId, term: "2026-2027-S1", sectionCode: "E1",
      status: "Planned", capacity: 50, enrolledCount: 4,
      createdAt: "2026-09-01T00:00:00.000Z", semester: "First", programmeYear: 4,
      academicCalendarPeriodId: "88888888-8888-4888-8888-888888888888",
      startDate: "2020-01-01", endDate: "2035-12-31",
      meetings: days.map((dayOfWeek) => ({ dayOfWeek })),
      course: { id: offeringId, code: "AIE401", title: "Synthetic Agriculture", programmeId: offeringId },
      students: [], lecturer: null, coLecturers: [], courseSpec: null,
    }] });
  });
  await page.route("**/api/offerings/*/attendance**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const date = pathname.match(/attendance\/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (request.method() === "GET" && pathname.includes("/attendance/students/")) {
      await route.fulfill({ json: { offeringId, studentId: absentId, history: [] } });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ json: date ? response(date) : [] });
      return;
    }
    if (request.method() !== "POST" || !pathname.endsWith("/recheck") || !date) {
      throw Error("Unexpected attendance mutation: " + request.method());
    }
    const input = request.postDataJSON();
    expect(input.studentId).toBe(absentId);
    expect(input.observation).toMatchObject({ status: "Late", permissionPending: false });
    expect(input.final).toMatchObject({ status: "Late", permissionPending: false });
    expect(rechecks).toBe(0);
    rechecks += 1;
    updatedAt = "2026-10-15T03:15:00.000Z";
    records = records.map((record) => record.studentId !== absentId ? record : {
      ...record, status: "Late", note: input.final.note,
      checkpoints: [...record.checkpoints, {
        checkNumber: 2, status: "Late", permissionPending: false,
        checkedAt: updatedAt, note: input.observation.note, checkedById: null,
      }],
    });
    await route.fulfill({ json: response(date) });
  });
  return { count: () => rechecks };
}

for (const width of [390, 1280]) {
  test("late arrival audit and optional advanced workflow at " + width + "px", async ({ browser }) => {
    const context = await newRoleContext(browser, "lecturer");
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    const stub = await stubAttendance(page);
    await page.goto("/attendance");

    const panel = page.getByRole("region", { name: "Late arrivals" });
    const action = panel.getByRole("button", { name: "Record late arrival" });
    await expect(action).toHaveCount(1);
    await expect(action).toBeEnabled();
    await expect(panel.getByText("Synthetic B", { exact: true })).toBeVisible();
    await expect(panel.getByText("Synthetic C", { exact: true })).toHaveCount(0);
    await expect(panel.getByText("Historical D", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Recheck", exact: true })).toHaveCount(0);

    // A local unsaved note must block late-arrival Check 2 without hiding the candidate.
    const note = width < 768
      ? page.getByRole("textbox", { name: "Note" }).first()
      : page.getByRole("textbox", { name: "Attendance note for Synthetic A" });
    await note.fill("Unsaved note");
    await expect(action).toBeDisabled();
    await expect(page.getByText("Save attendance first to enable the late-arrival action.")).toBeVisible();
    await note.fill("");
    await expect(action).toBeEnabled();

    await page.getByRole("button", { name: "Advanced recheck" }).click();
    await page.getByRole("checkbox", { name: "Awaiting Check 2 (2)" }).check();
    await expect(page.getByText("Synthetic C", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Hide advanced recheck" }).click();
    await expect(page.getByText("Synthetic C", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Awaiting Check 2/ })).toHaveCount(0);

    await action.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Record late arrival", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Confirm final attendance" })).toHaveValue("Late");
    await expect(dialog.getByRole("button", { name: "Confirm late arrival & save" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(stub.count()).toBe(0);

    await action.click();
    await dialog.getByRole("button", { name: "Confirm late arrival & save" }).click();
    await expect(dialog.getByText(/Check 2 is complete/)).toBeVisible();
    expect(stub.count()).toBe(1);
    await page.keyboard.press("Escape");
    await expect(panel.getByRole("button", { name: "Record late arrival" })).toHaveCount(0);
    await page.reload();
    await expect(panel.getByRole("button", { name: "Record late arrival" })).toHaveCount(0);
    expect(stub.count()).toBe(1);
    await context.close();
  });
}
