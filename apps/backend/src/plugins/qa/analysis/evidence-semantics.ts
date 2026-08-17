import type {
  QaApplicabilityRule,
  QaApplicabilityState,
  QaEvidenceProvenance,
  QaEvidenceScope,
  QaEvidenceScopeDimension,
  QaEvidenceScopeRequirement,
  QaScopeMatch,
  QaSourceAuthorityRequirement,
  QaTemporalMatch,
  QaTemporalRule,
} from "@dse-pms/shared-types";
import { QA_SOURCE_AUTHORITY_ORDER } from "@dse-pms/shared-types";

export interface QaApplicabilityContext {
  cohortStartDate?: Date | null;
  asOfDate: Date;
}

export interface QaApplicabilityDecision {
  state: QaApplicabilityState;
  reason: string;
}

export function evaluateApplicability(
  rule: QaApplicabilityRule,
  context: QaApplicabilityContext,
): QaApplicabilityDecision {
  if (rule.kind === "always") {
    return { state: "applicable", reason: "Expectation is always applicable." };
  }

  if (!context.cohortStartDate) {
    return {
      state: "uncertain",
      reason: "Cohort maturity cannot be established because the cohort start date is unavailable.",
    };
  }

  const maturityDate = new Date(context.cohortStartDate);
  maturityDate.setUTCFullYear(maturityDate.getUTCFullYear() + rule.minimumElapsedYears);

  return context.asOfDate >= maturityDate
    ? {
        state: "applicable",
        reason: `Cohort has reached the required ${rule.minimumElapsedYears}-year maturity threshold.`,
      }
    : {
        state: "notApplicable",
        reason: `Cohort has not yet reached the required ${rule.minimumElapsedYears}-year maturity threshold.`,
      };
}

const SCOPE_KEYS: Record<QaEvidenceScopeDimension, keyof QaEvidenceScope> = {
  programme: "programmeId",
  academicYear: "academicYear",
  term: "term",
  course: "courseId",
  courseSpecVersion: "courseSpecVersionId",
  offering: "offeringId",
  cohort: "cohortId",
  assessment: "assessmentId",
  population: "population",
};

export function matchEvidenceScope(
  requirement: QaEvidenceScopeRequirement,
  expected: QaEvidenceScope,
  candidate: QaEvidenceScope,
): QaScopeMatch {
  if (requirement.requiredDimensions.length === 0) return "exact";

  let matched = 0;
  let unknown = 0;
  for (const dimension of requirement.requiredDimensions) {
    const key = SCOPE_KEYS[dimension];
    const expectedValue = expected[key];
    const candidateValue = candidate[key];

    if (!candidateValue) {
      unknown += 1;
      continue;
    }
    // A programme-wide expectation can require a dimension to be present without
    // naming one target value (for example every candidate must identify its course).
    // When a target value is supplied, mismatches remain explicit.
    if (expectedValue && expectedValue !== candidateValue) return "mismatch";
    matched += 1;
  }

  if (matched === requirement.requiredDimensions.length) return "exact";
  if (matched > 0) return "partial";
  return unknown > 0 ? "unknown" : "mismatch";
}

export interface QaTemporalContext {
  cycleStart: Date;
  cycleEnd: Date;
  candidateDate?: Date | null;
  comparablePeriods?: number;
}

export function matchEvidenceTime(
  rule: QaTemporalRule,
  context: QaTemporalContext,
): QaTemporalMatch {
  if (context.candidateDate && context.candidateDate > context.cycleEnd) return "future";

  if (rule.kind === "multiPeriod" || rule.kind === "longitudinal") {
    const periods = context.comparablePeriods ?? 0;
    return periods >= rule.minimumPeriods ? "current" : "insufficientHistory";
  }

  if (!context.candidateDate) return "unknown";

  if (rule.kind === "withinCycle" || rule.kind === "pointInTime") {
    if (context.candidateDate >= context.cycleStart) return "current";
    return "historicalRelevant";
  }

  const ageMs = context.cycleEnd.getTime() - context.candidateDate.getTime();
  const maximumAgeMs = rule.maximumAgeDays * 24 * 60 * 60 * 1000;
  return ageMs <= maximumAgeMs ? "current" : "stale";
}

/** Whether the temporal decision can support coverage for this rule. */
export function temporalMatchSupportsEvidence(
  rule: QaTemporalRule,
  match: QaTemporalMatch,
): boolean {
  if (match === "current") return true;
  // Compatibility / point-in-time evidence may be older than the reporting-cycle
  // start while still being the authoritative current record. Explicit withinCycle,
  // recent, multiPeriod and longitudinal rules remain strict.
  return rule.kind === "pointInTime" && match === "historicalRelevant";
}

export function meetsSourceAuthority(
  requirement: QaSourceAuthorityRequirement,
  provenance: QaEvidenceProvenance,
): boolean | null {
  if (
    requirement.minimumAuthority === "unknown" &&
    (!requirement.acceptableAuthorities || requirement.acceptableAuthorities.length === 0)
  ) {
    return true;
  }
  if (provenance.authority === "unknown") return null;
  if (
    requirement.acceptableAuthorities &&
    !requirement.acceptableAuthorities.includes(provenance.authority)
  ) {
    return false;
  }

  const candidateRank = QA_SOURCE_AUTHORITY_ORDER.indexOf(provenance.authority);
  const minimumRank = QA_SOURCE_AUTHORITY_ORDER.indexOf(requirement.minimumAuthority);
  return candidateRank >= minimumRank;
}
