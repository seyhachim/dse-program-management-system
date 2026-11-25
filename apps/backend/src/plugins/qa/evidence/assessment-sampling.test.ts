import { describe, expect, test } from "bun:test";
import { suggestAssessmentSamples, type AssessmentSampleCandidate } from "./assessment-sampling.ts";

function candidate(sourceId: string, score: number | null, maxScore: number | null = 100, overrides: Partial<AssessmentSampleCandidate> = {}): AssessmentSampleCandidate {
  return { sourceId, score, maxScore, published: true, finalized: true, knownNonSubmission: false, ...overrides };
}

describe("assessment evidence sample suggestions", () => {
  test("uses normalized scores, not raw scores; includes assessed zero", () => {
    const result = suggestAssessmentSamples([
      candidate("high", 9, 10), candidate("middle", 50), candidate("low", 0),
    ]);
    expect(result.eligibleCount).toBe(3);
    expect(result.suggestions).toEqual([
      { sourceId: "low", rank: "low", percentage: 0, tied: false },
      { sourceId: "middle", rank: "middle", percentage: 50, tied: false },
      { sourceId: "high", rank: "high", percentage: 90, tied: false },
    ]);
  });

  test("excludes missing, invalid, draft, unfinalized and known non-submissions", () => {
    expect(suggestAssessmentSamples([
      candidate("missing", null), candidate("missingMax", 2, null),
      candidate("negative", -1), candidate("excess", 101),
      candidate("zeroMax", 0, 0), candidate("negativeMax", 0, -1),
      candidate("nan", NaN), candidate("infinite", 1, Infinity),
      candidate("draft", 80, 100, { published: false }),
      candidate("unfinalized", 80, 100, { finalized: false }),
      candidate("absent", 0, 100, { knownNonSubmission: true }),
    ])).toEqual({ eligibleCount: 0, suggestions: [] });
  });

  test("small cohorts never produce duplicate suggestions", () => {
    expect(suggestAssessmentSamples([]).suggestions).toEqual([]);
    expect(suggestAssessmentSamples([candidate("a", 10)]).suggestions.map(x => x.rank)).toEqual(["middle"]);
    expect(suggestAssessmentSamples([candidate("a", 10), candidate("b", 20)]).suggestions.map(x => x.rank)).toEqual(["low", "high"]);
  });

  test("ties are disclosed and deterministic, including identical performance", () => {
    const rows = [candidate("d", 50), candidate("c", 5, 10), candidate("b", 25, 50), candidate("a", 1, 2)];
    const result = suggestAssessmentSamples(rows);
    expect(result.suggestions.map(x => x.sourceId)).toEqual(["a", "b", "d"]);
    expect(result.suggestions.every(x => x.tied)).toBe(true);
    expect(suggestAssessmentSamples([...rows].reverse())).toEqual(result);
  });

  test("duplicate or empty source identity fails closed", () => {
    expect(() => suggestAssessmentSamples([candidate("a", 10), candidate("a", null)])).toThrow();
    expect(() => suggestAssessmentSamples([candidate(" ", 10)])).toThrow();
  });

  test("does not mutate caller order or values", () => {
    const rows = Object.freeze([Object.freeze(candidate("b", 90)), Object.freeze(candidate("a", 20))]);
    suggestAssessmentSamples(rows);
    expect(rows.map(x => x.sourceId)).toEqual(["b", "a"]);
  });
});
