import { describe, expect, test } from "bun:test";
import {
  CreateCourseSpecRevisionRequestSchema,
  recommendedCourseSpecRevisionType,
  type CourseSpecRevisionImpact,
} from "./course-spec-revision.ts";

const none: CourseSpecRevisionImpact = {
  courseCodeOrTitle: false,
  creditsOrSlt: false,
  prerequisites: false,
  materialCloChanges: false,
  bloomOrCapLevels: false,
  cloPloAlignment: false,
  assessmentStructureOrWeighting: false,
  curriculumOrRegulatoryAlignment: false,
};

const base = {
  triggers: ["ProgrammeCoordinator"] as const,
  evidenceSummary: "Programme review evidence supports an academic revision.",
  changeSummary: "Clarify teaching sequence without changing academic outcomes.",
  impact: none,
  proposedRevisionType: "Minor" as const,
  effectiveAcademicTerm: "2027-2028 Semester I",
  overrideJustification: "",
};

describe("CourseSpec revision impact contract", () => {
  test("no major impact recommends Minor", () => {
    expect(recommendedCourseSpecRevisionType(none)).toBe("Minor");
  });

  test.each(Object.keys(none) as (keyof CourseSpecRevisionImpact)[])(
    "%s recommends Major",
    (field) => {
      expect(
        recommendedCourseSpecRevisionType({ ...none, [field]: true }),
      ).toBe("Major");
    },
  );

  test("accepts a Minor request when no major impact is selected", () => {
    expect(CreateCourseSpecRevisionRequestSchema.safeParse(base).success).toBe(true);
  });

  test("requires written justification for Minor override of Major recommendation", () => {
    const result = CreateCourseSpecRevisionRequestSchema.safeParse({
      ...base,
      impact: { ...none, materialCloChanges: true },
      proposedRevisionType: "Minor",
      overrideJustification: "too short",
    });
    expect(result.success).toBe(false);
  });

  test("accepts an authorized-intent override payload when justification is substantive", () => {
    const result = CreateCourseSpecRevisionRequestSchema.safeParse({
      ...base,
      impact: { ...none, materialCloChanges: true },
      proposedRevisionType: "Minor",
      overrideJustification:
        "The CLO wording is materially clarified, but scope and programme alignment remain unchanged.",
    });
    expect(result.success).toBe(true);
  });
});
