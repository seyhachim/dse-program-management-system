import { expect, test } from "bun:test";
import { coLecturerViolation, CreateCourseInput, UpdateCourseInput } from "./courses.ts";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

test("coLecturerViolation is null when unset or empty", () => {
  expect(coLecturerViolation({})).toBeNull();
  expect(coLecturerViolation({ coLecturerIds: [] })).toBeNull();
  expect(coLecturerViolation({ lecturerId: A, coLecturerIds: [] })).toBeNull();
});

test("coLecturerViolation is null for distinct co-lecturers that aren't the primary", () => {
  expect(coLecturerViolation({ lecturerId: A, coLecturerIds: [B] })).toBeNull();
  expect(coLecturerViolation({ coLecturerIds: [A, B] })).toBeNull();
});

test("coLecturerViolation flags duplicates", () => {
  expect(coLecturerViolation({ coLecturerIds: [A, A] })).toBe("duplicate");
});

test("coLecturerViolation flags the primary lecturer also listed as a co-lecturer", () => {
  expect(coLecturerViolation({ lecturerId: A, coLecturerIds: [A, B] })).toBe("primaryIsCoLecturer");
});

test("CreateCourseInput rejects duplicate co-lecturers", () => {
  const result = CreateCourseInput.safeParse({ code: "CS101", title: "Intro", coLecturerIds: [A, A] });
  expect(result.success).toBe(false);
});

test("CreateCourseInput rejects the primary lecturer listed as a co-lecturer", () => {
  const result = CreateCourseInput.safeParse({
    code: "CS101",
    title: "Intro",
    lecturerId: A,
    coLecturerIds: [A],
  });
  expect(result.success).toBe(false);
});

test("CreateCourseInput accepts a valid co-lecturer assignment", () => {
  const result = CreateCourseInput.safeParse({
    code: "CS101",
    title: "Intro",
    lecturerId: A,
    coLecturerIds: [B],
  });
  expect(result.success).toBe(true);
});

test("UpdateCourseInput applies the same invariant on a partial patch", () => {
  expect(UpdateCourseInput.safeParse({ lecturerId: A, coLecturerIds: [A] }).success).toBe(false);
  expect(UpdateCourseInput.safeParse({ coLecturerIds: [B] }).success).toBe(true);
  expect(UpdateCourseInput.safeParse({}).success).toBe(true);
});
