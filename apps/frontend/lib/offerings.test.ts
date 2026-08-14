import { expect, test } from "bun:test";
import type { LecturerWorkloadSummary } from "@dse-pms/shared-types";
import { workloadForTerm } from "./offerings";

const summary: LecturerWorkloadSummary = {
  scheduleRows: [
    {
      meetingId: "meeting-a",
      offeringId: "offering-a",
      course: { id: "course", code: "DSE301", title: "Data Engineering" },
      term: "2026-Fall",
      sectionCode: "A",
      role: "Primary",
      dayOfWeek: "Monday",
      startTime: "08:00",
      endTime: "10:00",
      room: "A203",
      activityType: "Lecture",
      durationHours: 2,
    },
  ],
  scheduledWeeklyHours: 2,
  rows: [
    {
      offeringId: "offering-a",
      course: { id: "course", code: "DSE301", title: "Data Engineering" },
      term: "2026-Fall",
      sectionCode: "A",
      role: "Primary",
      week: 1,
      lectureHours: 2,
      tutorialHours: 1,
      practiceHours: 0,
      otherHours: 0,
      totalContactHours: 3,
    },
    {
      offeringId: "offering-b",
      course: { id: "course", code: "DSE301", title: "Data Engineering" },
      term: "2027-Spring",
      sectionCode: "B",
      role: "Primary",
      week: 1,
      lectureHours: 2,
      tutorialHours: 1,
      practiceHours: 0,
      otherHours: 0,
      totalContactHours: 3,
    },
  ],
  weeklyTotals: [
    { term: "2027-Spring", week: 1, totalContactHours: 3 },
    { term: "2026-Fall", week: 1, totalContactHours: 3 },
  ],
  peakWeeklyHours: 3,
  totalHours: 6,
  coLecturerAssumption: "full",
};

test("selected term filters workload rows and recalculates the total", () => {
  const filtered = workloadForTerm(summary, "2026-Fall");
  expect(filtered.rows).toHaveLength(1);
  expect(filtered.rows[0]?.sectionCode).toBe("A");
  expect(filtered.totalHours).toBe(3);
  expect(filtered.peakWeeklyHours).toBe(3);
  expect(filtered.weeklyTotals).toEqual([
    { term: "2026-Fall", week: 1, totalContactHours: 3 },
  ]);
  expect(filtered.scheduledWeeklyHours).toBe(2);
  expect(filtered.scheduleRows).toHaveLength(1);
});
