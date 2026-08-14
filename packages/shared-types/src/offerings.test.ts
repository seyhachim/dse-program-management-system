import { expect, test } from "bun:test";
import {
  coLecturerViolation,
  CreateOfferingInput,
  OfferingMeetingInput,
  SectionCodeSchema,
  UpdateOfferingInput,
} from "./offerings.ts";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const COURSE = "33333333-3333-3333-3333-333333333333";

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

test("CreateOfferingInput rejects duplicate co-lecturers", () => {
  const result = CreateOfferingInput.safeParse({
    courseId: COURSE,
    term: "2025-Fall",
    coLecturerIds: [A, A],
  });
  expect(result.success).toBe(false);
});

test("CreateOfferingInput rejects the primary lecturer listed as a co-lecturer", () => {
  const result = CreateOfferingInput.safeParse({
    courseId: COURSE,
    term: "2025-Fall",
    lecturerId: A,
    coLecturerIds: [A],
  });
  expect(result.success).toBe(false);
});

test("CreateOfferingInput accepts a valid co-lecturer assignment", () => {
  const result = CreateOfferingInput.safeParse({
    courseId: COURSE,
    term: "2025-Fall",
    lecturerId: A,
    coLecturerIds: [B],
  });
  expect(result.success).toBe(true);
});

test("UpdateOfferingInput applies the same invariant on a partial patch", () => {
  expect(UpdateOfferingInput.safeParse({ lecturerId: A, coLecturerIds: [A] }).success).toBe(false);
  expect(UpdateOfferingInput.safeParse({ coLecturerIds: [B] }).success).toBe(true);
  expect(UpdateOfferingInput.safeParse({}).success).toBe(true);
});

test("class section defaults to A for backward-compatible create requests", () => {
  const parsed = CreateOfferingInput.parse({ courseId: COURSE, term: "2026-Fall" });
  expect(parsed.sectionCode).toBe("A");
});

test("class section is trimmed and normalized to uppercase", () => {
  expect(SectionCodeSchema.parse(" b-2 ")).toBe("B-2");
});

test("class section rejects spaces and punctuation", () => {
  expect(SectionCodeSchema.safeParse("Class B").success).toBe(false);
  expect(SectionCodeSchema.safeParse("B!").success).toBe(false);
});

test("meeting validation accepts room/time and derives no user-entered duration", () => {
  const meeting = OfferingMeetingInput.parse({
    dayOfWeek: "Monday",
    startTime: "08:00",
    endTime: "10:30",
    room: "A203",
    activityType: "Lecture",
  });
  expect(meeting.room).toBe("A203");
  expect("duration" in meeting).toBe(false);
});

test("meeting validation rejects invalid and reversed times", () => {
  expect(OfferingMeetingInput.safeParse({
    dayOfWeek: "Monday",
    startTime: "10:00",
    endTime: "09:00",
    activityType: "Lecture",
  }).success).toBe(false);
  expect(OfferingMeetingInput.safeParse({
    dayOfWeek: "Monday",
    startTime: "8am",
    endTime: "10:00",
    activityType: "Lecture",
  }).success).toBe(false);
});
