import { expect, test } from "bun:test";
import type { OfferingView } from "@dse-pms/shared-types";
import {
  invalidMeetingLecturerId,
  scopeOfferingMeetingsForLecturer,
} from "./service.ts";

const LECTURER_A = "11111111-1111-4111-8111-111111111111";
const LECTURER_B = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

function offering(): OfferingView {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    term: "2026-2027-S1",
    sectionCode: "M1",
    status: "Active",
    capacity: 45,
    enrolledCount: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    semester: "First",
    programmeYear: 3,
    academicCalendarPeriodId: "55555555-5555-4555-8555-555555555555",
    academicCalendar: null,
    startDate: "2026-09-14",
    endDate: "2027-01-16",
    otherLecturers: null,
    meetings: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        dayOfWeek: "Monday",
        startTime: "08:00",
        endTime: "10:00",
        building: "STEM Building",
        room: "101",
        activityType: "Lecture",
        lecturerIds: [LECTURER_A],
        lecturers: [],
        durationHours: 2,
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        dayOfWeek: "Thursday",
        startTime: "08:00",
        endTime: "11:00",
        building: "STEM Building",
        room: "101",
        activityType: "Lecture",
        lecturerIds: [LECTURER_B],
        lecturers: [],
        durationHours: 3,
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        dayOfWeek: "Saturday",
        startTime: "08:00",
        endTime: "10:00",
        building: "STEM Building",
        room: "101",
        activityType: "Lab",
        lecturerIds: [],
        lecturers: [],
        durationHours: 2,
      },
    ],
    course: {
      id: "99999999-9999-4999-8999-999999999999",
      code: "DSE301",
      title: "Data Engineering",
      programmeId: "dse",
    },
    courseSpec: null,
    lecturer: {
      id: LECTURER_A,
      name: "Lecturer A",
      email: "a@example.test",
      title: null,
      qualification: null,
      phone: null,
    },
    coLecturers: [],
    students: [],
  };
}

test("meeting lecturer ids must be members of the Offering teaching team", () => {
  expect(
    invalidMeetingLecturerId(
      [{ lecturerIds: [LECTURER_A] }, { lecturerIds: [LECTURER_B] }],
      [LECTURER_A, LECTURER_B],
    ),
  ).toBeNull();

  expect(
    invalidMeetingLecturerId(
      [{ lecturerIds: [LECTURER_A, OUTSIDER] }],
      [LECTURER_A, LECTURER_B],
    ),
  ).toBe(OUTSIDER);
});

test("lecturer-scoped Offering keeps course access but exposes only owned meetings", () => {
  const scoped = scopeOfferingMeetingsForLecturer(offering(), LECTURER_A);
  expect(scoped.id).toBe("44444444-4444-4444-8444-444444444444");
  expect(scoped.course?.code).toBe("DSE301");
  expect(scoped.meetings.map((meeting) => meeting.id)).toEqual([
    "66666666-6666-4666-8666-666666666666",
  ]);
});

test("unallocated meetings are not silently attributed to any lecturer", () => {
  const scoped = scopeOfferingMeetingsForLecturer(offering(), OUTSIDER);
  expect(scoped.course?.code).toBe("DSE301");
  expect(scoped.meetings).toEqual([]);
});

test("programme-wide Offering view remains complete", () => {
  const complete = scopeOfferingMeetingsForLecturer(offering(), undefined);
  expect(complete.meetings).toHaveLength(3);
});
