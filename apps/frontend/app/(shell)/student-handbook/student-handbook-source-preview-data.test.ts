import { describe, expect, test } from "bun:test";
import {
  isEmptyStudentHandbookSourceValue,
  safeStudentHandbookSourceUrl,
  studentHandbookSourceEntries,
  studentHandbookSourceFieldLabel,
  studentHandbookSourceValueKind,
} from "./student-handbook-source-preview-data";

describe("Student Handbook source preview data", () => {
  test("uses readable labels for known and camel-case fields", () => {
    expect(studentHandbookSourceFieldLabel("programmeName")).toBe("Programme name");
    expect(studentHandbookSourceFieldLabel("publishedCourseCount")).toBe("Published Course Count");
  });

  test("omits null and empty values from readable source entries", () => {
    const entries = studentHandbookSourceEntries({
      programmeName: "DSE",
      facebookUrl: null,
      mapUrl: "",
      tags: [],
      totals: {},
      credits: 143,
    });

    expect(entries).toEqual([
      ["programmeName", "DSE"],
      ["credits", 143],
    ]);
    expect(isEmptyStudentHandbookSourceValue(false)).toBe(false);
    expect(isEmptyStudentHandbookSourceValue(0)).toBe(false);
  });

  test("classifies common source values without trusting unsafe URL schemes", () => {
    expect(studentHandbookSourceValueKind("admissionEmail", "fe.info@rupp.edu.kh")).toBe("email");
    expect(studentHandbookSourceValueKind("phone", "+855 93 222 380")).toBe("phone");
    expect(studentHandbookSourceValueKind("websiteUrl", "https://www.rupp.edu.kh/")).toBe("url");
    expect(studentHandbookSourceValueKind("websiteUrl", "javascript:alert(1)")).toBe("text");
    expect(safeStudentHandbookSourceUrl("https://www.rupp.edu.kh/")).toContain("https://www.rupp.edu.kh/");
    expect(safeStudentHandbookSourceUrl("javascript:alert(1)")).toBeNull();
  });
});
