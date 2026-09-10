import { describe, expect, test } from "bun:test";
import {
  CreateStudentInput,
  StudentFundingCategorySchema,
  UpdateStudentInput,
} from "@dse-pms/shared-types";
import { STUDENT_LIST_SELECT } from "./service.ts";

describe("student funding category contract", () => {
  test("accepts the two university funding categories and explicit unknown", () => {
    expect(StudentFundingCategorySchema.parse("SCHOLARSHIP")).toBe("SCHOLARSHIP");
    expect(StudentFundingCategorySchema.parse("FEE_PAYING")).toBe("FEE_PAYING");

    const base = {
      name: "Year One Student",
      email: null,
      studentId: "FDY-0001",
      status: "Active" as const,
    };

    expect(CreateStudentInput.parse({ ...base, fundingCategory: null }).fundingCategory).toBeNull();
    expect(
      CreateStudentInput.parse({ ...base, fundingCategory: "SCHOLARSHIP" }).fundingCategory,
    ).toBe("SCHOLARSHIP");
    expect(
      UpdateStudentInput.parse({ fundingCategory: "FEE_PAYING" }).fundingCategory,
    ).toBe("FEE_PAYING");
  });

  test("does not invent a funding category when the field is omitted", () => {
    const parsed = CreateStudentInput.parse({
      name: "Unclassified Student",
      email: null,
      studentId: "FDY-0002",
      status: "Active",
    });

    expect(parsed.fundingCategory).toBeUndefined();
  });

  test("rejects unsupported funding classifications", () => {
    expect(StudentFundingCategorySchema.safeParse("UNKNOWN").success).toBe(false);
    expect(UpdateStudentInput.safeParse({ fundingCategory: "OTHER" }).success).toBe(false);
  });

  test("includes funding category in the interactive roster projection", () => {
    expect(STUDENT_LIST_SELECT.fundingCategory).toBe(true);
  });
});
