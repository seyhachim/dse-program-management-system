import { describe, expect, test } from "bun:test";
import type {
  QaEvidenceCandidateResultView,
  QaExpectedEvidenceDefinitionView,
  QaQualityExpectationView,
} from "@dse-pms/shared-types";
import {
  buildQaSarSourceRecordBlock,
  filterQaSarSupportingCandidates,
  qaSarSourceSnapshotKey,
} from "./source-context-service.ts";

const definition = {
  id: "expected-programme-outcomes",
  evidenceType: "programme-outcomes",
  description: "Approved programme outcomes",
  sourceDomain: "outcomes",
} as const;

function result(keys: string[]): QaEvidenceCandidateResultView {
  return {
    programmeId: "dse",
    expectedEvidenceId: definition.id,
    evidenceType: definition.evidenceType,
    sourceDomain: "outcomes",
    status: keys.length ? "supported" : "unsupported",
    reason: keys.length ? "Canonical outcomes found" : "No canonical outcomes found",
    candidates: keys.map((key, index) => ({
      key,
      sourceKind: "structuredCandidate",
      evidenceType: definition.evidenceType,
      sourceDomain: "outcomes",
      title: `Outcome ${index + 1}`,
      summary: `Canonical outcome ${key}`,
      entityType: "ProgrammeLearningOutcome",
      entityId: `plo-${index + 1}`,
      route: "/curriculum",
      reportingDate: "2026-01-15T00:00:00.000Z",
      periodKey: "2026",
      scope: { programmeId: "dse" },
      provenance: {
        authority: "approvedDocument",
        ownerUnit: "DSE",
        version: "3",
        approvalStatus: "Approved",
        sourceUri: "/curriculum",
      },
      attributes: {},
    })),
  };
}

const start = new Date("2023-01-01T00:00:00.000Z");
const end = new Date("2026-12-31T00:00:00.000Z");
const generatedAt = "2026-08-26T00:00:00.000Z";

describe("SAR PMS source context projection", () => {
  test("uses a stable snapshot key regardless of candidate retrieval order", () => {
    expect(qaSarSourceSnapshotKey(definition.id, ["b", "a"])).toBe(
      qaSarSourceSnapshotKey(definition.id, ["a", "b"]),
    );

    const first = buildQaSarSourceRecordBlock(
      definition,
      result(["candidate-b", "candidate-a"]),
      start,
      end,
      generatedAt,
    );
    const second = buildQaSarSourceRecordBlock(
      definition,
      result(["candidate-a", "candidate-b"]),
      start,
      end,
      generatedAt,
    );
    expect(first.snapshotKey).toBe(second.snapshotKey);
  });

  test("snapshot identity changes when an existing source revision changes", () => {
    const original = result(["same-key"]);
    const revised = result(["same-key"]);
    revised.candidates[0]!.summary = "Revised canonical outcome text";

    const before = buildQaSarSourceRecordBlock(definition, original, start, end, generatedAt);
    const after = buildQaSarSourceRecordBlock(definition, revised, start, end, generatedAt);
    expect(after.snapshotKey).not.toBe(before.snapshotKey);
  });

  test("preserves source provenance without exposing personal data", () => {
    const block = buildQaSarSourceRecordBlock(
      definition,
      result(["candidate-a"]),
      start,
      end,
      generatedAt,
    );

    expect(block.availability).toBe("available");
    expect(block.provenance[0]).toEqual({
      sourceDomain: "outcomes",
      entityType: "ProgrammeLearningOutcome",
      entityId: "plo-1",
      route: "/curriculum",
      authority: "approvedDocument",
      ownerUnit: "DSE",
      version: "3",
      approvalStatus: "Approved",
    });
    expect(JSON.stringify(block)).not.toContain("email");
    expect(JSON.stringify(block)).not.toContain("studentId");
  });

  test("aggregates student-level candidates so source context does not expose student identifiers", () => {
    const studentDefinition = {
      id: "expected-completion",
      evidenceType: "completion-records",
      description: "Programme completion records",
      sourceDomain: "outcomes",
    } as const;
    const studentResult: QaEvidenceCandidateResultView = {
      programmeId: "dse",
      expectedEvidenceId: studentDefinition.id,
      evidenceType: studentDefinition.evidenceType,
      sourceDomain: "outcomes",
      status: "supported",
      reason: "Completion records found",
      candidates: ["DSE001", "DSE002"].map((studentId, index) => ({
        key: `completion-${index}`,
        sourceKind: "structuredCandidate",
        evidenceType: studentDefinition.evidenceType,
        sourceDomain: "outcomes",
        title: `${studentId} — Cohort 2023 — ProgrammeCompleted`,
        summary: `ProgrammeCompleted for ${studentId}`,
        entityType: "StudentCompletionOutcome",
        entityId: `outcome-${index}`,
        route: "/students",
        reportingDate: "2026-06-30T00:00:00.000Z",
        periodKey: "2026",
        scope: { programmeId: "dse", cohortId: "cohort-2023", population: "cohort-membership" },
        provenance: {
          authority: "officialInstitutionalRecord",
          ownerUnit: "DSE",
          version: null,
          approvalStatus: null,
          sourceUri: "/students",
        },
        attributes: {
          studentId: `internal-${index}`,
          cohortCode: "Cohort 2023",
          academicYear: "2026",
          outcomeType: "ProgrammeCompleted",
        },
      })),
    };

    const block = buildQaSarSourceRecordBlock(
      studentDefinition,
      studentResult,
      start,
      end,
      generatedAt,
    );
    expect(block.kind).toBe("table");
    if (block.kind !== "table") throw new Error("Expected aggregate table");
    expect(block.rows).toEqual([
      { period: "2026", cohort: "Cohort 2023", category: "ProgrammeCompleted", count: 2 },
    ]);
    const serialized = JSON.stringify(block);
    expect(serialized).not.toContain("DSE001");
    expect(serialized).not.toContain("DSE002");
    expect(serialized).not.toContain("internal-0");
    expect(serialized).not.toContain("outcome-0");
  });

  test("represents missing canonical data explicitly instead of inventing records", () => {
    const block = buildQaSarSourceRecordBlock(
      definition,
      result([]),
      start,
      end,
      generatedAt,
    );

    expect(block.availability).toBe("unavailable");
    expect(block.snapshotKey).toBe(`${definition.id}:unavailable`);
    if (block.kind !== "recordList") throw new Error("Expected record-list source block");
    expect(block.records).toEqual([]);
    expect(block.message).toBe("No canonical outcomes found");
  });

  test("filters future/out-of-period candidates using the existing deterministic evidence semantics", () => {
    const expectedEvidence: QaExpectedEvidenceDefinitionView = {
      id: definition.id,
      evidenceType: definition.evidenceType,
      description: definition.description,
      role: "required",
      sourceDomain: "outcomes",
      order: 1,
      scopeRequirement: { requiredDimensions: ["programme"] },
      temporalRule: { kind: "withinCycle" },
      authorityRequirement: { minimumAuthority: "controlledInternalRecord" },
    };
    const expectation: QaQualityExpectationView = {
      id: "expectation-1",
      requirementCode: "1.1",
      statement: "Programme outcomes are current.",
      purpose: "Validate reporting-period filtering.",
      order: 1,
      applicabilityRule: { kind: "always" },
      scopeRequirement: { requiredDimensions: ["programme"] },
      temporalRule: { kind: "withinCycle" },
      expectedEvidence: [expectedEvidence],
    };
    const candidates = result(["current", "future"]);
    candidates.candidates[0]!.reportingDate = "2026-06-01T00:00:00.000Z";
    candidates.candidates[1]!.reportingDate = "2027-01-01T00:00:00.000Z";

    const filtered = filterQaSarSupportingCandidates(
      "dse",
      expectation,
      expectedEvidence,
      candidates,
      { reportingStart: start, reportingEnd: end },
    );
    expect(filtered.candidates.map((candidate) => candidate.key)).toEqual(["current"]);
  });

  test("a later source change produces a new snapshot while the prior snapshot stays stable", () => {
    const releasedSnapshot = buildQaSarSourceRecordBlock(
      definition,
      result(["candidate-a"]),
      start,
      end,
      generatedAt,
    );
    const priorSerialized = JSON.stringify(releasedSnapshot);

    const liveAfterChange = buildQaSarSourceRecordBlock(
      definition,
      result(["candidate-a", "candidate-b"]),
      start,
      end,
      "2027-01-10T00:00:00.000Z",
    );

    expect(liveAfterChange.snapshotKey).not.toBe(releasedSnapshot.snapshotKey);
    expect(JSON.stringify(releasedSnapshot)).toBe(priorSerialized);
  });
});
