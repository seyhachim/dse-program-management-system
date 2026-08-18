import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { matchEvidenceScope } from "../analysis/evidence-semantics.ts";
import {
  canReadRubricEvidence,
  rubricEvidenceCandidate,
} from "./rubric-evidence.ts";

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

  test("uses exact non-navigation provenance instead of opening the newest CourseSpec", () => {
    const candidate = rubricEvidenceCandidate("dse", definition, baseRow);
    expect(candidate.route).toBeNull();
    expect(candidate.provenance?.sourceUri).toBe(
      "pms://course-spec/spec-v2/assessment/assessment-1/rubric/rubric-v1",
    );
  });

  test("preserves archived linked rubric identity for authorized historical evidence", () => {
    const candidate = rubricEvidenceCandidate("dse", definition, {
      ...baseRow,
      rubricStatus: "Archived",
    });
    expect(candidate.attributes.rubricStatus).toBe("Archived");
    expect(candidate.provenance?.version).toBe("rubric-v1");
    expect(candidate.provenance?.approvalStatus).toBe("Approved/Archived");
  });

  test("matches rubric lifecycle visibility for Archived evidence", () => {
    expect(canReadRubricEvidence("Active", "owner-1")).toBe(true);
    expect(
      canReadRubricEvidence("Archived", "owner-1", {
        id: "qa-1",
        roles: ["qa_reviewer"],
      }),
    ).toBe(false);
    expect(
      canReadRubricEvidence("Archived", "owner-1", {
        id: "owner-1",
        roles: ["lecturer"],
      }),
    ).toBe(true);
    expect(
      canReadRubricEvidence("Archived", "owner-1", {
        id: "admin-1",
        roles: ["admin"],
      }),
    ).toBe(true);
    expect(
      canReadRubricEvidence("Archived", "owner-1", {
        id: "pc-1",
        roles: ["program_coordinator"],
      }),
    ).toBe(true);
  });

  test("wrong-course rubric evidence is a deterministic scope mismatch", () => {
    const candidate = rubricEvidenceCandidate("dse", definition, baseRow);
    expect(
      matchEvidenceScope(
        {
          requiredDimensions: [
            "programme",
            "course",
            "courseSpecVersion",
            "assessment",
          ],
        },
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

  test("query is link-driven, programme-scoped, Active-assessment-only, and visibility-gated", () => {
    const source = readFileSync(
      new URL("./rubric-evidence.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('JOIN "Rubric" r ON r.id = a."rubricId"');
    expect(source).toContain('WHERE c."programmeId" = ${programmeId}');
    expect(source).toContain("AND a.status = 'Active'");
    expect(source).toContain("r.status = 'Active'");
    expect(source).toContain("r.status = 'Archived'");
    expect(source).toContain('r."ownerId" = ${viewerId}');
    expect(source).not.toContain("r.status IN ('Active', 'Archived')");
  });
});
