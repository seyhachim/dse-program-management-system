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
      building: "STEM Building",
      room: "A203",
      activityType: "Lecture",
      lecturerIds: [LECTURER_ID],
    },
  ];
  const classB = assignment("B");
  classB.meetings = [
    {
      id: "meeting-b",
      dayOfWeek: "Tuesday",
      startTime: "13:00",
      endTime: "14:30",
      building: "Engineering Building",
      room: "B105",
      activityType: "Practice",
      lecturerIds: [LECTURER_ID],
    },
  ];

  const result = summarizeLecturerWorkload(LECTURER_ID, [classA, classB]);
  expect(result.scheduledWeeklyHours).toBe(3.5);
  expect(result.scheduleRows.map((row) => row.durationHours)).toEqual([2, 1.5]);
  expect(result.scheduleRows.map((row) => row.building)).toEqual(["STEM Building", "Engineering Building"]);
  expect(result.scheduleRows.map((row) => row.room)).toEqual(["A203", "B105"]);
});

test("co-lecturers count at full workload and are labelled explicitly", () => {
  const result = summarizeLecturerWorkload(LECTURER_ID, [
    assignment("A", "22222222-2222-2222-2222-222222222222"),
  ]);

  expect(result.totalHours).toBe(3);
  expect(result.coLecturerAssumption).toBe("meeting-assignment");
  expect(result.rows[0]?.role).toBe("Co-Lecturer");
});


test("split teaching schedules include only meetings explicitly assigned to the lecturer", () => {
  const split = assignment("M1", "22222222-2222-2222-2222-222222222222");
  split.meetings = [
    {
      id: "meeting-monday",
      dayOfWeek: "Monday",
      startTime: "08:00",
      endTime: "10:00",
      building: "STEM Building",
      room: "101",
      activityType: "Lecture",
      lecturerIds: [LECTURER_ID],
    },
    {
      id: "meeting-thursday",
      dayOfWeek: "Thursday",
      startTime: "08:00",
      endTime: "11:00",
      building: "STEM Building",
      room: "101",
      activityType: "Lecture",
      lecturerIds: ["22222222-2222-2222-2222-222222222222"],
    },
  ];

  const result = summarizeLecturerWorkload(LECTURER_ID, [split]);
  expect(result.scheduleRows.map((row) => row.meetingId)).toEqual(["meeting-monday"]);
  expect(result.scheduledWeeklyHours).toBe(2);
});

test("co-taught meetings appear for every explicitly assigned lecturer", () => {
  const coTaught = assignment("M1", "22222222-2222-2222-2222-222222222222");
  coTaught.meetings = [{
    id: "meeting-co-taught",
    dayOfWeek: "Wednesday",
    startTime: "13:00",
    endTime: "15:00",
    building: "STEM Building",
    room: "201",
    activityType: "Lab",
    lecturerIds: [LECTURER_ID, "22222222-2222-2222-2222-222222222222"],
  }];

  const result = summarizeLecturerWorkload(LECTURER_ID, [coTaught]);
  expect(result.scheduleRows.map((row) => row.meetingId)).toEqual(["meeting-co-taught"]);
  expect(result.scheduledWeeklyHours).toBe(2);
});

test("legacy unallocated meetings do not fabricate lecturer ownership", () => {
  const unallocated = assignment("M1");
  unallocated.meetings = [{
    id: "meeting-unallocated",
    dayOfWeek: "Friday",
    startTime: "09:00",
    endTime: "12:00",
    building: "STEM Building",
    room: "301",
    activityType: "Lecture",
    lecturerIds: [],
  }];

  const result = summarizeLecturerWorkload(LECTURER_ID, [unallocated]);
  expect(result.scheduleRows).toEqual([]);
  expect(result.scheduledWeeklyHours).toBe(0);
});
