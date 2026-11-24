import { expect, test } from "bun:test";
import {
  MarkingSchemeDefinitionSchema,
  summarizeMarkingSchemeScores,
} from "./assessment-instruments.ts";

const definition = {
  name: "WEF201 Midterm",
  questions: [
    { id: "Q1", title: "Web architecture", maxPoints: 6, markingGuidance: "" },
    { id: "Q2", title: "Problem-solving", maxPoints: 6, markingGuidance: "" },
    { id: "Q3", title: "Practical implementation", maxPoints: 8, markingGuidance: "" },
    { id: "Q4", title: "Testing and evaluation", maxPoints: 5, markingGuidance: "" },
  ],
};

test("supports heterogeneous question maxima and actual scores", () => {
  const result = summarizeMarkingSchemeScores(definition, [
    { questionId: "Q1", score: 5 },
    { questionId: "Q2", score: 4 },
    { questionId: "Q3", score: 7 },
    { questionId: "Q4", score: 2 },
  ]);
  expect(result.complete).toBe(true);
  expect(result.earnedPoints).toBe(18);
  expect(result.maximumPoints).toBe(25);
  expect(result.rows[2]).toEqual({ questionId: "Q3", score: 7, maxScore: 8 });
});

test("does not conflate zero, explicit null and omitted scores", () => {
  const result = summarizeMarkingSchemeScores(definition, [
    { questionId: "Q1", score: 0 },
    { questionId: "Q2", score: null },
  ]);
  expect(result.complete).toBe(false);
  expect(result.earnedPoints).toBeNull();
  expect(result.rows.map((row) => row.score)).toEqual([0, null, null, null]);
});

test("all zero scores are complete, not missing", () => {
  const result = summarizeMarkingSchemeScores(
    definition,
    definition.questions.map((q) => ({ questionId: q.id, score: 0 })),
  );
  expect(result.complete).toBe(true);
  expect(result.earnedPoints).toBe(0);
});

test("rejects invalid or duplicate question definitions", () => {
  expect(MarkingSchemeDefinitionSchema.safeParse({
    ...definition,
    questions: [definition.questions[0], definition.questions[0]],
  }).success).toBe(false);
  for (const maxPoints of [0, -1, Infinity, NaN]) {
    expect(MarkingSchemeDefinitionSchema.safeParse({
      ...definition,
      questions: [{ ...definition.questions[0], maxPoints }],
    }).success).toBe(false);
  }
});

test("rejects unknown, duplicate, negative, non-finite and excessive scores", () => {
  for (const scores of [
    [{ questionId: "unknown", score: 1 }],
    [{ questionId: "Q1", score: 1 }, { questionId: "Q1", score: null }],
    [{ questionId: "Q1", score: -1 }],
    [{ questionId: "Q1", score: Infinity }],
    [{ questionId: "Q1", score: 7 }],
  ]) {
    expect(() => summarizeMarkingSchemeScores(definition, scores)).toThrow();
  }
});

test("permits fractional marks for partial credit", () => {
  const result = summarizeMarkingSchemeScores(definition, [
    { questionId: "Q1", score: 3.5 },
    { questionId: "Q2", score: 4 },
    { questionId: "Q3", score: 6 },
    { questionId: "Q4", score: 2 },
  ]);
  expect(result.earnedPoints).toBe(15.5);
});
