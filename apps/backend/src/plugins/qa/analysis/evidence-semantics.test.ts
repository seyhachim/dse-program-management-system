import { describe, expect, it } from "bun:test";
import {
  evaluateApplicability,
  matchEvidenceScope,
  matchEvidenceTime,
  meetsSourceAuthority,
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

  it("rejects wrong-course evidence as a scope mismatch", () => {
    expect(
      matchEvidenceScope(
        { requiredDimensions: ["programme", "course"] },
        { programmeId: "dse", courseId: "course-1" },
        { programmeId: "dse", courseId: "course-2" },
      ),
    ).toBe("mismatch");
  });

  it("marks stale and future evidence explicitly", () => {
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
  });

  it("requires sufficient comparable periods for longitudinal evidence", () => {
    expect(
      matchEvidenceTime(
        { kind: "longitudinal", minimumPeriods: 3 },
        {
          cycleStart: new Date("2025-01-01T00:00:00.000Z"),
          cycleEnd: new Date("2025-12-31T23:59:59.999Z"),
          comparablePeriods: 2,
        },
      ),
    ).toBe("insufficientHistory");
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
