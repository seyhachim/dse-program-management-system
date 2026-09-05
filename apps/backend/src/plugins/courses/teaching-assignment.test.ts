import { expect, test } from "bun:test";
import {
  buildTeachingAssignmentWhere,
  courseInfoFromTeachingAssignment,
} from "./teaching-assignment.ts";

const COURSE_ID = "33333333-3333-3333-3333-333333333333";
const PRIMARY_ID = "11111111-1111-1111-1111-111111111111";
const CO_LECTURER_ID = "22222222-2222-2222-2222-222222222222";

function offering(overrides: Record<string, unknown> = {}) {
  return {
    semester: "First" as const,
    programmeYear: 3,
    ...overrides,
  };
}

test("primary lecturer scope matches the primary or normalized co-lecturer assignment", () => {
  expect(buildTeachingAssignmentWhere(COURSE_ID, PRIMARY_ID)).toEqual({
    courseId: COURSE_ID,
    OR: [
      { lecturerId: PRIMARY_ID },
      { coLecturers: { some: { lecturerId: PRIMARY_ID } } },
    ],
  });
});

test("co-lecturer scope uses the same offering assignment filter", () => {
  expect(buildTeachingAssignmentWhere(COURSE_ID, CO_LECTURER_ID)).toEqual({
    courseId: COURSE_ID,
    OR: [
      { lecturerId: CO_LECTURER_ID },
      { coLecturers: { some: { lecturerId: CO_LECTURER_ID } } },
    ],
  });
});

test("programme-wide callers resolve the course offering without lecturer scope", () => {
  expect(buildTeachingAssignmentWhere(COURSE_ID)).toEqual({ courseId: COURSE_ID });
});

test("Offering contributes only semester and programme year to Course Information", () => {
  expect(courseInfoFromTeachingAssignment(offering())).toEqual({
    semester: "First",
    programmeYear: 3,
  });
});

test("Offering delivery context cannot overwrite the Course Specification team snapshot", () => {
  const courseTeamSnapshot = {
    instructorName: "Phat Phanna",
    qualification: "PhD",
    email: "phat.phanna@rupp.edu.kh",
    telephone: "",
    otherLecturers: "Chim Seyha",
  };

  const assembled = {
    ...courseTeamSnapshot,
    ...courseInfoFromTeachingAssignment(offering()),
  };

  expect(assembled).toEqual({
    ...courseTeamSnapshot,
    semester: "First",
    programmeYear: 3,
  });
});
