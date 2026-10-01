import { describe, expect, it } from "bun:test";

import {
  courseDocumentCloAssessmentSltHours,
  courseDocumentCloLearningSltHours,
  courseDocumentCloSltHours,
  formatCourseDocumentSltHours,
} from "./course-document-mapping";

describe("course document CLO SLT allocation", () => {
  const weeks = [
    { cloCodes: ["CLO1"], sltHours: "6" },
    { cloCodes: ["CLO1", "CLO2"], sltHours: "4" },
    { cloCodes: ["CLO2"], sltHours: "2" },
    { cloCodes: ["CLO1"], sltHours: "" },
  ];
  const assessments = [
    { cloCodes: ["CLO1"], totalSltHours: 4 },
    { cloCodes: ["CLO1", "CLO2"], totalSltHours: 6 },
    { cloCodes: ["CLO2"], totalSltHours: 2 },
  ];

  it("allocates shared Weekly Plan SLT without double counting", () => {
    expect(courseDocumentCloLearningSltHours("CLO1", weeks)).toBe(8);
    expect(courseDocumentCloLearningSltHours("CLO2", weeks)).toBe(4);
  });

  it("allocates persisted assessment SLT across mapped CLOs", () => {
    expect(courseDocumentCloAssessmentSltHours("CLO1", assessments)).toBe(7);
    expect(courseDocumentCloAssessmentSltHours("CLO2", assessments)).toBe(5);
  });

  it("combines learning and assessment SLT", () => {
    expect(courseDocumentCloSltHours("CLO1", weeks, assessments, "99")).toBe(
      "15",
    );
    expect(courseDocumentCloSltHours("CLO2", weeks, assessments, "99")).toBe(
      "9",
    );
  });

  it("keeps the existing CLO-level SLT only when current sources have none", () => {
    expect(courseDocumentCloSltHours("CLO3", weeks, assessments, "12")).toBe(
      "12",
    );
  });

  it("does not invent an SLT value when no source has one", () => {
    expect(courseDocumentCloSltHours("CLO3", weeks, assessments)).toBe("");
  });

  it("ignores invalid and non-positive SLT values", () => {
    expect(
      courseDocumentCloSltHours(
        "CLO1",
        [
          { cloCodes: ["CLO1"], sltHours: "NaN" },
          { cloCodes: ["CLO1"], sltHours: "-4" },
          { cloCodes: ["CLO1"], sltHours: "3.5" },
        ],
        [
          { cloCodes: ["CLO1"], totalSltHours: -5 },
          { cloCodes: ["CLO1"], totalSltHours: 2.5 },
        ],
        "8",
      ),
    ).toBe("6");
  });
  it("formats official SLT hours without floating-point noise", () => {
    expect(formatCourseDocumentSltHours("41.666666666666664")).toBe("41.67");
    expect(formatCourseDocumentSltHours("37.833333333333336")).toBe("37.83");
    expect(formatCourseDocumentSltHours("22.666666666666668")).toBe("22.67");
    expect(formatCourseDocumentSltHours("9.333333333333332")).toBe("9.33");
    expect(formatCourseDocumentSltHours("10")).toBe("10");
    expect(formatCourseDocumentSltHours("10.5")).toBe("10.5");
    expect(formatCourseDocumentSltHours("")).toBe("");
  });

});
