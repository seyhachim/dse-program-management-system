import { expect, test } from "bun:test";
import {
  CreateQaEvaluationHumanRatingSchema,
  CreateQaEvaluationRunSchema,
  CreateQaEvaluationScenarioSchema,
  SetQaEvaluationGoldSchema,
} from "./index.ts";

const scenarioId = "123e4567-e89b-12d3-a456-426614174000";
const evidenceId = "223e4567-e89b-12d3-a456-426614174000";

test("controlled QA scenario requires a real AUN-QA requirement/expectation reference", () => {
  expect(
    CreateQaEvaluationScenarioSchema.safeParse({
      requirementCode: "1.2",
      expectationId: "aun-qa-v4:1.2:expectation:1",
      name: "Complete CLO-PLO evidence",
      description: "A controlled scenario with complete structured alignment evidence.",
      evidence: [
        {
          sourceDomain: "courseSpec",
          label: "CLO-PLO map",
          text: "All active CLOs are mapped to at least one PLO.",
        },
      ],
    }).success,
  ).toBe(true);
  expect(
    CreateQaEvaluationScenarioSchema.safeParse({
      requirementCode: "bad",
      expectationId: "e1",
      name: "Bad",
      description: "This invalid requirement code should fail validation.",
      evidence: [],
    }).success,
  ).toBe(false);
});

test("human gold annotation rejects duplicate evidence judgments", () => {
  expect(
    SetQaEvaluationGoldSchema.safeParse({
      goldState: "evidenceIdentified",
      note: "Expert reference annotation.",
      evidenceJudgments: [
        { evidenceId, relevant: true },
        { evidenceId, relevant: false },
      ],
    }).success,
  ).toBe(false);
});

test("prototype evaluation run preserves engine/prompt version and unique retrieved evidence", () => {
  const base = {
    scenarioId,
    predictedState: "expertReviewRequired" as const,
    engine: "llm-assisted",
    engineVersion: "model-a",
    promptVersion: "qa-evidence-match-v1",
    explanation: "The evidence is potentially relevant but requires expert interpretation.",
    retrievedEvidence: [{ scenarioEvidenceId: evidenceId, relevance: 0.8 }],
  };
  expect(CreateQaEvaluationRunSchema.safeParse(base).success).toBe(true);
  expect(
    CreateQaEvaluationRunSchema.safeParse({
      ...base,
      retrievedEvidence: [base.retrievedEvidence[0], base.retrievedEvidence[0]],
    }).success,
  ).toBe(false);
});

test("human usefulness ratings are constrained to the 1-5 study scale", () => {
  const base = {
    evidenceRelevance: 4,
    explanationClarity: 5,
    understandability: 4,
    usefulness: 4,
    traceability: 5,
    comment: "Clear and traceable.",
  };
  expect(CreateQaEvaluationHumanRatingSchema.safeParse(base).success).toBe(true);
  expect(
    CreateQaEvaluationHumanRatingSchema.safeParse({ ...base, usefulness: 6 }).success,
  ).toBe(false);
});
