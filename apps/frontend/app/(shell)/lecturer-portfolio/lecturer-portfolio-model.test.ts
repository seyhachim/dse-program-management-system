import { expect, test } from "bun:test";
import type { OfferingView } from "@dse-pms/shared-types";
import {
  buildLecturerTeachingRows,
  currentLecturerTeachingRows,
  uniqueTeachingCourseCount,
} from "./lecturer-portfolio-model";

const lecturerId = "11111111-1111-4111-8111-111111111111";
const otherLecturerId = "22222222-2222-4222-8222-222222222222";

function offering(
  id: string,
  courseId: string,
  code: string,
  status: OfferingView["status"],
  role: "primary" | "co" | "unassigned",
): OfferingView {
  return {
    id,
    term: "2026",
    sectionCode: "A",
    status,
    capacity: 30,
    enrolledCount: 20,
    createdAt: "2026-08-01T00:00:00.000Z",
    semester: "First",
    programmeYear: 3,
    academicCalendarPeriodId: null,
    academicCalendar: null,
    startDate: "2026-08-01",
    endDate: "2026-12-01",
    otherLecturers: null,
    meetings: [],
    course: { id: courseId, code, title: `${code} title`, programmeId: "dse" },
    courseSpec: null,
    lecturer: role === "primary"
      ? { id: lecturerId, name: "Lecturer", email: "lecturer@example.edu", title: null, qualification: null, phone: null }
      : { id: otherLecturerId, name: "Other", email: "other@example.edu", title: null, qualification: null, phone: null },
    coLecturers: role === "co"
      ? [{ id: lecturerId, name: "Lecturer", email: "lecturer@example.edu", honorific: null, title: null, qualification: null, phone: null }]
      : [],
    students: [],
  };
}

test("portfolio teaching projection includes only canonical primary/co assignments", () => {
  const rows = buildLecturerTeachingRows([
    offering("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", "TSA301", "Active", "primary"),
    offering("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb", "AAI302", "Planned", "co"),
    offering("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "cccccccc-1111-4111-8111-cccccccccccc", "DMI301", "Active", "unassigned"),
  ], lecturerId);

  expect(rows.map((row) => [row.offering.course?.code, row.role])).toEqual([
    ["AAI302", "Co-Lecturer"],
    ["TSA301", "Primary Lecturer"],
  ]);
});

test("current teaching excludes completed history and counts unique courses", () => {
  const rows = buildLecturerTeachingRows([
    offering("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", "TSA301", "Active", "primary"),
    offering("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", "TSA301", "Planned", "primary"),
    offering("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "cccccccc-1111-4111-8111-cccccccccccc", "PAN202", "Completed", "primary"),
  ], lecturerId);

  const current = currentLecturerTeachingRows(rows);
  expect(current).toHaveLength(2);
  expect(uniqueTeachingCourseCount(current)).toBe(1);
  expect(rows).toHaveLength(3);
});
