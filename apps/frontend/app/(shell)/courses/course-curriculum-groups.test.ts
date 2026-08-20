import { describe, expect, test } from "bun:test";
import type { ProgrammeCurriculumRead } from "@dse-pms/shared-types";
import {
  buildCoursePlacementMap,
  curriculumGroupLabel,
  orderCoursesByCurriculum,
} from "./course-curriculum-groups";

const years: ProgrammeCurriculumRead["years"] = [
  {
    yearLevel: 4,
    totalCredits: 3,
    semesters: [
      {
        semester: "Second",
        totalCredits: 3,
        courses: [
          {
            placementId: "00000000-0000-4000-8000-000000000041",
            courseId: "00000000-0000-4000-8000-000000000004",
            code: "Y4S2",
            title: "Year 4 Semester 2",
            yearLevel: 4,
            semester: "Second",
            credits: 3,
            courseType: "Core",
            sortOrder: 0,
          },
        ],
      },
    ],
  },
  {
    yearLevel: 1,
    totalCredits: 9,
    semesters: [
      {
        semester: "Second",
        totalCredits: 3,
        courses: [
          {
            placementId: "00000000-0000-4000-8000-000000000012",
            courseId: "00000000-0000-4000-8000-000000000003",
            code: "Y1S2",
            title: "Year 1 Semester 2",
            yearLevel: 1,
            semester: "Second",
            credits: 3,
            courseType: "Basic",
            sortOrder: 0,
          },
        ],
      },
      {
        semester: "First",
        totalCredits: 6,
        courses: [
          {
            placementId: "00000000-0000-4000-8000-000000000011",
            courseId: "00000000-0000-4000-8000-000000000002",
            code: "Y1S1B",
            title: "Year 1 Semester 1 B",
            yearLevel: 1,
            semester: "First",
            credits: 3,
            courseType: "Basic",
            sortOrder: 2,
          },
          {
            placementId: "00000000-0000-4000-8000-000000000010",
            courseId: "00000000-0000-4000-8000-000000000001",
            code: "Y1S1A",
            title: "Year 1 Semester 1 A",
            yearLevel: 1,
            semester: "First",
            credits: 3,
            courseType: "Basic",
            sortOrder: 1,
          },
        ],
      },
    ],
  },
];

describe("course curriculum grouping", () => {
  test("orders Year 1 through Year 4, semester 1 before 2, then curriculum sort order", () => {
    const placementMap = buildCoursePlacementMap(years);
    const ordered = orderCoursesByCurriculum(
      [
        { id: "00000000-0000-4000-8000-000000000004", code: "Y4S2" },
        { id: "00000000-0000-4000-8000-000000000099", code: "UNASSIGNED" },
        { id: "00000000-0000-4000-8000-000000000003", code: "Y1S2" },
        { id: "00000000-0000-4000-8000-000000000002", code: "Y1S1B" },
        { id: "00000000-0000-4000-8000-000000000001", code: "Y1S1A" },
      ],
      placementMap,
    );

    expect(ordered.map((course) => course.code)).toEqual([
      "Y1S1A",
      "Y1S1B",
      "Y1S2",
      "Y4S2",
      "UNASSIGNED",
    ]);
  });

  test("labels curriculum groups and keeps unassigned courses visible", () => {
    const placementMap = buildCoursePlacementMap(years);

    expect(
      curriculumGroupLabel(
        placementMap.get("00000000-0000-4000-8000-000000000001") ?? null,
      ),
    ).toBe("Year 1 · Semester 1");
    expect(curriculumGroupLabel(null)).toBe("Not in current curriculum");
  });
});
