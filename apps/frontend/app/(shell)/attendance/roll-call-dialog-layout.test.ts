import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const rollCallDialogSource = readFileSync(
  new URL("./roll-call-dialog-base.tsx", import.meta.url),
  "utf8",
);
const rollCallGuardSource = readFileSync(
  new URL("./roll-call-dialog.tsx", import.meta.url),
  "utf8",
);

describe("Roll Call dialog layout", () => {
  test("uses the full viewport for the focused roll-call workflow", () => {
    expect(rollCallDialogSource).toContain("h-[100dvh]");
    expect(rollCallDialogSource).toContain("w-screen");
    expect(rollCallDialogSource).toContain("sm:max-w-none");
    expect(rollCallDialogSource).toContain("rounded-none");
  });

  test("keeps student identity dominant and Khmer name above the Latin name", () => {
    const khmerName = rollCallDialogSource.indexOf("current.studentKhmerName");
    const latinName = rollCallDialogSource.indexOf("{current.studentName}", khmerName);
    expect(khmerName).toBeGreaterThan(-1);
    expect(latinName).toBeGreaterThan(khmerName);
    expect(rollCallDialogSource).toContain("2xl:text-9xl");
    expect(rollCallDialogSource).toContain("2xl:text-8xl");
    expect(rollCallDialogSource).toContain("max-w-[min(1100px,94vw)]");
  });

  test("shows course attendance context and renders earned attendance badges", () => {
    expect(rollCallDialogSource).toContain("Attendance this course");
    expect(rollCallDialogSource).toContain("history.badges.map");
    expect(rollCallDialogSource).toContain("<BadgeIcon title={badge} /> {badge}");
    expect(rollCallDialogSource).toContain("Perfect Attendance");
    expect(rollCallDialogSource).toContain("Reliable Learner");
  });

  test("does not allow a zero-mark roll call to save", () => {
    expect(rollCallDialogSource).toContain("hasAttendanceObservation(records)");
    expect(rollCallDialogSource).toContain(
      "disabled={saving || records.length === 0 || !canSaveAttendance}",
    );
    expect(rollCallDialogSource).toContain(
      "Mark at least one student before saving. Unmarked is not a saved attendance status.",
    );
  });

  test("requires explicit course and class confirmation before mounting active Roll Call", () => {
    expect(rollCallGuardSource).toContain("Confirm class before marking attendance");
    expect(rollCallGuardSource).toContain("You are taking attendance for");
    expect(rollCallGuardSource).toContain("{courseTitle}");
    expect(rollCallGuardSource).toContain("{courseCode}");
    expect(rollCallGuardSource).toContain("Class {sectionCode}");
    expect(rollCallGuardSource).toContain("{weekLabel}");
    expect(rollCallGuardSource).toContain("formatAttendanceDate(date)");
    expect(rollCallGuardSource).toContain("{records.length}");
    expect(rollCallGuardSource).toContain("Start {courseCode} {sectionCode} Roll Call");
    expect(rollCallGuardSource).toContain("confirmedContext === contextKey");
    expect(rollCallGuardSource).toContain("<ActiveRollCallDialog {...props} />");
  });

  test("keeps cancel non-destructive and shortcuts inactive before confirmation", () => {
    expect(rollCallGuardSource).toContain("onClick={onRequestClose}");
    expect(rollCallGuardSource).toContain(
      "Roll Call shortcuts stay disabled until you confirm.",
    );
    const confirmationCheck = rollCallGuardSource.indexOf(
      "confirmedContext === contextKey",
    );
    const activeDialog = rollCallGuardSource.indexOf(
      "<ActiveRollCallDialog {...props} />",
    );
    expect(confirmationCheck).toBeGreaterThan(-1);
    expect(activeDialog).toBeGreaterThan(confirmationCheck);
  });
});
