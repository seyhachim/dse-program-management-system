import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const rollCallDialogSource = readFileSync(new URL("./roll-call-dialog.tsx", import.meta.url), "utf8");

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
  });

  test("shows course attendance context and the three attendance motivation badges", () => {
    expect(rollCallDialogSource).toContain("Attendance this course");
    expect(rollCallDialogSource).toContain("Perfect Attendance");
    expect(rollCallDialogSource).toContain("Reliable Learner");
    expect(rollCallDialogSource).toContain("Great Start");
  });
});
