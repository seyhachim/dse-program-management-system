import { describe, expect, test } from "bun:test";
import {
  QA_EVIDENCE_REDACTION_POLICY_VERSION,
  type QaEvidenceReportingPeriod,
  type QaEvidenceSnapshotProvenance,
  type QaEvidenceSnapshotScope,
} from "@dse-pms/shared-types";
import {
  hashQaEvidenceSnapshotEnvelope,
  redactQaEvidenceForExternalView,
} from "./service.ts";

const scope: QaEvidenceSnapshotScope = {
  programmeId: "dse",
  requirementCodes: ["4.5"],
  expectationIds: ["c4-e05"],
};
const reportingPeriod: QaEvidenceReportingPeriod = {
  label: "2025-2026",
  start: "2025-08-01T00:00:00.000Z",
  end: "2026-07-31T00:00:00.000Z",
};
const provenance: QaEvidenceSnapshotProvenance = {
  sourceDomain: "pms",
  sourceAuthority: "officialInstitutionalRecord",
  sourceEntityType: "QaEvidence",
  sourceEntityId: "evidence-1",
  sourceVersion: "1",
  approvalStatus: "Reviewed",
  approvedAt: null,
  verifiedAt: "2026-08-16T00:00:00.000Z",
  sourceContentHash: null,
  redactionPolicyVersion: QA_EVIDENCE_REDACTION_POLICY_VERSION,
};

describe("QA external evidence redaction", () => {
  test("removes direct identifiers and individual scores recursively", () => {
    const result = redactQaEvidenceForExternalView({
      cohortSize: 42,
      achievementRate: 0.81,
      student: {
        studentId: "S001",
        name: "Test Student",
        email: "student@example.edu",
        authId: "auth-1",
        score: 87,
      },
      contact: "Send details to student@example.edu",
    });
    const serialized = JSON.stringify(result.payload);
    expect(serialized).toContain("42");
    expect(serialized).toContain("0.81");
    expect(serialized).not.toContain("S001");
    expect(serialized).not.toContain("Test Student");
    expect(serialized).not.toContain("student@example.edu");
    expect(serialized).not.toContain("auth-1");
    expect(serialized).not.toContain("87");
    expect(serialized).toContain("[redacted email]");
    expect(result.removedFields.length).toBeGreaterThan(0);
  });
});

describe("QA evidence snapshot hashing", () => {
  test("is deterministic for equivalent object key order", () => {
    const left = hashQaEvidenceSnapshotEnvelope({
      snapshot: { b: 2, a: 1 },
      scope,
      reportingPeriod,
      provenance,
    });
    const right = hashQaEvidenceSnapshotEnvelope({
      snapshot: { a: 1, b: 2 },
      scope,
      reportingPeriod,
      provenance,
    });
    expect(left).toBe(right);
  });

  test("changes when scope or frozen evidence content changes", () => {
    const original = hashQaEvidenceSnapshotEnvelope({
      snapshot: { value: 1 },
      scope,
      reportingPeriod,
      provenance,
    });
    const contentChanged = hashQaEvidenceSnapshotEnvelope({
      snapshot: { value: 2 },
      scope,
      reportingPeriod,
      provenance,
    });
    const scopeChanged = hashQaEvidenceSnapshotEnvelope({
      snapshot: { value: 1 },
      scope: { ...scope, requirementCodes: ["8.4"] },
      reportingPeriod,
      provenance,
    });
    expect(contentChanged).not.toBe(original);
    expect(scopeChanged).not.toBe(original);
  });
});
