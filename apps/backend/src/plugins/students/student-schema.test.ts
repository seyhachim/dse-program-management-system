import { describe, expect, test } from "bun:test";
import { CreateStudentInput, UpdateStudentInput } from "@dse-pms/shared-types";

describe("student roster schema", () => {
  test("allows an active provisional student without an official student ID", () => {
    const parsed = CreateStudentInput.parse({
      name: "Provisional Student",
      email: "provisional@rupp.edu.kh",
      studentId: "",
      status: "Active",
    });
    expect(parsed.studentId).toBeNull();
    expect(parsed.status).toBe("Active");
    expect(parsed.category).toBe("Regular");
    expect(parsed.email).toBe("provisional@rupp.edu.kh");
  });

  test("requires institutional email while the official student ID is pending", () => {
    expect(() =>
      CreateStudentInput.parse({
        name: "Missing Email",
        email: null,
        studentId: null,
        status: "Active",
      }),
    ).toThrow();
  });

  test("accepts scholarship category for an active provisional student", () => {
    const parsed = CreateStudentInput.parse({
      name: "Scholarship Student",
      email: "scholarship@rupp.edu.kh",
      studentId: null,
      category: "Scholarship",
      status: "Active",
    });
    expect(parsed.studentId).toBeNull();
    expect(parsed.category).toBe("Scholarship");
    expect(parsed.status).toBe("Active");
  });

  test("fills the official ID later on the same record", () => {
    expect(UpdateStudentInput.parse({ studentId: "  202512345  " }).studentId).toBe("202512345");
    expect(UpdateStudentInput.parse({ studentId: "" }).studentId).toBeNull();
  });
});
