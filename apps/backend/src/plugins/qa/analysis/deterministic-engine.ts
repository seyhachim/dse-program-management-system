import type {
  QaEvidenceAnalysisSourceView,
  QaEvidenceAnalysisView,
  QaEvidenceCandidateResultView,
  QaEvidenceScopeRequirement,
  QaExpectedEvidenceDefinitionView,
  QaQualityExpectationView,
  QaTemporalRule,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { getQaEvidenceCandidates } from "../evidence/service.ts";
import { qaService } from "../service.ts";
import {
  QaAnalysisResourceNotFoundError,
  createQaEvidenceAnalysis,
} from "./service.ts";
import {
  evaluateApplicability,
  matchEvidenceScope,
  matchEvidenceTime,
  meetsSourceAuthority,
  temporalMatchSupportsEvidence,
} from "./evidence-semantics.ts";
import {
  QA_DETERMINISTIC_RULE_VERSION,
  applyExpectationCrossChecks,
  buildDeterministicExplanation,
  determineExpectationState,
  evaluateExpectedEvidence,
  type QaEvidenceRuleFinding,
} from "./rules.ts";

function relevanceFor(definition: QaExpectedEvidenceDefinitionView): number {
  if (definition.role === "required") return 1;
  if (definition.role === "supportive") return 0.75;
  return 0.5;
}

type Candidate = QaEvidenceCandidateResultView["candidates"][number];

export type AssessedCandidate = {
  definition: QaExpectedEvidenceDefinitionView;
  candidate: Candidate;
  scopeMatch: "exact" | "partial" | "mismatch" | "unknown";
  temporalMatch:
    | "current"
    | "historicalRelevant"
    | "stale"
    | "future"
    | "insufficientHistory"
    | "unknown";
  authorityMatch: boolean | null;
  temporalRule: QaTemporalRule;
};

type BaseCandidateAssessment = Omit<AssessedCandidate, "temporalMatch"> & {
  candidateDate: Date | null;
};

function effectiveScopeRequirement(
  expectation: QaQualityExpectationView,
  definition: QaExpectedEvidenceDefinitionView,
): QaEvidenceScopeRequirement {
  return {
    requiredDimensions: [
      ...new Set([
        ...expectation.scopeRequirement.requiredDimensions,
        ...definition.scopeRequirement.requiredDimensions,
      ]),
    ],
  };
}

function effectiveTemporalRule(
  expectation: QaQualityExpectationView,
  definition: QaExpectedEvidenceDefinitionView,
): QaTemporalRule {
  // pointInTime is the compatibility/default rule. A stricter evidence-specific
  // rule wins; otherwise inherit the expectation-level rule.
  if (definition.temporalRule.kind !== "pointInTime") return definition.temporalRule;
  return expectation.temporalRule;
}

function candidateDate(candidate: Candidate): Date | null {
  if (!candidate.reportingDate) return null;
  const parsed = new Date(candidate.reportingDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Pure candidate assessment used by the deterministic engine. Exported so the
 * exact engine semantics can be regression-tested without database fixtures.
 */
export function assessCandidates(
  programmeId: string,
  expectation: QaQualityExpectationView,
  definition: QaExpectedEvidenceDefinitionView,
  result: QaEvidenceCandidateResultView,
  cycle: { reportingStart: Date; reportingEnd: Date },
): { finding: QaEvidenceRuleFinding; assessed: AssessedCandidate[] } {
  const scopeRequirement = effectiveScopeRequirement(expectation, definition);
  const temporalRule = effectiveTemporalRule(expectation, definition);
  const expectedScope = result.expectedScope ?? { programmeId };

  const baseAssessments = result.candidates.map((candidate): BaseCandidateAssessment => {
    const scope = candidate.scope ?? { programmeId };
    const provenance = candidate.provenance ?? {
      authority: "unknown" as const,
      ownerUnit: null,
      version: null,
      approvalStatus: null,
      sourceUri: candidate.route,
    };
    return {
      definition,
      candidate,
      scopeMatch: matchEvidenceScope(scopeRequirement, expectedScope, scope),
      authorityMatch: meetsSourceAuthority(definition.authorityRequirement, provenance),
      temporalRule,
      candidateDate: candidateDate(candidate),
    };
  });

  // Longitudinal/multi-period history must be made only from candidates that
  // could otherwise support the expectation. Wrong-scope, weak-authority,
  // future, invalid-date, and missing-period candidates cannot inflate history.
  const comparablePeriods = new Set(
    baseAssessments
      .filter(
        (item) =>
          item.scopeMatch === "exact" &&
          item.authorityMatch === true &&
          Boolean(item.candidate.periodKey) &&
          Boolean(item.candidateDate) &&
          item.candidateDate! <= cycle.reportingEnd,
      )
      .map((item) => item.candidate.periodKey as string),
  ).size;

  const assessed = baseAssessments.map(
    ({ candidateDate: parsedCandidateDate, ...item }): AssessedCandidate => ({
      ...item,
      temporalMatch: matchEvidenceTime(temporalRule, {
        cycleStart: cycle.reportingStart,
        cycleEnd: cycle.reportingEnd,
        candidateDate: parsedCandidateDate,
        comparablePeriods,
      }),
    }),
  );

  const acceptedKeys = new Set(
    assessed
      .filter(
        (item) =>
          item.scopeMatch === "exact" &&
          temporalMatchSupportsEvidence(item.temporalRule, item.temporalMatch) &&
          item.authorityMatch === true,
      )
      .map((item) => item.candidate.key),
  );

  const filtered: QaEvidenceCandidateResultView = {
    ...result,
    candidates: result.candidates.filter((candidate) => acceptedKeys.has(candidate.key)),
  };

  if (result.status === "supported" && filtered.candidates.length === 0 && assessed.length > 0) {
    const authorityAmbiguous = assessed.some((item) => item.authorityMatch !== true);
    const scopeAmbiguous = assessed.some(
      (item) => item.scopeMatch === "partial" || item.scopeMatch === "unknown",
    );
    const temporalAmbiguous = assessed.some((item) => item.temporalMatch === "unknown");
    if (authorityAmbiguous || scopeAmbiguous || temporalAmbiguous) {
      filtered.status = "unsupported";
      filtered.reason =
        "Candidates were retrieved, but source authority, scope, or temporal semantics are insufficient for deterministic support; expert review is required.";
    }
  }

  return { finding: evaluateExpectedEvidence(definition, filtered), assessed };
}

function sourceSnapshots(assessed: AssessedCandidate[]) {
  const snapshots = assessed.map((item) => {
    const candidate = item.candidate;
    return {
      sourceKind: "structuredCandidate" as const,
      candidateKey: candidate.key,
      sourceDomain: candidate.sourceDomain as QaEvidenceAnalysisSourceView["sourceDomain"],
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      qaEvidenceId: null,
      title: candidate.title,
      summary: candidate.summary,
      excerpt: candidate.summary,
      route: candidate.route,
      reportingDate: candidate.reportingDate ? new Date(candidate.reportingDate) : null,
      relevance: relevanceFor(item.definition),
      scope: candidate.scope ?? {},
      scopeMatch: item.scopeMatch,
      temporalMatch: item.temporalMatch,
      provenance: candidate.provenance ?? {
        authority: "unknown" as const,
        ownerUnit: null,
        version: null,
        approvalStatus: null,
        sourceUri: candidate.route,
      },
      authorityMatch: item.authorityMatch,
      periodKey: candidate.periodKey ?? null,
    };
  });

  const byKey = new Map(snapshots.map((snapshot) => [snapshot.candidateKey, snapshot]));
  return [...byKey.values()];
}

type StudentCohortMaturityRow = {
  id: string;
  intakeYear: number;
};

export function cohortStartDateFromIntakeYear(intakeYear: number): Date {
  return new Date(Date.UTC(intakeYear, 0, 1));
}

export function matureStudentCohortIds(
  rows: StudentCohortMaturityRow[],
  asOfDate: Date,
  minimumElapsedYears: number,
): string[] {
  return rows.filter((row) => {
    const maturityDate = cohortStartDateFromIntakeYear(row.intakeYear);
    maturityDate.setUTCFullYear(maturityDate.getUTCFullYear() + minimumElapsedYears);
    return asOfDate >= maturityDate;
  }).map((row) => row.id);
}

async function resolveStudentCohorts(programmeId: string): Promise<StudentCohortMaturityRow[]> {
  return prisma.studentCohort.findMany({
    where: { programmeId, status: { in: ["Active", "Completed", "Archived"] } },
    select: { id: true, intakeYear: true },
    orderBy: [{ intakeYear: "asc" }, { code: "asc" }],
  });
}

export async function runDeterministicQaAnalysis(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<QaEvidenceAnalysisView[]> {
  const [knowledge, cycle] = await Promise.all([
    qaService.getKnowledge(),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: { programmeId: true, reportingStart: true, reportingEnd: true },
    }),
  ]);
  if (!cycle || cycle.programmeId !== programmeId) {
    throw new QaAnalysisResourceNotFoundError("QA assessment cycle not found for programme");
  }
  const studentCohorts = await resolveStudentCohorts(programmeId);
  const cohortStartDates = studentCohorts.map((cohort) => cohortStartDateFromIntakeYear(cohort.intakeYear));

  const expectations = knowledge.expectations.filter(
    (expectation) => expectation.requirementCode === requirementCode,
  );
  if (expectations.length === 0) {
    throw new QaAnalysisResourceNotFoundError(
      "No active pilot quality expectation is registered for this requirement",
    );
  }

  const analyses: QaEvidenceAnalysisView[] = [];
  for (const expectation of expectations) {
    const applicability = evaluateApplicability(expectation.applicabilityRule, {
      cohortStartDates,
      asOfDate: cycle.reportingEnd,
    });
    const matureCohortIds = expectation.applicabilityRule.kind === "cohortMaturity"
      ? matureStudentCohortIds(studentCohorts, cycle.reportingEnd, expectation.applicabilityRule.minimumElapsedYears)
      : undefined;

    if (applicability.state !== "applicable") {
      analyses.push(
        await createQaEvidenceAnalysis({
          programmeId,
          cycleId,
          requirementCode,
          expectationId: expectation.id,
          applicability: applicability.state,
          applicabilityReason: applicability.reason,
          state: null,
          explanation:
            applicability.state === "notApplicable"
              ? `Expectation ${expectation.id} is not applicable for this cycle. ${applicability.reason}`
              : `Expectation ${expectation.id} applicability is uncertain. ${applicability.reason}`,
          confidence: null,
          uncertaintyNote:
            applicability.state === "uncertain"
              ? "Applicability requires human QA review before evidence-gap classification."
              : "Evidence coverage was intentionally not classified because the expectation is not yet applicable.",
          engine: "deterministic-rules",
          engineVersion: QA_DETERMINISTIC_RULE_VERSION,
          promptVersion: "",
          sources: [],
        }),
      );
      continue;
    }

    const assessedGroups = await Promise.all(
      expectation.expectedEvidence.map(async (definition) => {
        const result = await getQaEvidenceCandidates(programmeId, definition.id, { cohortIds: matureCohortIds });
        return assessCandidates(programmeId, expectation, definition, result, cycle);
      }),
    );
    const findings = applyExpectationCrossChecks(
      requirementCode,
      assessedGroups.map((group) => group.finding),
    );
    const { state, uncertaintyNote } = determineExpectationState(
      requirementCode,
      findings,
    );

    analyses.push(
      await createQaEvidenceAnalysis({
        programmeId,
        cycleId,
        requirementCode,
        expectationId: expectation.id,
        applicability: "applicable",
        applicabilityReason: applicability.reason,
        state,
        explanation: buildDeterministicExplanation(requirementCode, findings, state),
        confidence: null,
        uncertaintyNote,
        engine: "deterministic-rules",
        engineVersion: QA_DETERMINISTIC_RULE_VERSION,
        promptVersion: "",
        sources: sourceSnapshots(assessedGroups.flatMap((group) => group.assessed)),
      }),
    );
  }

  return analyses;
}
