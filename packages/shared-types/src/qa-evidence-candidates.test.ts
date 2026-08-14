import { expect, test } from "bun:test";
import {
  AUN_QA_V4_PILOT_KNOWLEDGE,
  QA_EXPLICITLY_UNSUPPORTED_EVIDENCE_TYPES,
  QA_SEMANTIC_EVIDENCE_TYPES,
  QA_STRUCTURED_EVIDENCE_TYPES,
  QaEvidenceCandidatesQuerySchema,
} from "./index.ts";

test("every pilot evidence type has exactly one retrieval support classification", () => {
  const pilotTypes = new Set(
    AUN_QA_V4_PILOT_KNOWLEDGE.flatMap((item) => item.evidence.map((entry) => entry[0])),
  );
  const structured = new Set<string>(QA_STRUCTURED_EVIDENCE_TYPES);
  const semantic = new Set<string>(QA_SEMANTIC_EVIDENCE_TYPES);
  const unsupported = new Set<string>(QA_EXPLICITLY_UNSUPPORTED_EVIDENCE_TYPES);

  for (const type of pilotTypes) {
    const memberships = [structured.has(type), semantic.has(type), unsupported.has(type)].filter(Boolean);
    expect(memberships).toHaveLength(1);
  }
});

test("retrieval registries keep structured semantic and unsupported evidence disjoint", () => {
  const groups = [
    new Set<string>(QA_STRUCTURED_EVIDENCE_TYPES),
    new Set<string>(QA_SEMANTIC_EVIDENCE_TYPES),
    new Set<string>(QA_EXPLICITLY_UNSUPPORTED_EVIDENCE_TYPES),
  ];
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      for (const value of groups[left]!) expect(groups[right]!.has(value)).toBe(false);
    }
  }
});

test("deterministic registry includes the core DSE-PMS evidence domains", () => {
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("programme-outcomes");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("clo-plo-mappings");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("course-teaching-philosophy");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("assessment-plan");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("weekly-workload");
});

test("semantic registry contains the document-backed pilot evidence types", () => {
  expect(QA_SEMANTIC_EVIDENCE_TYPES).toContain("curriculum-mapping");
  expect(QA_SEMANTIC_EVIDENCE_TYPES).toContain("teaching-review-records");
  expect(QA_SEMANTIC_EVIDENCE_TYPES).toContain("supporting-cv");
});

test("evidence candidate query requires both ids and validates topK", () => {
  expect(
    QaEvidenceCandidatesQuerySchema.safeParse({
      programmeId: "dse",
      expectedEvidenceId: "aun-qa-v4:1.2:evidence:1",
      topK: 5,
    }).success,
  ).toBe(true);
  expect(QaEvidenceCandidatesQuerySchema.safeParse({ programmeId: "dse" }).success).toBe(false);
  expect(
    QaEvidenceCandidatesQuerySchema.safeParse({
      programmeId: "dse",
      expectedEvidenceId: "e1",
      topK: 100,
    }).success,
  ).toBe(false);
});
