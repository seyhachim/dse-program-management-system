import { expect, test } from "bun:test";
import {
  AUN_QA_V4_PILOT_KNOWLEDGE,
  QA_EXPLICITLY_UNSUPPORTED_EVIDENCE_TYPES,
  QA_STRUCTURED_EVIDENCE_TYPES,
  QaEvidenceCandidatesQuerySchema,
} from "./index.ts";

test("every pilot evidence type is either deterministically supported or explicitly unsupported", () => {
  const pilotTypes = new Set(
    AUN_QA_V4_PILOT_KNOWLEDGE.flatMap((item) => item.evidence.map((entry) => entry[0])),
  );
  const supported = new Set<string>(QA_STRUCTURED_EVIDENCE_TYPES);
  const unsupported = new Set<string>(QA_EXPLICITLY_UNSUPPORTED_EVIDENCE_TYPES);

  for (const type of pilotTypes) {
    expect(supported.has(type) || unsupported.has(type)).toBe(true);
  }
  for (const type of supported) {
    expect(unsupported.has(type)).toBe(false);
  }
});

test("deterministic registry includes the core DSE-PMS evidence domains", () => {
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("programme-outcomes");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("clo-plo-mappings");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("course-teaching-philosophy");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("assessment-plan");
  expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain("weekly-workload");
});

test("evidence candidate query requires both programme and expected evidence ids", () => {
  expect(
    QaEvidenceCandidatesQuerySchema.safeParse({
      programmeId: "dse",
      expectedEvidenceId: "aun-qa-v4:1.2:evidence:1",
    }).success,
  ).toBe(true);
  expect(QaEvidenceCandidatesQuerySchema.safeParse({ programmeId: "dse" }).success).toBe(false);
});
