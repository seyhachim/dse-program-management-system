import { expect, test } from "bun:test";
import {
  CreateQaEvidenceAnalysisSchema,
  QaEvidenceAnalysisHistoryQuerySchema,
  QaEvidenceAnalysisStateSchema,
} from "./index.ts";

const baseInput = {
  programmeId: "dse",
  cycleId: "123e4567-e89b-12d3-a456-426614174000",
  requirementCode: "1.2",
  expectationId: "aun-qa-v4:1.2:expectation:1",
  state: "evidenceIdentified" as const,
  explanation: "Relevant structured evidence was identified and retained with provenance.",
  confidence: 0.9,
  uncertaintyNote: "",
  engine: "deterministic",
  engineVersion: "1.0",
  sources: [
    {
      sourceKind: "structuredCandidate" as const,
      candidateKey: "clo-plo-mappings:CourseSpec:spec-1",
      sourceDomain: "courseSpec" as const,
      entityType: "CourseSpec",
      entityId: "spec-1",
      title: "TSA301 — CLO to PLO mapping",
      summary: "Three active CLOs are mapped.",
      excerpt: "",
      route: "/courses/course-1/spec",
      reportingDate: null,
      relevance: 0.95,
    },
  ],
};

test("QA analysis supports exactly the three research-defined evidence states", () => {
  expect(QaEvidenceAnalysisStateSchema.options).toEqual([
    "evidenceIdentified",
    "potentialEvidenceGap",
    "expertReviewRequired",
  ]);
});

test("QA analysis validates confidence, relevance, and source provenance", () => {
  expect(CreateQaEvidenceAnalysisSchema.safeParse(baseInput).success).toBe(true);
  expect(
    CreateQaEvidenceAnalysisSchema.safeParse({ ...baseInput, confidence: 1.1 }).success,
  ).toBe(false);
  expect(
    CreateQaEvidenceAnalysisSchema.safeParse({
      ...baseInput,
      sources: [{ ...baseInput.sources[0], relevance: -0.1 }],
    }).success,
  ).toBe(false);
});

test("QA analysis rejects duplicate source snapshots within one run", () => {
  expect(
    CreateQaEvidenceAnalysisSchema.safeParse({
      ...baseInput,
      sources: [baseInput.sources[0], baseInput.sources[0]],
    }).success,
  ).toBe(false);
});

test("QA analysis history query is programme-scoped with optional requirement filter", () => {
  expect(
    QaEvidenceAnalysisHistoryQuerySchema.safeParse({ programmeId: "dse" }).success,
  ).toBe(true);
  expect(
    QaEvidenceAnalysisHistoryQuerySchema.safeParse({
      programmeId: "dse",
      requirementCode: "1.2",
    }).success,
  ).toBe(true);
  expect(
    QaEvidenceAnalysisHistoryQuerySchema.safeParse({
      programmeId: "dse",
      requirementCode: "bad",
    }).success,
  ).toBe(false);
});
