import { describe, expect, it } from "bun:test";

import { courseDocumentCloSltHours } from "./course-document-mapping";

describe("courseDocumentCloSltHours", () => {
  const weeks = [
    { cloCodes: ["CLO1"], sltHours: "6" },
    { cloCodes: ["CLO1", "CLO2"], sltHours: "4" },
    { cloCodes: ["CLO2"], sltHours: "2" },
    { cloCodes: ["CLO1"], sltHours: "" },
  ];

  it("sums Weekly Plan SLT for rows linked to the CLO", () => {
    expect(courseDocumentCloSltHours("CLO1", weeks, "99")).toBe("10");
    expect(courseDocumentCloSltHours("CLO2", weeks, "99")).toBe("6");
  });

  it("keeps the existing CLO-level SLT when linked weeks have no positive SLT", () => {
    expect(courseDocumentCloSltHours("CLO3", weeks, "12")).toBe("12");
  });

  it("does not invent an SLT value when neither source has one", () => {
    expect(courseDocumentCloSltHours("CLO3", weeks)).toBe("");
  });

  it("ignores invalid and non-positive linked SLT values", () => {
    expect(
      courseDocumentCloSltHours(
        "CLO1",
        [
          { cloCodes: ["CLO1"], sltHours: "NaN" },
          { cloCodes: ["CLO1"], sltHours: "-4" },
          { cloCodes: ["CLO1"], sltHours: "3.5" },
        ],
        "8",
      ),
    ).toBe("3.5");
  });
});
