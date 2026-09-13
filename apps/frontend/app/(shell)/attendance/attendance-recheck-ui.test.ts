import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const attendanceSource = readFileSync(
  new URL("./attendance-client.tsx", import.meta.url),
  "utf8",
);
const dialogSource = readFileSync(
  new URL("./student-recheck-dialog.tsx", import.meta.url),
  "utf8",
);
const stateSource = readFileSync(
  new URL("./attendance-recheck-state.ts", import.meta.url),
  "utf8",
);

describe("Attendance individual recheck UI", () => {
  test("register exposes per-student recheck state and action", () => {
    expect(attendanceSource).toContain("View / Recheck");
    expect(stateSource).toContain("Needs recheck");
    expect(stateSource).toContain("Checked twice");
    expect(stateSource).toContain("Changed");
    expect(attendanceSource).toContain("Save attendance changes before opening recheck");
    expect(attendanceSource).toContain("<StudentRecheckDialog");
  });

  test("panel shows two audit checks, final status, bilingual identity, and history", () => {
    expect(dialogSource).toContain("Individual attendance recheck");
    expect(dialogSource).toContain('label="Check 1"');
    expect(dialogSource).toContain('label="Check 2"');
    expect(dialogSource).toContain("Final attendance");
    expect(dialogSource).toContain("record.studentKhmerName");
    expect(dialogSource).toContain("record.studentName");
    expect(dialogSource).toContain("record.studentGender");
    expect(dialogSource).toContain("Recent attendance");
    expect(dialogSource).toContain("Previous");
    expect(dialogSource).toContain("Next");
  });

  test("changed Check 2 requires explicit final attendance instead of policy inference", () => {
    expect(dialogSource).toContain("Observation changed from Check 1");
    expect(dialogSource).toContain("Choose the final academic attendance below");
    expect(dialogSource).toContain("The PMS will not automatically infer Late, Present, or another result");
    expect(dialogSource).toContain("Choose final status…");
    expect(dialogSource).toContain("Save Check 2 & final status");
  });

  test("panel is full-screen on phones and right-side constrained on larger screens", () => {
    expect(dialogSource).toContain("h-[100dvh]");
    expect(dialogSource).toContain("w-screen");
    expect(dialogSource).toContain("sm:w-[540px]");
    expect(dialogSource).toContain("right-0");
  });
});
