import { describe, expect, test } from "bun:test";
import { CreateStudentInput, UpdateStudentInput } from "@dse-pms/shared-types";

describe("student roster schema", () => {
  test("allows a provisional student without an official student ID", () => {
    const parsed = CreateStudentInput.parse({
      name: "Provisional Student",
      email: "provisional@rupp.edu.kh",
      studentId: "",
      status: "Pending",
    });
    expect(parsed.studentId).toBeNull();
    expect(parsed.category).toBe("Regular");
    expect(parsed.email).toBe("provisional@rupp.edu.kh");
  });

  test("accepts scholarship category", () => {
    const parsed = CreateStudentInput.parse({
      name: "Scholarship Student",
      email: "scholarship@rupp.edu.kh",
      studentId: null,
      category: "Scholarship",
      status: "Pending",
    });
    expect(parsed.studentId).toBeNull();
    expect(parsed.category).toBe("Scholarship");
  });

  test("fills the official ID later on the same record", () => {
    expect(UpdateStudentInput.parse({ studentId: "  202512345  " }).studentId).toBe("202512345");
    expect(UpdateStudentInput.parse({ studentId: "" }).studentId).toBeNull();
  });
});
