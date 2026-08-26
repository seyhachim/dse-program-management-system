import { describe, expect, test } from "bun:test";
import type { QaEvidenceCandidateResultView } from "@dse-pms/shared-types";
import {
  buildQaSarSourceRecordBlock,
  qaSarSourceSnapshotKey,
} from "./source-context-service.ts";

const definition = {
  id: "expected-programme-outcomes",
  evidenceType: "programme-outcomes",
  description: "Approved programme outcomes",
  sourceDomain: "outcomes",
};

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
