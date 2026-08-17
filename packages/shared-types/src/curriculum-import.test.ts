import { describe, expect, test } from "bun:test";
import { DseCurriculumImportSchema } from "./curriculum-import.ts";

function baseImport() {
  return {
    formatVersion: "dse-curriculum-v1",
    programmeCode: "DSE",
    curriculum: {
      code: "DSE-2026",
      name: "Bachelor of Engineering in Data Science and Engineering (Honors Program)",
      academicYear: "2026",
      version: "1.0",
      defaultPathwayCode: "COURSEWORK",
    },
    pathways: [
      {
        code: "COURSEWORK",
        name: "Option 1",
        yearLevel: 4,
        semester: "Second",
        isDefault: true,
        creditTarget: 18,
        sortOrder: 0,
      },
      {
        code: "RESEARCH",
        name: "Option 2",
        yearLevel: 4,
        semester: "Second",
        isDefault: false,
        creditTarget: 18,
        sortOrder: 1,
      },
    ],
    courses: [
      {
        code: "PAN202",
        title: "Predictive Analytics",
        yearLevel: 2,
        semester: "Second",
        pathwayCode: null,
        sortOrder: 0,
        weeklyHours: { total: 4, lecture: 2, lab: 2, fieldVisit: 0 },
        credits: { total: 3, lecture: 2, lab: 1, fieldVisit: 0, breakdownProvided: true },
        lecturerText: "Mr. Chim Seyha",
      },
      {
        code: "FTE402",
        title: "Financial Technology",
        yearLevel: 4,
        semester: "Second",
        pathwayCode: "COURSEWORK",
        sortOrder: 0,
        weeklyHours: { total: 3, lecture: 3, lab: 0, fieldVisit: 0 },
        credits: { total: 3, lecture: 3, lab: 0, fieldVisit: 0, breakdownProvided: true },
        lecturerText: "Mr. Ky Soklay",
      },
      {
        code: "THE402",
        title: "Thesis",
        yearLevel: 4,
        semester: "Second",
        pathwayCode: "RESEARCH",
        sortOrder: 0,
        weeklyHours: null,
        credits: { total: 18, lecture: 0, lab: 0, fieldVisit: 0, breakdownProvided: false },
        lecturerText: "",
      },
    ],
  } as const;
}

describe("dse curriculum JSON import contract", () => {
  test("accepts common, coursework, and research rows", () => {
    const result = DseCurriculumImportSchema.safeParse(baseImport());
    expect(result.success).toBe(true);
  });

  test("rejects an unknown format version", () => {
    const input = { ...baseImport(), formatVersion: "legacy-v0" };
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(false);
  });

  test("accepts a thesis with no weekly-hour or credit-breakdown source", () => {
    const parsed = DseCurriculumImportSchema.parse(baseImport());
    const thesis = parsed.courses.find((course) => course.code === "THE402");
    expect(thesis?.weeklyHours).toBeNull();
    expect(thesis?.credits.breakdownProvided).toBe(false);
    expect(thesis?.credits.total).toBe(18);
  });

  test("preserves a source credit-breakdown mismatch for review", () => {
    const input = structuredClone(baseImport());
    input.courses[0]!.credits = {
      total: 3,
      lecture: 3,
      lab: 1,
      fieldVisit: 0,
      breakdownProvided: true,
    };
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(true);
  });

  test("rejects duplicate pathway codes", () => {
    const input = structuredClone(baseImport());
    input.pathways.push({ ...input.pathways[0]!, name: "Duplicate" });
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(false);
  });

  test("rejects conflicting default pathway declarations", () => {
    const input = structuredClone(baseImport());
    input.curriculum.defaultPathwayCode = "RESEARCH";
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(false);
  });

  test("rejects an unknown course pathway", () => {
    const input = structuredClone(baseImport());
    input.courses[0]!.pathwayCode = "UNKNOWN";
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(false);
  });

  test("rejects duplicate course placement inside the same scope", () => {
    const input = structuredClone(baseImport());
    input.courses.push(structuredClone(input.courses[0]!));
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(false);
  });
});
