import { describe, expect, test } from "bun:test";
import type { OfferingView, StudentCohortSectionMemberView } from "@dse-pms/shared-types";
import {
  activeSectionMembers,
  eligibleOfferingsForSectionResponsibility,
} from "./section-class-leadership";

function offering(
  id: string,
  sectionCode: string,
  status: OfferingView["status"],
  studentIds: string[],
): OfferingView {
  return {
    id,
    term: "2026-S1",
    sectionCode,
    status,
    capacity: 40,
    enrolledCount: studentIds.length,
    createdAt: "2026-09-01T00:00:00.000Z",
    semester: "First",
    programmeYear: 3,
    academicCalendarPeriodId: null,
    academicCalendar: null,
    startDate: null,
    endDate: null,
    otherLecturers: null,
    meetings: [],
    course: null,
    courseSpec: null,
    lecturer: null,
    coLecturers: [],
    students: studentIds.map((studentId) => ({ id: studentId, name: studentId, studentId })),
  };
}

test("selects only active matching-section offerings where the student is enrolled", () => {
  const rows = [
    offering("a", "M2", "Active", ["student-a"]),
    offering("b", "M2", "Planned", ["student-a"]),
    offering("c", "M1", "Active", ["student-a"]),
    offering("d", "m2", "Active", ["student-b"]),
  ];
  expect(eligibleOfferingsForSectionResponsibility(rows, "M2", "student-a").map((row) => row.id)).toEqual(["a"]);
});

test("fails closed when no matching enrolled offering exists", () => {
  expect(eligibleOfferingsForSectionResponsibility(
    [offering("a", "M2", "Active", ["other-student"])],
    "M2",
    "student-a",
  )).toEqual([]);
});

test("lists only members currently assigned to the selected canonical section", () => {
  const members = [
    {
      studentId: "student-a",
      studentNumber: "001",
      studentName: "A",
      cohortJoinedAt: "2026-01-01",
      cohortExitedAt: null,
      currentSectionMembership: {
        id: "membership-a",
        sectionId: "section-m2",
        cohortId: "cohort",
        studentId: "student-a",
        joinedAt: "2026-01-01",
        exitedAt: null,
        note: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        section: { id: "section-m2", code: "M2", name: "M2", active: true },
      },
    },
    {
      studentId: "student-b",
      studentNumber: "002",
      studentName: "B",
      cohortJoinedAt: "2026-01-01",
      cohortExitedAt: null,
      currentSectionMembership: null,
    },
  ] satisfies StudentCohortSectionMemberView[];
  expect(activeSectionMembers(members, "section-m2").map((row) => row.studentId)).toEqual(["student-a"]);
});
