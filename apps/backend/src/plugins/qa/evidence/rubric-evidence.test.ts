import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { matchEvidenceScope } from "../analysis/evidence-semantics.ts";
import { rubricEvidenceCandidate } from "./rubric-evidence.ts";

const definition = {
  id: "rubric-evidence-definition",
  evidenceType: "rubrics",
  sourceDomain: "assessment" as const,
};

const baseRow = {
  courseId: "course-a",
  courseCode: "DSE401",
  courseSpecId: "spec-v2",
  courseSpecReviewStatus: "Approved",
  assessmentItemId: "assessment-1",
  assessmentName: "Capstone",
  rubricId: "rubric-v1",
  rubricName: "Capstone Rubric",
  rubricType: "Project",
  rubricStatus: "Active" as const,
  rubricUpdatedAt: new Date("2026-08-17T00:00:00.000Z"),
  criterionCount: 2,
  criteriaSummary: "Problem framing, Technical quality",
};

describe("rubric QA evidence", () => {
  test("carries exact course, CourseSpec, assessment, and rubric version identity", () => {
    const candidate = rubricEvidenceCandidate("dse", definition, baseRow);
    expect(candidate.scope).toEqual({
      programmeId: "dse",
      courseId: "course-a",
      courseSpecVersionId: "spec-v2",
      assessmentId: "assessment-1",
    });
    expect(candidate.attributes.rubricId).toBe("rubric-v1");
    expect(candidate.attributes.rubricVersion).toBe("rubric-v1");
    expect(candidate.provenance?.authority).toBe("approvedDocument");
  });

  test("preserves archived linked rubric identity for historical CourseSpec evidence", () => {
    const candidate = rubricEvidenceCandidate("dse", definition, {
      ...baseRow,
      rubricStatus: "Archived",
    });
    expect(candidate.attributes.rubricStatus).toBe("Archived");
    expect(candidate.provenance?.version).toBe("rubric-v1");
    expect(candidate.provenance?.approvalStatus).toBe("Approved/Archived");
  });

  test("wrong-course rubric evidence is a deterministic scope mismatch", () => {
    const candidate = rubricEvidenceCandidate("dse", definition, baseRow);
    expect(
      matchEvidenceScope(
        { requiredDimensions: ["programme", "course", "courseSpecVersion", "assessment"] },
        {
          programmeId: "dse",
          courseId: "course-b",
          courseSpecVersionId: "spec-v3",
          assessmentId: "assessment-9",
        },
        candidate.scope!,
      ),
    ).toBe("mismatch");
  });

  test("query is link-driven, programme-scoped, Active-assessment-only, and excludes Draft rubrics", () => {
    const source = readFileSync(new URL("./rubric-evidence.ts", import.meta.url), "utf8");
    expect(source).toContain('JOIN "Rubric" r ON r.id = a."rubricId"');
    expect(source).toContain('WHERE c."programmeId" = ${programmeId}');
    expect(source).toContain("AND a.status = 'Active'");
    expect(source).toContain("AND r.status IN ('Active', 'Archived')");
    expect(source).not.toContain('FROM "Rubric" r\n    WHERE');
  });
});
