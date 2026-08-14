import { expect, test } from "bun:test";
import {
  QA_LLM_PROMPT_VERSION,
  QaLlmEvidenceMatchOutputSchema,
  RunQaLlmAnalysisSchema,
} from "./index.ts";

const valid = {
  state: "evidenceIdentified" as const,
  explanation: "The supplied CLO to PLO mapping candidate directly supports the expectation.",
  confidence: 0.86,
  uncertaintyNote: "This is evidence matching only, not an accreditation judgment.",
  usedCandidateKeys: ["clo-plo-mappings:CourseSpec:spec-1"],
};

test("LLM QA prompt version is explicit and stable", () => {
  expect(QA_LLM_PROMPT_VERSION).toBe("qa-evidence-match-v1");
});

test("LLM evidence output uses a strict no-score contract", () => {
  expect(QaLlmEvidenceMatchOutputSchema.safeParse(valid).success).toBe(true);
  expect(
    QaLlmEvidenceMatchOutputSchema.safeParse({ ...valid, rating: 5 }).success,
  ).toBe(false);
  expect(
    QaLlmEvidenceMatchOutputSchema.safeParse({ ...valid, accreditationResult: "pass" }).success,
  ).toBe(false);
});

test("evidence identified must cite at least one supplied candidate key", () => {
  expect(
    QaLlmEvidenceMatchOutputSchema.safeParse({ ...valid, usedCandidateKeys: [] }).success,
  ).toBe(false);
  expect(
    QaLlmEvidenceMatchOutputSchema.safeParse({
      ...valid,
      state: "expertReviewRequired",
      usedCandidateKeys: [],
    }).success,
  ).toBe(true);
});

test("LLM candidate references must be unique", () => {
  expect(
    QaLlmEvidenceMatchOutputSchema.safeParse({
      ...valid,
      usedCandidateKeys: [valid.usedCandidateKeys[0], valid.usedCandidateKeys[0]],
    }).success,
  ).toBe(false);
});

test("LLM analysis trigger remains programme-scoped", () => {
  expect(RunQaLlmAnalysisSchema.safeParse({ programmeId: "dse" }).success).toBe(true);
  expect(RunQaLlmAnalysisSchema.safeParse({}).success).toBe(false);
});
