import { describe, expect, test } from "bun:test";
import type { CurriculumPathway } from "@dse-pms/shared-types";
import { pathwaysForSemester } from "./curriculum-pathway-view";

const pathway = (
  id: string,
  code: string,
  name: string,
  sortOrder: number,
  isDefault = false,
): CurriculumPathway => ({
  id,
  code,
  name,
  yearLevel: 4,
  semester: "Second",
  isDefault,
  creditTarget: 15,
  sortOrder,
  courses: [],
  totalCredits: 15,
});

describe("curriculum completion pathway view", () => {
  test("groups and orders the three Year 4 Semester 2 completion routes", () => {
    const pathways: CurriculumPathway[] = [
      pathway("00000000-0000-4000-8000-000000000003", "INDUSTRY", "Industrial Internship", 2),
      pathway("00000000-0000-4000-8000-000000000001", "COURSEWORK", "Coursework", 0, true),
      pathway("00000000-0000-4000-8000-000000000002", "RESEARCH", "Research / Thesis", 1),
      {
        ...pathway("00000000-0000-4000-8000-000000000004", "OTHER", "Other", 0),
        yearLevel: 3,
      },
    ];

    const result = pathwaysForSemester(pathways, 4, "Second");

    expect(result.map((item) => item.code)).toEqual([
      "COURSEWORK",
      "RESEARCH",
      "INDUSTRY",
    ]);
    expect(result.filter((item) => item.isDefault).map((item) => item.code)).toEqual([
      "COURSEWORK",
    ]);
    expect(result.every((item) => item.creditTarget === 15)).toBe(true);
  });
});
