import { describe, expect, test } from "bun:test";
import { CreateStudentInput, UpdateStudentInput } from "./students.ts";

describe("student roster contracts", () => {
  test("accepts a roster student without email and normalizes optional profile text", () => {
    expect(
      CreateStudentInput.parse({
        name: "  Seng Kimhour  ",
        studentId: "  RUPP-001  ",
        email: "   ",
        profile: {
          khmerFamilyName: "  សេង ",
          khmerGivenName: " គឹមហួរ ",
          latinFamilyName: " Seng ",
          latinGivenName: " Kimhour ",
          gender: " Male ",
        },
      }),
    ).toEqual({
      name: "Seng Kimhour",
      studentId: "RUPP-001",
      email: null,
      status: "Active",
      profile: {
        khmerFamilyName: "សេង",
        khmerGivenName: "គឹមហួរ",
        latinFamilyName: "Seng",
        latinGivenName: "Kimhour",
        gender: "Male",
      },
    });
  });

  test("normalizes an official email and rejects an invalid supplied email", () => {
    const parsed = CreateStudentInput.parse({
      name: "Student",
      studentId: "RUPP-002",
      email: "  STUDENT@EXAMPLE.EDU  ",
    });
    expect(parsed.email).toBe("student@example.edu");

    expect(() =>
      CreateStudentInput.parse({
        name: "Student",
        studentId: "RUPP-003",
        email: "not-an-email",
      }),
    ).toThrow();
  });

  test("allows clearing email/profile fields on an explicit update", () => {
    expect(
      UpdateStudentInput.parse({
        email: "",
        profile: { latinGivenName: "   " },
      }),
    ).toEqual({
      email: null,
      profile: { latinGivenName: null },
    });
  });
});
