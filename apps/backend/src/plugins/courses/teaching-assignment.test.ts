import { expect, test } from "bun:test";
import {
  buildTeachingAssignmentWhere,
  courseInfoFromTeachingAssignment,
} from "./teaching-assignment.ts";

const COURSE_ID = "33333333-3333-3333-3333-333333333333";
const PRIMARY_ID = "11111111-1111-1111-1111-111111111111";
const CO_LECTURER_ID = "22222222-2222-2222-2222-222222222222";

const primaryLecturer = {
  name: "Dr. Primary Lecturer",
  qualification: "PhD in Data Science",
  email: "primary@example.edu",
  phone: "+855 12 345 678",
};

function offering(overrides: Record<string, unknown> = {}) {
  return {
    lecturer: primaryLecturer,
    coLecturers: [
      { lecturer: { name: "Co Lecturer One" } },
      { lecturer: { name: "Co Lecturer Two" } },
    ],
    otherLecturers: "Legacy Lecturer",
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

test("overview maps the primary lecturer profile and all normalized co-lecturers", () => {
  expect(courseInfoFromTeachingAssignment(offering())).toEqual({
    instructorName: "Dr. Primary Lecturer",
    qualification: "PhD in Data Science",
    email: "primary@example.edu",
    telephone: "+855 12 345 678",
    otherLecturers: "Co Lecturer One, Co Lecturer Two",
    semester: "First",
    programmeYear: 3,
  });
});

test("normalized co-lecturers take precedence over legacy free text", () => {
  const result = courseInfoFromTeachingAssignment(
    offering({
      coLecturers: [{ lecturer: { name: "Assigned Co Lecturer" } }],
      otherLecturers: "Old Free Text Lecturer",
    }),
  );

  expect(result.otherLecturers).toBe("Assigned Co Lecturer");
});

test("overview falls back to legacy otherLecturers when normalized assignments are absent", () => {
  const result = courseInfoFromTeachingAssignment(
    offering({ coLecturers: [], otherLecturers: "Legacy A, Legacy B" }),
  );

  expect(result.otherLecturers).toBe("Legacy A, Legacy B");
});

test("blank co-lecturer names are ignored", () => {
  const result = courseInfoFromTeachingAssignment(
    offering({
      coLecturers: [
        { lecturer: { name: " Co Lecturer One " } },
        { lecturer: { name: "   " } },
        { lecturer: { name: "Co Lecturer Two" } },
      ],
    }),
  );

  expect(result.otherLecturers).toBe("Co Lecturer One, Co Lecturer Two");
});
