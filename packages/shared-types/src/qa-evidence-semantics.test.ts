import { describe, expect, it } from "bun:test";
import {
  QaEvidenceProvenanceSchema,
  QaEvidenceScopeSchema,
  QaExpectedEvidenceSemanticsSchema,
  QaQualityExpectationSemanticsSchema,
  QaTemporalMatchSchema,
} from "./qa-evidence-semantics.ts";

describe("QA evidence semantics contracts", () => {
  it("defaults legacy expectations to always-applicable point-in-time semantics", () => {
    expect(QaQualityExpectationSemanticsSchema.parse({})).toEqual({
      applicabilityRule: { kind: "always" },
      scopeRequirement: { requiredDimensions: [] },
      temporalRule: { kind: "pointInTime" },
      relationshipRequirement: { requiredLinks: [] },
    });
    expect(QaExpectedEvidenceSemanticsSchema.parse({})).toEqual({
      scopeRequirement: { requiredDimensions: [] },
      temporalRule: { kind: "pointInTime" },
      authorityRequirement: { minimumAuthority: "unknown" },
    });
  });

  it("supports cohort maturity, multi-dimensional scope, time and authority requirements", () => {
    expect(
      QaExpectedEvidenceSemanticsSchema.parse({
        scopeRequirement: {
          requiredDimensions: ["programme", "cohort", "academicYear"],
        },
        temporalRule: { kind: "longitudinal", minimumPeriods: 3 },
        authorityRequirement: { minimumAuthority: "approvedDocument" },
      }),
    ).toEqual({
      scopeRequirement: {
        requiredDimensions: ["programme", "cohort", "academicYear"],
      },
      temporalRule: { kind: "longitudinal", minimumPeriods: 3 },
      authorityRequirement: { minimumAuthority: "approvedDocument" },
    });
  });

  it("supports explicit evidence relationship chains without making them matcher behavior yet", () => {
    expect(
      QaQualityExpectationSemanticsSchema.parse({
        relationshipRequirement: {
          requiredLinks: [
            {
              fromEvidenceType: "outcome-concerns",
              toEvidenceType: "qa-review-records",
              relation: "reviewedBy",
            },
            {
              fromEvidenceType: "qa-review-records",
              toEvidenceType: "improvement-actions",
              relation: "resultsIn",
            },
            {
              fromEvidenceType: "improvement-actions",
              toEvidenceType: "follow-up-evidence",
              relation: "followedUpBy",
            },
          ],
        },
      }).relationshipRequirement.requiredLinks,
    ).toHaveLength(3);
  });

  it("normalizes candidate scope and provenance", () => {
    expect(
      QaEvidenceScopeSchema.parse({
        programmeId: "dse",
        courseId: "course-1",
        courseSpecVersionId: "spec-v2",
      }),
    ).toEqual({
      programmeId: "dse",
      courseId: "course-1",
      courseSpecVersionId: "spec-v2",
    });

    expect(QaEvidenceProvenanceSchema.parse({ authority: "approvedDocument" })).toEqual({
      authority: "approvedDocument",
      ownerUnit: null,
      version: null,
      approvalStatus: null,
      sourceUri: null,
    });
  });

  it("exposes all temporal decision states needed by #298", () => {
    const states = [
      "current",
      "historicalRelevant",
      "stale",
      "future",
      "insufficientHistory",
      "unknown",
    ] as const;

    for (const state of states) {
      expect(QaTemporalMatchSchema.parse(state)).toBe(state);
    }
  });
});
