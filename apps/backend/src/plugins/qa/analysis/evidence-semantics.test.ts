import { describe, expect, it } from "bun:test";
import {
  evaluateApplicability,
  matchEvidenceScope,
  matchEvidenceTime,
  meetsSourceAuthority,
  temporalMatchSupportsEvidence,
} from "./evidence-semantics.ts";

describe("QA evidence semantics", () => {
  it("does not turn an immature cohort into an evidence gap precondition", () => {
    expect(
      evaluateApplicability(
        { kind: "cohortMaturity", minimumElapsedYears: 4 },
        {
          cohortStartDate: new Date("2024-09-01T00:00:00.000Z"),
          asOfDate: new Date("2026-08-17T00:00:00.000Z"),
        },
      ).state,
    ).toBe("notApplicable");
  });

  it("recognizes a mature cohort as applicable", () => {
    expect(
      evaluateApplicability(
        { kind: "cohortMaturity", minimumElapsedYears: 4 },
        {
          cohortStartDate: new Date("2020-09-01T00:00:00.000Z"),
          asOfDate: new Date("2026-08-17T00:00:00.000Z"),
        },
      ).state,
    ).toBe("applicable");
  });

  it("routes missing maturity context to uncertain", () => {
    expect(
      evaluateApplicability(
        { kind: "cohortMaturity", minimumElapsedYears: 4 },
        { cohortStartDate: null, asOfDate: new Date("2026-08-17T00:00:00.000Z") },
      ).state,
    ).toBe("uncertain");
  });

  it("recognizes an exact multi-dimensional scope", () => {
    expect(
      matchEvidenceScope(
        { requiredDimensions: ["programme", "course", "courseSpecVersion"] },
        { programmeId: "dse", courseId: "course-1", courseSpecVersionId: "spec-2" },
        { programmeId: "dse", courseId: "course-1", courseSpecVersionId: "spec-2" },
      ),
    ).toBe("exact");
  });

  it("allows programme-wide expectations to require course/version scope presence", () => {
    expect(
      matchEvidenceScope(
        { requiredDimensions: ["programme", "course", "courseSpecVersion"] },
        { programmeId: "dse" },
        { programmeId: "dse", courseId: "course-1", courseSpecVersionId: "spec-2" },
      ),
    ).toBe("exact");
    expect(
      matchEvidenceScope(
        { requiredDimensions: ["programme", "course", "courseSpecVersion"] },
        { programmeId: "dse" },
        { programmeId: "dse", courseId: "course-1" },
      ),
    ).toBe("partial");
  });

  it("rejects wrong course, cohort, term, and version as scope mismatches", () => {
    const requirement = {
      requiredDimensions: ["programme", "course", "courseSpecVersion", "cohort", "term"] as const,
    };
    const expected = {
      programmeId: "dse",
      courseId: "course-1",
      courseSpecVersionId: "spec-2",
      cohortId: "2024",
      term: "2026-S1",
    };
    for (const candidate of [
      { ...expected, courseId: "course-2" },
      { ...expected, cohortId: "2025" },
      { ...expected, term: "2026-S2" },
      { ...expected, courseSpecVersionId: "spec-1" },
    ]) {
      expect(matchEvidenceScope({ requiredDimensions: [...requirement.requiredDimensions] }, expected, candidate)).toBe("mismatch");
    }
  });

  it("marks stale, future, and current evidence explicitly", () => {
    const cycle = {
      cycleStart: new Date("2025-01-01T00:00:00.000Z"),
      cycleEnd: new Date("2025-12-31T23:59:59.999Z"),
    };
    expect(
      matchEvidenceTime(
        { kind: "recent", maximumAgeDays: 365 },
        { ...cycle, candidateDate: new Date("2023-01-01T00:00:00.000Z") },
      ),
    ).toBe("stale");
    expect(
      matchEvidenceTime(
        { kind: "withinCycle" },
        { ...cycle, candidateDate: new Date("2026-01-01T00:00:00.000Z") },
      ),
    ).toBe("future");
    expect(
      matchEvidenceTime(
        { kind: "withinCycle" },
        { ...cycle, candidateDate: new Date("2025-06-01T00:00:00.000Z") },
      ),
    ).toBe("current");
  });

  it("keeps historical point-in-time records usable but keeps explicit current-window rules strict", () => {
    expect(temporalMatchSupportsEvidence({ kind: "pointInTime" }, "historicalRelevant")).toBe(true);
    expect(temporalMatchSupportsEvidence({ kind: "withinCycle" }, "historicalRelevant")).toBe(false);
    expect(temporalMatchSupportsEvidence({ kind: "recent", maximumAgeDays: 365 }, "stale")).toBe(false);
  });

  it("requires sufficient comparable periods and still rejects future longitudinal evidence", () => {
    const cycle = {
      cycleStart: new Date("2025-01-01T00:00:00.000Z"),
      cycleEnd: new Date("2025-12-31T23:59:59.999Z"),
    };
    expect(
      matchEvidenceTime(
        { kind: "longitudinal", minimumPeriods: 3 },
        { ...cycle, comparablePeriods: 2 },
      ),
    ).toBe("insufficientHistory");
    expect(
      matchEvidenceTime(
        { kind: "longitudinal", minimumPeriods: 3 },
        {
          ...cycle,
          comparablePeriods: 3,
          candidateDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      ),
    ).toBe("future");
  });

  it("distinguishes source authority from source domain", () => {
    expect(
      meetsSourceAuthority(
        { minimumAuthority: "approvedDocument" },
        {
          authority: "officialInstitutionalRecord",
          ownerUnit: "Registrar",
          version: "2026.1",
          approvalStatus: "approved",
          sourceUri: null,
        },
      ),
    ).toBe(true);
    expect(
      meetsSourceAuthority(
        { minimumAuthority: "approvedDocument" },
        {
          authority: "contributorRecord",
          ownerUnit: "DSE",
          version: null,
          approvalStatus: null,
          sourceUri: null,
        },
      ),
    ).toBe(false);
    expect(
      meetsSourceAuthority(
        { minimumAuthority: "approvedDocument" },
        {
          authority: "unknown",
          ownerUnit: null,
          version: null,
          approvalStatus: null,
          sourceUri: null,
        },
      ),
    ).toBeNull();
  });
});
