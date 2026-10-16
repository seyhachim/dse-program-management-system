import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const client = readFileSync(new URL("./attendance-client.tsx", import.meta.url), "utf8");
const progress = readFileSync(new URL("./attendance-week-progress-view.tsx", import.meta.url), "utf8");

describe("attendance week selector and 16-week navigation", () => {
  test("week choices stop at the current week and navigate to a scheduled date", () => {
    expect(client).toContain('id="attendance-week"');
    expect(client).toContain("selectableAttendanceWeeks(weekOverview)");
    expect(client).toContain("availableWeeks.map((item)");
    expect(client).toContain("if (selected?.targetDate) selectAttendanceWeek(selected.targetDate)");
    expect(client).not.toContain("Derived from the teaching period.");
  });

  test("the existing unsaved-change guard protects both dropdown and progress-bar navigation", () => {
    expect(client).toContain("function selectAttendanceWeek(targetDate: string)");
    expect(client).toContain("saving || !confirmContextChange()");
    expect(client).toContain("onSelectDate={selectAttendanceWeek}");
  });

  test("progress reports saved sessions only when history query succeeded", () => {
    expect(client).toContain("historyReady={historyQuery.isSuccess}");
    expect(progress).toContain("historyReady ? TONES[item.status] : TONES.future");
    expect(progress).toContain('role="group" aria-label="16-week attendance record progress"');
    expect(progress).toContain("grid-cols-8 gap-1.5 sm:grid-cols-16");
    expect(progress).toContain("not proof that a class was held or cancelled");
  });
});
