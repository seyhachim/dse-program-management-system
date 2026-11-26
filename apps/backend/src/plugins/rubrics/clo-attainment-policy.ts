import type { InstitutionalPolicyRevision } from "@prisma/client";
import type { AuthUser } from "../../core/auth/token.ts";
import { policyAccess } from "./institutional-policy.ts";

/**
 * #1384 governance 3C.1: candidate-only domain contracts.
 * Not a runtime policy selector; never import into live grading or snapshot writers.
 * Institutional source metadata stays in the restricted register (#1361).
 */
export const CANDIDATE_CALCULATION_VERSION = "clo-attainment-policy-preview-v1";
export const CANDIDATE_BANDS = Object.freeze({
  "candidate-a": Object.freeze([40, 50, 70] as const),
  "candidate-b": Object.freeze([60, 70, 80] as const),
});
export type CandidateBand = keyof typeof CANDIDATE_BANDS;
export type AttainmentLevel = 0 | 1 | 2 | 3;

type RegisterRevision = Pick<InstitutionalPolicyRevision,
  "id" | "programmeId" | "topic" | "revision" | "status" | "classification" | "version" | "locator" | "verifiedAt">;

/** Pass only a server-loaded register revision, never a request-supplied record. */
export function bindCandidatePolicy(actor: AuthUser, programmeId: string, reference: RegisterRevision, band: CandidateBand) {
  if (!programmeId || policyAccess(actor, programmeId) !== "manage")
    throw new Error("Candidate policy review requires programme management access");
  if (reference.programmeId !== programmeId || reference.topic !== "obe" ||
      reference.classification !== "internal_staff" || reference.status !== "verified" ||
      !reference.id || !Number.isInteger(reference.revision) || reference.revision < 1 ||
      !reference.version?.trim() || !reference.locator?.trim() ||
      !reference.verifiedAt || !Number.isFinite(reference.verifiedAt.getTime()))
    throw new Error("A verified, exact programme OBE register revision is required");
  if (!Object.prototype.hasOwnProperty.call(CANDIDATE_BANDS, band))
    throw new Error("Unknown candidate attainment band");
  return Object.freeze({
    calculationVersion: CANDIDATE_CALCULATION_VERSION,
    programmeId,
    referenceId: reference.id,
    referenceRevision: reference.revision,
    band,
    lowerBounds: CANDIDATE_BANDS[band],
    individualThreshold: 60,
    directWeight: 0.8,
    indirectWeight: 0.2,
    overallTarget: 2,
    courseTargetPercentage: 75,
    status: "candidate" as const,
    activationAllowed: false as const,
  });
}

export type CandidatePolicy = ReturnType<typeof bindCandidatePolicy>;

function bounded(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`Invalid ${label}`);
  return value;
}

/** No rounding before comparing to thresholds. */
export function candidateStudentAttained(score: number | null): boolean | null {
  return score === null ? null : bounded(score, 0, 100, "student score") >= 60;
}

export function candidateDirectLevel(rate: number | null, band: CandidateBand): AttainmentLevel | null {
  if (!Object.prototype.hasOwnProperty.call(CANDIDATE_BANDS, band))
    throw new Error("Unknown candidate attainment band");
  if (rate === null) return null;
  bounded(rate, 0, 100, "attainment rate");
  const [low, moderate, high] = CANDIDATE_BANDS[band];
  return rate >= high ? 3 : rate >= moderate ? 2 : rate >= low ? 1 : 0;
}

export function candidateIndirectScore(meanRating: number | null): number | null {
  return meanRating === null ? null : bounded(meanRating, 1, 5, "survey mean") * 3 / 5;
}

/** A preview only. A missing component never becomes a zero or a reweighted score. */
export function previewCandidateOverall(policy: CandidatePolicy, directRate: number | null, surveyMean: number | null) {
  const directLevel = candidateDirectLevel(directRate, policy.band);
  const indirectScore = candidateIndirectScore(surveyMean);
  const overall = directLevel === null || indirectScore === null
    ? null : (directLevel * 80 + indirectScore * 20) / 100;
  return Object.freeze({
    policy,
    directRate,
    directLevel,
    indirectScore,
    overall,
    targetMet: overall === null ? null : overall >= policy.overallTarget,
    official: false as const,
  });
}

/**
 * Adapter for existing immutable snapshot counts. Retains evidence coverage and the
 * legacy measured-population rate separately. No official denominator is selected.
 * Incomplete/empty populations cannot yield a complete-population candidate rate.
 */
export function candidatePopulation(input: { populationSize: number; studentCount: number; achievedCount: number }) {
  const { populationSize, studentCount, achievedCount } = input;
  if (![populationSize, studentCount, achievedCount].every(n => Number.isSafeInteger(n) && n >= 0) ||
      achievedCount > studentCount || studentCount > populationSize)
    throw new Error("Invalid snapshot population counts");
  return Object.freeze({
    populationSize, studentCount, achievedCount,
    missingCount: populationSize - studentCount,
    measuredRate: studentCount === 0 ? null : achievedCount / studentCount * 100,
    coverage: populationSize === 0 ? null : studentCount / populationSize * 100,
    completePopulationRate: populationSize > 0 && studentCount === populationSize
      ? achievedCount / populationSize * 100 : null,
  });
}
