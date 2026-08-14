import { expect, test } from "bun:test";
import {
  summarizeLecturerWorkload,
  type WorkloadAssignment,
} from "./workload.ts";

const LECTURER_ID = "11111111-1111-1111-1111-111111111111";

function assignment(
  sectionCode: string,
  lecturerId: string | null = LECTURER_ID,
): WorkloadAssignment {
  return {
    id: `offering-${sectionCode}`,
    lecturerId,
    term: "2026-Fall",
    sectionCode,
    course: {
      id: "33333333-3333-3333-3333-333333333333",
      code: "DSE301",
      title: "Data Engineering",
      lecturerId: null,
      programmeId: "dse",
    },
    weeks: [
      {
        week: 1,
        lectureHours: 2,
        tutorialHours: 1,
        practiceHours: 0,
        otherHours: 0,
        totalContactHours: 3,
      },
    ],
    meetings: [],
  };
}

test("two classes multiply the same course contact hours", () => {
  const result = summarizeLecturerWorkload(LECTURER_ID, [
    assignment("A"),
    assignment("B"),
  ]);

  expect(result.totalHours).toBe(6);
  expect(result.peakWeeklyHours).toBe(6);
  expect(result.weeklyTotals).toEqual([
    { term: "2026-Fall", week: 1, totalContactHours: 6 },
  ]);
  expect(result.rows.map((row) => row.sectionCode)).toEqual(["A", "B"]);
  expect(result.rows.every((row) => row.totalContactHours === 3)).toBe(true);
});

test("scheduled weekly workload is calculated from class meeting duration", () => {
  const classA = assignment("A");
  classA.meetings = [
    {
      id: "meeting-a",
      dayOfWeek: "Monday",
      startTime: "08:00",
      endTime: "10:00",
      room: "A203",
      activityType: "Lecture",
    },
  ];
  const classB = assignment("B");
  classB.meetings = [
    {
      id: "meeting-b",
      dayOfWeek: "Tuesday",
      startTime: "13:00",
      endTime: "14:30",
      room: "B105",
      activityType: "Practice",
    },
  ];

  const result = summarizeLecturerWorkload(LECTURER_ID, [classA, classB]);
  expect(result.scheduledWeeklyHours).toBe(3.5);
  expect(result.scheduleRows.map((row) => row.durationHours)).toEqual([2, 1.5]);
  expect(result.scheduleRows.map((row) => row.room)).toEqual(["A203", "B105"]);
});

test("co-lecturers count at full workload and are labelled explicitly", () => {
  const result = summarizeLecturerWorkload(LECTURER_ID, [
    assignment("A", "22222222-2222-2222-2222-222222222222"),
  ]);

  expect(result.totalHours).toBe(3);
  expect(result.coLecturerAssumption).toBe("full");
  expect(result.rows[0]?.role).toBe("Co-Lecturer");
});
