import {
  QA_LLM_PROMPT_VERSION,
  QA_PILOT_EXPECTED_SCENARIO_COUNT,
  QA_PILOT_REQUIREMENT_CODES,
  QA_PILOT_SCENARIO_VERSION,
  QaLlmEvidenceMatchOutputSchema,
  type QaEvidenceCandidateResultView,
  type QaEvidenceCandidateView,
  type QaEvidenceScopeRequirement,
  type QaEvaluationEvidenceView,
  type QaEvaluationRunView,
  type QaExpectedEvidenceDefinitionView,
  type QaPilotStatusView,
  type QaQualityExpectationView,
  type QaTemporalRule,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { qaService } from "../service.ts";
import {
  evaluateApplicability,
  matchEvidenceScope,
  matchEvidenceTime,
  meetsSourceAuthority,
  temporalMatchSupportsEvidence,
} from "../analysis/evidence-semantics.ts";
import {
  QaLlmProviderError,
  configuredQaLlmProvider,
  type QaLlmProvider,
} from "../analysis/llm-provider.ts";
import {
  QA_DETERMINISTIC_RULE_VERSION,
  applyExpectationCrossChecks,
  buildDeterministicExplanation,
  determineExpectationState,
  evaluateExpectedEvidence,
  type QaEvidenceRuleFinding,
} from "../analysis/rules.ts";
import {
  QaEvaluationResourceNotFoundError,
  createQaEvaluationRun,
  listQaEvaluationScenarios,
} from "./service.ts";

export class QaPilotReferenceRequiredError extends Error {}
export class QaPilotScenarioError extends Error {}
export class QaPilotLlmUnavailableError extends Error {}
export class QaPilotLlmOutputValidationError extends Error {}

interface ControlledCandidateAssessment {
  evidence: QaEvaluationEvidenceView;
  candidate: QaEvidenceCandidateView;
  definition: QaExpectedEvidenceDefinitionView;
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
}

function candidateFromEvidence(evidence: QaEvaluationEvidenceView): QaEvidenceCandidateView {
  return {
    key: `pilot-evidence:${evidence.id}`,
    evidenceType: evidence.evidenceType || "controlled-context",
    sourceDomain: evidence.sourceDomain,
    title: evidence.label,
    summary: evidence.text,
    entityType: evidence.entityType,
    entityId: evidence.id,
    route: null,
    reportingDate: evidence.reportingDate,
    scope: evidence.scope,
    provenance: evidence.provenance,
    periodKey: evidence.periodKey,
    attributes: evidence.attributes,
  };
}

async function loadPilotScenario(scenarioId: string) {
  const [scenario, knowledge] = await Promise.all([
    listQaEvaluationScenarios().then((items) => items.find((item) => item.id === scenarioId)),
    qaService.getKnowledge(),
  ]);
  if (!scenario) throw new QaEvaluationResourceNotFoundError("Evaluation scenario not found");
  if (!scenario.name.startsWith(`${QA_PILOT_SCENARIO_VERSION}:`)) {
    throw new QaPilotScenarioError("Only initialized AUN-QA pilot scenarios can use the pilot runner");
  }
  if (scenario.goldApplicability === null) {
    throw new QaPilotReferenceRequiredError(
      "Lock the independent human applicability/reference classification before running the prototype on this scenario",
    );
  }
  const expectation = knowledge.expectations.find((item) => item.id === scenario.expectationId);
  if (!expectation || expectation.requirementCode !== scenario.requirementCode) {
    throw new QaPilotScenarioError("Pilot scenario no longer matches the active QA knowledge model");
  }
  return { scenario, expectation };
}

function parseControlledDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function controlledCycle(evidence: QaEvaluationEvidenceView[]) {
  const explicitStart = evidence
    .map((item) => parseControlledDate(item.attributes.cycleStartDate))
    .find((value): value is Date => Boolean(value));
  const explicitEnd = evidence
    .map((item) => parseControlledDate(item.attributes.cycleEndDate))
    .find((value): value is Date => Boolean(value));
  if (explicitStart && explicitEnd) {
    return { reportingStart: explicitStart, reportingEnd: explicitEnd };
  }

  const dates = evidence
    .map((item) => parseControlledDate(item.reportingDate))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime());
  const year = dates[0]?.getUTCFullYear() ?? 2026;
  return {
    reportingStart: new Date(Date.UTC(year, 0, 1)),
    reportingEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

function controlledApplicability(
  expectation: QaQualityExpectationView,
  evidence: QaEvaluationEvidenceView[],
) {
  if (expectation.applicabilityRule.kind === "always") {
    return evaluateApplicability(expectation.applicabilityRule, {
      asOfDate: controlledCycle(evidence).reportingEnd,
      cohortStartDate: null,
    });
  }

  const cohortStartDate = evidence
    .map((item) => parseControlledDate(item.attributes.cohortStartDate))
    .find((value): value is Date => Boolean(value));
  const explicitAsOfDate = evidence
    .map((item) => parseControlledDate(item.attributes.asOfDate))
    .find((value): value is Date => Boolean(value));
  const asOfDate = explicitAsOfDate ?? controlledCycle(evidence).reportingEnd;

  return evaluateApplicability(expectation.applicabilityRule, {
    cohortStartDate: cohortStartDate ?? null,
    asOfDate,
  });
}

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
  return definition.temporalRule.kind === "pointInTime"
    ? expectation.temporalRule
    : definition.temporalRule;
}

function assessControlledDefinition(
  expectation: QaQualityExpectationView,
  definition: QaExpectedEvidenceDefinitionView,
  evidence: QaEvaluationEvidenceView[],
): { finding: QaEvidenceRuleFinding; assessments: ControlledCandidateAssessment[] } {
  const matchingEvidence = evidence.filter((item) => item.evidenceType === definition.evidenceType);
  const periodCount = new Set(
    matchingEvidence.map((item) => item.periodKey).filter((value): value is string => Boolean(value)),
  ).size;
  const temporalRule = effectiveTemporalRule(expectation, definition);
  const cycle = controlledCycle(evidence);

  const assessments = matchingEvidence.map((item): ControlledCandidateAssessment => {
    const candidate = candidateFromEvidence(item);
    return {
      evidence: item,
      candidate,
      definition,
      scopeMatch: matchEvidenceScope(
        effectiveScopeRequirement(expectation, definition),
        { programmeId: "controlled-evaluation" },
        candidate.scope ?? {},
      ),
      temporalMatch: matchEvidenceTime(temporalRule, {
        cycleStart: cycle.reportingStart,
        cycleEnd: cycle.reportingEnd,
        candidateDate: candidate.reportingDate ? new Date(candidate.reportingDate) : null,
        comparablePeriods: periodCount,
      }),
      authorityMatch: meetsSourceAuthority(
        definition.authorityRequirement,
        candidate.provenance ?? { authority: "unknown" },
      ),
      temporalRule,
    };
  });

  const acceptedKeys = new Set(
    assessments
      .filter(
        (item) =>
          item.scopeMatch === "exact" &&
          temporalMatchSupportsEvidence(item.temporalRule, item.temporalMatch) &&
          item.authorityMatch === true,
      )
      .map((item) => item.candidate.key),
  );

  const result: QaEvidenceCandidateResultView = {
    programmeId: "controlled-evaluation",
    expectedEvidenceId: definition.id,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    status: "supported",
    reason: "Controlled evidence was evaluated against declared scope, temporal, and authority semantics.",
    candidates: assessments
      .filter((item) => acceptedKeys.has(item.candidate.key))
      .map((item) => item.candidate),
  };

  if (result.candidates.length === 0 && assessments.length > 0) {
    const ambiguous = assessments.some(
      (item) =>
        item.scopeMatch === "partial" ||
        item.scopeMatch === "unknown" ||
        item.temporalMatch === "unknown" ||
        item.authorityMatch === null,
    );
    if (ambiguous) {
      result.status = "unsupported";
      result.reason =
        "Controlled candidates have unresolved scope, temporal, or provenance semantics and require expert review.";
    }
  }

  return {
    finding: evaluateExpectedEvidence(definition, result),
    assessments,
  };
}

function controlledGroups(
  expectation: QaQualityExpectationView,
  evidence: QaEvaluationEvidenceView[],
) {
  return expectation.expectedEvidence.map((definition) =>
    assessControlledDefinition(expectation, definition, evidence),
  );
}

export async function runDeterministicQaPilotScenario(
  scenarioId: string,
): Promise<QaEvaluationRunView> {
  const { scenario, expectation } = await loadPilotScenario(scenarioId);
  const applicability = controlledApplicability(expectation, scenario.evidence);
  if (applicability.state !== "applicable") {
    return createQaEvaluationRun({
      scenarioId: scenario.id,
      predictedApplicability: applicability.state,
      predictedState: null,
      engine: "deterministic-rules",
      engineVersion: QA_DETERMINISTIC_RULE_VERSION,
      promptVersion: "",
      explanation: applicability.reason,
      retrievedEvidence: [],
    });
  }

  const groups = controlledGroups(expectation, scenario.evidence);
  const findings = applyExpectationCrossChecks(
    scenario.requirementCode,
    groups.map((group) => group.finding),
  );
  const { state } = determineExpectationState(scenario.requirementCode, findings);
  const explanation = buildDeterministicExplanation(scenario.requirementCode, findings, state);
  const consideredEvidenceIds = new Set(
    findings.flatMap((finding) => finding.result.candidates.map((candidate) => candidate.entityId)),
  );

  return createQaEvaluationRun({
    scenarioId: scenario.id,
    predictedApplicability: "applicable",
    predictedState: state,
    engine: "deterministic-rules",
    engineVersion: QA_DETERMINISTIC_RULE_VERSION,
    promptVersion: "",
    explanation,
    retrievedEvidence: scenario.evidence
      .filter((item) => consideredEvidenceIds.has(item.id))
      .map((item) => ({ scenarioEvidenceId: item.id, relevance: null })),
  });
}

function scoringGuard(text: string): void {
  if (/\b(?:rating|score)\s*(?:is|=|:)?\s*[1-7](?:\s*\/\s*7)?\b/i.test(text)) {
    throw new QaPilotLlmOutputValidationError(
      "Pilot LLM output attempted to assign an AUN-QA-style numeric rating or score",
    );
  }
}

function pilotPrompt(options: {
  requirementCode: string;
  expectation: { statement: string; purpose: string };
  expectedEvidence: Array<{
    evidenceType: string;
    description: string;
    role: string;
    candidateKeys: string[];
  }>;
  assessments: ControlledCandidateAssessment[];
}) {
  const accepted = options.assessments.filter(
    (item) =>
      item.scopeMatch === "exact" &&
      temporalMatchSupportsEvidence(item.temporalRule, item.temporalMatch) &&
      item.authorityMatch === true,
  );
  return [
    {
      role: "system" as const,
      content:
        "You are an evidence-matching assistant for higher-education quality assurance. Your task is only to determine whether the supplied controlled evidence context supports the stated quality expectation. Do not assign, predict, recommend, or imply any official AUN-QA rating, score, pass/fail, accreditation decision, or institutional quality judgment. A missing evidence record is an evidence gap, not proof of poor quality. Use only candidate keys supplied by the user. Candidates rejected by deterministic scope/time/authority semantics are not supplied. If the remaining evidence is partial, conflicting, or interpretation depends on academic/QA expertise, use expertReviewRequired. Return JSON only with exactly these fields: state, explanation, confidence, uncertaintyNote, usedCandidateKeys. state must be evidenceIdentified, potentialEvidenceGap, or expertReviewRequired. confidence is 0..1 or null. usedCandidateKeys must be a subset of the supplied candidate keys.",
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          promptVersion: QA_LLM_PROMPT_VERSION,
          requirementCode: options.requirementCode,
          qualityExpectation: options.expectation,
          expectedEvidence: options.expectedEvidence,
          candidates: accepted.map((item) => ({
            key: item.candidate.key,
            evidenceType: item.candidate.evidenceType,
            sourceDomain: item.candidate.sourceDomain,
            title: item.candidate.title,
            summary: item.candidate.summary,
            reportingDate: item.candidate.reportingDate,
            scope: item.candidate.scope,
            scopeMatch: item.scopeMatch,
            temporalMatch: item.temporalMatch,
            provenance: item.candidate.provenance,
            authorityMatch: item.authorityMatch,
            periodKey: item.candidate.periodKey,
            attributes: item.candidate.attributes,
          })),
        },
        null,
        2,
      ),
    },
  ];
}

export async function runLlmQaPilotScenario(
  scenarioId: string,
  provider: QaLlmProvider | null = configuredQaLlmProvider(),
): Promise<QaEvaluationRunView> {
  const { scenario, expectation } = await loadPilotScenario(scenarioId);
  const applicability = controlledApplicability(expectation, scenario.evidence);
  if (applicability.state !== "applicable") {
    return createQaEvaluationRun({
      scenarioId: scenario.id,
      predictedApplicability: applicability.state,
      predictedState: null,
      engine: "llm-assisted",
      engineVersion: provider?.model ?? "not-invoked",
      promptVersion: QA_LLM_PROMPT_VERSION,
      explanation: `${applicability.reason} LLM evidence classification was not invoked.`,
      retrievedEvidence: [],
    });
  }
  if (!provider) {
    throw new QaPilotLlmUnavailableError(
      "QA LLM provider is not configured. Set QA_LLM_API_URL and QA_LLM_MODEL before running LLM pilot analysis.",
    );
  }

  const groups = controlledGroups(expectation, scenario.evidence);
  const assessments = groups.flatMap((group) => group.assessments);
  const accepted = assessments.filter(
    (item) =>
      item.scopeMatch === "exact" &&
      temporalMatchSupportsEvidence(item.temporalRule, item.temporalMatch) &&
      item.authorityMatch === true,
  );
  if (accepted.length === 0) {
    const ambiguous = assessments.some(
      (item) =>
        item.scopeMatch === "partial" ||
        item.scopeMatch === "unknown" ||
        item.temporalMatch === "unknown" ||
        item.authorityMatch === null,
    );
    return createQaEvaluationRun({
      scenarioId: scenario.id,
      predictedApplicability: "applicable",
      predictedState: ambiguous ? "expertReviewRequired" : "potentialEvidenceGap",
      engine: "llm-assisted",
      engineVersion: provider.model,
      promptVersion: QA_LLM_PROMPT_VERSION,
      explanation: ambiguous
        ? "Controlled evidence semantics are unresolved; LLM content classification was bypassed."
        : "No controlled evidence candidate satisfied declared scope, temporal, and authority requirements; LLM content classification was bypassed.",
      retrievedEvidence: [],
    });
  }

  const candidateByKey = new Map(accepted.map((item) => [item.candidate.key, item]));
  let raw: unknown;
  try {
    raw = await provider.completeJson(
      pilotPrompt({
        requirementCode: scenario.requirementCode,
        expectation: { statement: expectation.statement, purpose: expectation.purpose },
        expectedEvidence: expectation.expectedEvidence.map((definition) => ({
          evidenceType: definition.evidenceType,
          description: definition.description,
          role: definition.role,
          candidateKeys: accepted
            .filter((item) => item.definition.id === definition.id)
            .map((item) => item.candidate.key),
        })),
        assessments,
      }),
    );
  } catch (error) {
    if (error instanceof QaLlmProviderError) throw error;
    throw new QaLlmProviderError("QA pilot LLM provider call failed");
  }

  const parsed = QaLlmEvidenceMatchOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new QaPilotLlmOutputValidationError(
      `QA pilot LLM output failed schema validation: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  scoringGuard(`${parsed.data.explanation}\n${parsed.data.uncertaintyNote}`);
  const invented = parsed.data.usedCandidateKeys.find((key) => !candidateByKey.has(key));
  if (invented) {
    throw new QaPilotLlmOutputValidationError(
      `QA pilot LLM referenced an evidence candidate that was not supplied: ${invented}`,
    );
  }

  return createQaEvaluationRun({
    scenarioId: scenario.id,
    predictedApplicability: "applicable",
    predictedState: parsed.data.state,
    engine: "llm-assisted",
    engineVersion: provider.model,
    promptVersion: QA_LLM_PROMPT_VERSION,
    explanation: parsed.data.explanation,
    retrievedEvidence: parsed.data.usedCandidateKeys.map((key) => {
      const evidence = candidateByKey.get(key)!.evidence;
      const similarity = evidence.attributes.similarity;
      return {
        scenarioEvidenceId: evidence.id,
        relevance: typeof similarity === "number" ? Math.max(0, Math.min(1, similarity)) : null,
      };
    }),
  });
}

export async function getQaPilotStatus(): Promise<QaPilotStatusView> {
  const [scenarios, applicabilityRows] = await Promise.all([
    prisma.qaEvaluationScenario.findMany({
      where: { name: { startsWith: `${QA_PILOT_SCENARIO_VERSION}:` } },
      include: {
        requirement: { select: { code: true } },
        runs: {
          select: {
            engine: true,
            humanRatings: { select: { id: true } },
          },
        },
      },
    }),
    prisma.$queryRaw<Array<{ id: string; goldApplicability: string | null }>>`
      SELECT id, "goldApplicability"
      FROM "QaEvaluationScenario"
      WHERE name LIKE ${`${QA_PILOT_SCENARIO_VERSION}:%`}
    `,
  ]);
  const goldById = new Map(applicabilityRows.map((row) => [row.id, row.goldApplicability]));

  const requirements = QA_PILOT_REQUIREMENT_CODES.map((requirementCode) => {
    const matching = scenarios.filter((scenario) => scenario.requirement.code === requirementCode);
    return {
      requirementCode,
      scenarioCount: matching.length,
      goldAnnotatedCount: matching.filter((scenario) => goldById.get(scenario.id) !== null).length,
      deterministicRunCount: matching.flatMap((scenario) => scenario.runs).filter((run) => run.engine === "deterministic-rules").length,
      llmRunCount: matching.flatMap((scenario) => scenario.runs).filter((run) => run.engine === "llm-assisted").length,
    };
  });
  const allRuns = scenarios.flatMap((scenario) => scenario.runs);
  const goldAnnotatedCount = scenarios.filter((scenario) => goldById.get(scenario.id) !== null).length;
  const allRequirementsCovered = requirements.every((item) => item.scenarioCount >= 2);
  const allGoldAnnotated =
    scenarios.length === QA_PILOT_EXPECTED_SCENARIO_COUNT &&
    goldAnnotatedCount === QA_PILOT_EXPECTED_SCENARIO_COUNT;
  const everyScenarioHasPrototypeRun = scenarios.every((scenario) => scenario.runs.length > 0);

  return {
    version: QA_PILOT_SCENARIO_VERSION,
    expectedScenarioCount: QA_PILOT_EXPECTED_SCENARIO_COUNT,
    scenarioCount: scenarios.length,
    goldAnnotatedCount,
    pendingGoldCount: scenarios.length - goldAnnotatedCount,
    deterministicRunCount: allRuns.filter((run) => run.engine === "deterministic-rules").length,
    llmRunCount: allRuns.filter((run) => run.engine === "llm-assisted").length,
    humanRatingCount: allRuns.reduce((sum, run) => sum + run.humanRatings.length, 0),
    allRequirementsCovered,
    allGoldAnnotated,
    readyForComparison: allGoldAnnotated && everyScenarioHasPrototypeRun,
    requirements,
  };
}
