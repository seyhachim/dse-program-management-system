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

type AssessedCandidate = {
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
  if (definition.temporalRule.kind !== "withinCycle") return definition.temporalRule;
  return expectation.temporalRule;
}

function assessCandidates(
  programmeId: string,
  expectation: QaQualityExpectationView,
  definition: QaExpectedEvidenceDefinitionView,
  result: QaEvidenceCandidateResultView,
  cycle: { reportingStart: Date; reportingEnd: Date },
): { finding: QaEvidenceRuleFinding; assessed: AssessedCandidate[] } {
  const scopeRequirement = effectiveScopeRequirement(expectation, definition);
  const temporalRule = effectiveTemporalRule(expectation, definition);
  const periodCount = new Set(
    result.candidates
      .map((candidate) => candidate.periodKey)
      .filter((value): value is string => Boolean(value)),
  ).size;

  const assessed = result.candidates.map((candidate): AssessedCandidate => {
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
      scopeMatch: matchEvidenceScope(scopeRequirement, { programmeId }, scope),
      temporalMatch: matchEvidenceTime(temporalRule, {
        cycleStart: cycle.reportingStart,
        cycleEnd: cycle.reportingEnd,
        candidateDate: candidate.reportingDate ? new Date(candidate.reportingDate) : null,
        comparablePeriods: periodCount,
      }),
      authorityMatch: meetsSourceAuthority(definition.authorityRequirement, provenance),
    };
  });

  const acceptedKeys = new Set(
    assessed
      .filter(
        (item) =>
          item.scopeMatch === "exact" &&
          item.temporalMatch === "current" &&
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
      provenance: candidate.provenance ?? { authority: "unknown" as const },
      authorityMatch: item.authorityMatch,
      periodKey: candidate.periodKey ?? null,
    };
  });

  const byKey = new Map(snapshots.map((snapshot) => [snapshot.candidateKey, snapshot]));
  return [...byKey.values()];
}

async function resolveCohortStartDate(programmeId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ effectiveFrom: Date | null; intakeYear: number | null }>>`
    SELECT v."effectiveFrom", v."intakeYear"
    FROM "ProgrammeCurriculumVersion" v
    JOIN "ProgrammeCurriculum" c ON c.id = v."curriculumId"
    WHERE c."programmeId" = ${programmeId}
      AND v.status = 'Active'
    ORDER BY v."effectiveFrom" DESC NULLS LAST, v."createdAt" DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.effectiveFrom) return row.effectiveFrom;
  return row.intakeYear ? new Date(Date.UTC(row.intakeYear, 0, 1)) : null;
}

export async function runDeterministicQaAnalysis(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<QaEvidenceAnalysisView[]> {
  const [knowledge, cycle, cohortStartDate] = await Promise.all([
    qaService.getKnowledge(),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: { programmeId: true, reportingStart: true, reportingEnd: true },
    }),
    resolveCohortStartDate(programmeId),
  ]);
  if (!cycle || cycle.programmeId !== programmeId) {
    throw new QaAnalysisResourceNotFoundError("QA assessment cycle not found for programme");
  }

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
      cohortStartDate,
      asOfDate: cycle.reportingEnd,
    });

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
        const result = await getQaEvidenceCandidates(programmeId, definition.id);
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
