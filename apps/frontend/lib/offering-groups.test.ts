import { expect, test } from "bun:test";
import type { OfferingView } from "@dse-pms/shared-types";
import { groupOfferings } from "./offering-groups";

function offering(
  id: string,
  sectionCode: string,
  term: string,
  lecturerId: string,
): OfferingView {
  return {
    id,
    term,
    sectionCode,
    status: "Active",
    capacity: 30,
    enrolledCount: 0,
    createdAt: "2026-08-14T00:00:00.000Z",
    semester: "Second",
    programmeYear: 2,
    startDate: null,
    endDate: null,
    otherLecturers: null,
    meetings: [],
    course: {
      id: "course-pan202",
      code: "PAN202",
      title: "Predictive Analytics",
      programmeId: "dse",
    },
    lecturer: {
      id: lecturerId,
      name: lecturerId,
      email: `${lecturerId}@example.com`,
      title: null,
      qualification: null,
      phone: null,
    },
    coLecturers: [],
    students: [],
  };
}

test("groups parallel classes into one course-and-term row", () => {
  const groups = groupOfferings([
    offering("offering-b", "B", "2026", "lecturer-1"),
    offering("offering-a", "A", "2026", "lecturer-1"),
  ]);

  expect(groups).toHaveLength(1);
  expect(groups[0]?.offerings.map((row) => row.sectionCode)).toEqual(["A", "B"]);
});

test("keeps different primary lecturers inside the shared course group", () => {
  const groups = groupOfferings([
    offering("offering-a", "A", "2026", "lecturer-1"),
    offering("offering-b", "B", "2026", "lecturer-2"),
  ]);

  expect(groups).toHaveLength(1);
  expect(
    groups[0]?.offerings.map((row) => row.lecturer?.id),
  ).toEqual(["lecturer-1", "lecturer-2"]);
});

test("does not combine the same course across different terms", () => {
  const groups = groupOfferings([
    offering("offering-a", "A", "2026", "lecturer-1"),
    offering("offering-b", "B", "2027", "lecturer-1"),
  ]);

  expect(groups).toHaveLength(2);
});
