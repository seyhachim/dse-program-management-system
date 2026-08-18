import { describe, expect, test } from "bun:test";
import type { QaEvidenceCandidateResultView } from "@dse-pms/shared-types";
import { lexicalEvidenceScore } from "../documents/semantic.ts";
import { normalizeCandidateSemantics } from "./service.ts";

function result(candidates: QaEvidenceCandidateResultView["candidates"]): QaEvidenceCandidateResultView {
  return {
    programmeId: "dse",
    expectedEvidenceId: "evidence-1",
    evidenceType: "policy",
    sourceDomain: "policy",
    status: "supported",
    reason: "test",
    candidates,
  };
}

describe("unified QA evidence candidates", () => {
  test("normalizes structured and document source kinds through one contract", () => {
    const normalized = normalizeCandidateSemantics("dse", result([
      { key: "structured:1", evidenceType: "policy", sourceDomain: "outcomes", title: "Structured", summary: "", entityType: "Course", entityId: "course-1", route: "/courses/course-1", reportingDate: "2026-01-01T00:00:00.000Z", attributes: {} },
      { key: "document:1", sourceKind: "documentChunk", evidenceType: "policy", sourceDomain: "policy", title: "Document", summary: "chunk", entityType: "QaDocumentChunk", entityId: "chunk-1", route: null, reportingDate: "2026-01-01T00:00:00.000Z", attributes: { documentId: "doc-1", documentVersion: "2", pageNumber: 4, sectionLabel: "Review", startOffset: 120, endOffset: 420 } },
    ]));
    expect(normalized.candidates.map((candidate) => candidate.sourceKind)).toEqual(["structuredCandidate", "documentChunk"]);
    expect(normalized.candidates[1]?.attributes.startOffset).toBe(120);
    expect(normalized.candidates[1]?.attributes.endOffset).toBe(420);
  });

  test("deduplicates stable candidate keys by keeping the first-ranked occurrence", () => {
    const duplicate = { key: "same", evidenceType: "policy", sourceDomain: "outcomes" as const, title: "first", summary: "", entityType: "Course", entityId: "course-1", route: null, reportingDate: null, attributes: {} };
    const normalized = normalizeCandidateSemantics("dse", result([duplicate, { ...duplicate, title: "second" }]));
    expect(normalized.candidates).toHaveLength(1);
    expect(normalized.candidates[0]?.title).toBe("first");
  });

  test("lexical fallback ranks relevant document text without embeddings", () => {
    const query = "student progression completion outcomes";
    expect(lexicalEvidenceScore(query, "Annual student progression and completion outcomes report")).toBeGreaterThan(0.5);
    expect(lexicalEvidenceScore(query, "Laboratory equipment inventory")).toBe(0);
  });
});
