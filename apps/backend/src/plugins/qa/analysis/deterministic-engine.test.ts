import { describe, expect, it } from "bun:test";
import type {
  QaEvidenceCandidateResultView,
  QaEvidenceCandidateView,
  QaExpectedEvidenceDefinitionView,
  QaQualityExpectationView,
} from "@dse-pms/shared-types";
import { assessCandidates, selectCohortStartDate } from "./deterministic-engine.ts";

const cycle = {
  reportingStart: new Date("2025-01-01T00:00:00.000Z"),
  reportingEnd: new Date("2025-12-31T23:59:59.999Z"),
};

function expectation(
  temporalRule: QaQualityExpectationView["temporalRule"] = { kind: "pointInTime" },
): QaQualityExpectationView {
  return {
    id: "expectation-1",
    requirementCode: "2.4",
    statement: "Scoped evidence must match the intended academic context.",
    purpose: "Regression-test deterministic evidence semantics.",
    order: 1,
    applicabilityRule: { kind: "always" },
    scopeRequirement: {
      requiredDimensions: ["programme", "course", "courseSpecVersion", "cohort", "term", "assessment"],
    },
    temporalRule,
    expectedEvidence: [],
  };
}

function definition(
  temporalRule: QaExpectedEvidenceDefinitionView["temporalRule"] = { kind: "pointInTime" },
): QaExpectedEvidenceDefinitionView {
  return {
    id: "evidence-1",
    evidenceType: "assessment-plan",
    description: "Assessment evidence",
    role: "required",
    sourceDomain: "assessment",
    order: 1,
    scopeRequirement: { requiredDimensions: [] },
    temporalRule,
    authorityRequirement: { minimumAuthority: "approvedDocument" },
  };
}

function candidate(options: {
  key: string;
  courseId?: string;
  courseSpecVersionId?: string;
  cohortId?: string;
  term?: string;
  assessmentId?: string;
  reportingDate?: string;
  periodKey?: string | null;
  authority?: "approvedDocument" | "contributorRecord";
}): QaEvidenceCandidateView {
  return {
    key: options.key,
    evidenceType: "assessment-plan",
    sourceDomain: "assessment",
    title: options.key,
    summary: options.key,
    entityType: "Assessment",
    entityId: options.key,
    route: null,
    reportingDate: options.reportingDate ?? "2025-06-01T00:00:00.000Z",
    periodKey: options.periodKey ?? null,
    scope: {
      programmeId: "dse",
      courseId: options.courseId,
      courseSpecVersionId: options.courseSpecVersionId,
      cohortId: options.cohortId,
      term: options.term,
      assessmentId: options.assessmentId,
    },
    provenance: {
      authority: options.authority ?? "approvedDocument",
      ownerUnit: "DSE",
      version: null,
      approvalStatus: "Approved",
      sourceUri: null,
    },
    attributes: {},
  };
}

const expectedScope = {
  programmeId: "dse",
  courseId: "course-1",
  courseSpecVersionId: "spec-2",
  cohortId: "cohort-2024",
  term: "2025-S1",
  assessmentId: "assessment-1",
};

function result(candidates: QaEvidenceCandidateView[]): QaEvidenceCandidateResultView {
  return {
    programmeId: "dse",
    expectedEvidenceId: "evidence-1",
    evidenceType: "assessment-plan",
    sourceDomain: "assessment",
    status: "supported",
    reason: "test",
    expectedScope,
    candidates,
  };
}

describe("deterministic QA engine evidence semantics", () => {
  it("rejects wrong course, CourseSpec version, cohort, term, and assessment targets", () => {
    const exact = candidate({ key: "exact", ...expectedScope });
    const wrong = [
      candidate({ key: "wrong-course", ...expectedScope, courseId: "course-2" }),
      candidate({ key: "wrong-spec", ...expectedScope, courseSpecVersionId: "spec-1" }),
      candidate({ key: "wrong-cohort", ...expectedScope, cohortId: "cohort-2025" }),
      candidate({ key: "wrong-term", ...expectedScope, term: "2025-S2" }),
      candidate({ key: "wrong-assessment", ...expectedScope, assessmentId: "assessment-2" }),
    ];

    const assessed = assessCandidates("dse", expectation(), definition(), result([exact, ...wrong]), cycle);

    expect(assessed.assessed.find((item) => item.candidate.key === "exact")?.scopeMatch).toBe("exact");
    for (const item of wrong) {
      expect(assessed.assessed.find((entry) => entry.candidate.key === item.key)?.scopeMatch).toBe("mismatch");
    }
    expect(assessed.finding.result.candidates.map((item) => item.key)).toEqual(["exact"]);
  });

  it("does not allow partial or unknown required scope to become deterministic support", () => {
    const partial = candidate({
      key: "partial",
      ...expectedScope,
      courseSpecVersionId: undefined,
    });
    const unknown = candidate({
      key: "unknown",
      courseId: undefined,
      courseSpecVersionId: undefined,
      cohortId: undefined,
      term: undefined,
      assessmentId: undefined,
    });

    const assessed = assessCandidates("dse", expectation(), definition(), result([partial, unknown]), cycle);

    expect(assessed.assessed.find((item) => item.candidate.key === "partial")?.scopeMatch).toBe("partial");
    expect(assessed.assessed.find((item) => item.candidate.key === "unknown")?.scopeMatch).toBe("partial");
    expect(assessed.finding.result.candidates).toHaveLength(0);
  });

  it("counts only exact-scope, sufficient-authority, non-future unique periods", () => {
    const longitudinalDefinition = definition({ kind: "longitudinal", minimumPeriods: 3 });
    const candidates = [
      candidate({ key: "p1", ...expectedScope, reportingDate: "2023-06-01T00:00:00.000Z", periodKey: "2023" }),
      candidate({ key: "p2", ...expectedScope, reportingDate: "2024-06-01T00:00:00.000Z", periodKey: "2024" }),
      candidate({ key: "duplicate-p2", ...expectedScope, reportingDate: "2024-09-01T00:00:00.000Z", periodKey: "2024" }),
      candidate({ key: "wrong-scope-p3", ...expectedScope, courseId: "course-2", reportingDate: "2025-06-01T00:00:00.000Z", periodKey: "2025" }),
      candidate({ key: "weak-p3", ...expectedScope, authority: "contributorRecord", reportingDate: "2025-06-01T00:00:00.000Z", periodKey: "2025" }),
      candidate({ key: "future-p3", ...expectedScope, reportingDate: "2026-06-01T00:00:00.000Z", periodKey: "2026" }),
    ];

    const assessed = assessCandidates(
      "dse",
      expectation({ kind: "longitudinal", minimumPeriods: 3 }),
      longitudinalDefinition,
      result(candidates),
      cycle,
    );

    expect(assessed.assessed.find((item) => item.candidate.key === "p1")?.temporalMatch).toBe("insufficientHistory");
    expect(assessed.assessed.find((item) => item.candidate.key === "p2")?.temporalMatch).toBe("insufficientHistory");
    expect(assessed.assessed.find((item) => item.candidate.key === "future-p3")?.temporalMatch).toBe("future");
    expect(assessed.finding.result.candidates).toHaveLength(0);
  });

  it("accepts longitudinal evidence once three eligible distinct periods exist", () => {
    const longitudinalDefinition = definition({ kind: "longitudinal", minimumPeriods: 3 });
    const candidates = [
      candidate({ key: "p1", ...expectedScope, reportingDate: "2023-06-01T00:00:00.000Z", periodKey: "2023" }),
      candidate({ key: "p2", ...expectedScope, reportingDate: "2024-06-01T00:00:00.000Z", periodKey: "2024" }),
      candidate({ key: "p3", ...expectedScope, reportingDate: "2025-06-01T00:00:00.000Z", periodKey: "2025" }),
    ];

    const assessed = assessCandidates(
      "dse",
      expectation({ kind: "longitudinal", minimumPeriods: 3 }),
      longitudinalDefinition,
      result(candidates),
      cycle,
    );

    expect(assessed.assessed.every((item) => item.temporalMatch === "current")).toBe(true);
    expect(assessed.finding.result.candidates).toHaveLength(3);
  });
});

describe("deterministic QA cohort applicability context", () => {
  it("uses the single curriculum cohort that matches the reporting cycle", () => {
    expect(
      selectCohortStartDate(
        [
          { effectiveFrom: new Date("2020-09-01T00:00:00.000Z"), intakeYear: 2020, academicYear: "2020-2021" },
          { effectiveFrom: new Date("2024-09-01T00:00:00.000Z"), intakeYear: 2024, academicYear: "2025-2025" },
        ],
        cycle,
      )?.toISOString(),
    ).toBe("2024-09-01T00:00:00.000Z");
  });

  it("returns null for ambiguous cohort context instead of borrowing the latest active cohort", () => {
    expect(
      selectCohortStartDate(
        [
          { effectiveFrom: new Date("2020-09-01T00:00:00.000Z"), intakeYear: 2020, academicYear: "" },
          { effectiveFrom: new Date("2024-09-01T00:00:00.000Z"), intakeYear: 2024, academicYear: "" },
        ],
        cycle,
      ),
    ).toBeNull();
  });

  it("returns the only active cohort start date and falls back to intake year when needed", () => {
    expect(
      selectCohortStartDate(
        [{ effectiveFrom: null, intakeYear: 2024, academicYear: "" }],
        cycle,
      )?.toISOString(),
    ).toBe("2024-01-01T00:00:00.000Z");
  });
});
