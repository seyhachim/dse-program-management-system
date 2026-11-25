/**
 * #1366: rank-based sample suggestions, not attainment thresholds or proof of
 * submitted work. Call only with authorized, exact-offering/version/item and
 * single-population source rows (individual, group OR individual component).
 * Source lookup, authorization and lecturer confirmation are separate gates.
 */
export type AssessmentSampleCandidate = {
  sourceId: string;
  score: number | null;
  maxScore: number | null;
  published: boolean;
  finalized: boolean;
  knownNonSubmission: boolean;
};

export type AssessmentSampleSuggestion = {
  sourceId: string;
  rank: "low" | "middle" | "high";
  percentage: number;
  tied: boolean;
};

export function suggestAssessmentSamples(
  candidates: readonly AssessmentSampleCandidate[],
): { eligibleCount: number; suggestions: AssessmentSampleSuggestion[] } {
  const seen = new Set<string>();
  const eligible: { sourceId: string; ratio: number }[] = [];
  for (const row of candidates) {
    if (!row.sourceId.trim() || seen.has(row.sourceId)) {
      throw new Error("Invalid or duplicate assessment sample source identity");
    }
    seen.add(row.sourceId);
    const { score, maxScore } = row;
    if (
      !row.published || !row.finalized || row.knownNonSubmission ||
      score === null || maxScore === null ||
      !Number.isFinite(score) || !Number.isFinite(maxScore) ||
      maxScore <= 0 || score < 0 || score > maxScore
    ) continue;
    eligible.push({ sourceId: row.sourceId, ratio: score / maxScore });
  }
  eligible.sort((a, b) => a.ratio - b.ratio ||
    (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
  const eligibleCount = eligible.length;
  const pick = (index: number, rank: AssessmentSampleSuggestion["rank"]): AssessmentSampleSuggestion => {
    const row = eligible[index]!;
    return {
      sourceId: row.sourceId,
      rank,
      percentage: row.ratio * 100,
      tied: eligible.some(other => other.sourceId !== row.sourceId && other.ratio === row.ratio),
    };
  };
  if (eligibleCount === 0) return { eligibleCount, suggestions: [] };
  if (eligibleCount === 1) return { eligibleCount, suggestions: [pick(0, "middle")] };
  const suggestions = [pick(0, "low")];
  if (eligibleCount >= 3) suggestions.push(pick(Math.floor((eligibleCount - 1) / 2), "middle"));
  suggestions.push(pick(eligibleCount - 1, "high"));
  return { eligibleCount, suggestions };
}
