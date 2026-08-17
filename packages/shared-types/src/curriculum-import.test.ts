import { describe, expect, test } from "bun:test";
import {
  CurriculumImportApplyInputSchema,
  DseCurriculumImportSchema,
} from "./curriculum-import.ts";

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
  };
}

describe("dse curriculum JSON import contract", () => {
  test("accepts common, coursework, and research rows", () => {
    const result = DseCurriculumImportSchema.safeParse(baseImport());
    expect(result.success).toBe(true);
  });

  test("accepts official declared totals separately from row arithmetic", () => {
    const input = structuredClone(baseImport());
    Object.assign(input, {
      declaredTotals: {
        semesterCredits: [{ yearLevel: 1, semester: "First", credits: 18 }],
        pathwayCredits: [
          { pathwayCode: "COURSEWORK", credits: 18 },
          { pathwayCode: "RESEARCH", credits: 18 },
        ],
        programmeCourseCount: 48,
        programmeCredits: 143,
      },
    });
    const parsed = DseCurriculumImportSchema.parse(input);
    expect(parsed.declaredTotals?.programmeCredits).toBe(143);
    expect(parsed.declaredTotals?.programmeCourseCount).toBe(48);
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

  test("rejects the same canonical course code across different pathways", () => {
    const input = structuredClone(baseImport());
    input.courses.push({
      ...structuredClone(input.courses[1]!),
      pathwayCode: "RESEARCH",
      sortOrder: 1,
    });
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(false);
  });

  test("rejects duplicate and unknown declared totals", () => {
    const input = {
      ...structuredClone(baseImport()),
      declaredTotals: {
        semesterCredits: [
          { yearLevel: 1, semester: "First", credits: 18 },
          { yearLevel: 1, semester: "First", credits: 19 },
        ],
        pathwayCredits: [{ pathwayCode: "UNKNOWN", credits: 18 }],
        programmeCourseCount: 48,
        programmeCredits: 143,
      },
    };
    expect(DseCurriculumImportSchema.safeParse(input).success).toBe(false);
  });

  test("create-course decision requires explicit course type", () => {
    const upload = {
      fileName: "curriculum.json",
      jsonText: JSON.stringify(baseImport()),
    };
    expect(
      CurriculumImportApplyInputSchema.safeParse({
        ...upload,
        decisions: [{ courseCode: "NEW101", action: "create-course" }],
      }).success,
    ).toBe(false);
    expect(
      CurriculumImportApplyInputSchema.safeParse({
        ...upload,
        decisions: [
          { courseCode: "NEW101", action: "create-course", courseType: "Core" },
        ],
      }).success,
    ).toBe(true);
  });

  test("rejects duplicate import decisions for one code", () => {
    const upload = {
      fileName: "curriculum.json",
      jsonText: JSON.stringify(baseImport()),
      decisions: [
        { courseCode: "ABC101", action: "keep-existing-course" },
        { courseCode: "ABC101", action: "keep-existing-course" },
      ],
    };
    expect(CurriculumImportApplyInputSchema.safeParse(upload).success).toBe(false);
  });
});
