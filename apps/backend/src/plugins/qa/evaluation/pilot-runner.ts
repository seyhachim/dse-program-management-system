import {
  QA_LLM_PROMPT_VERSION,
  QA_PILOT_EXPECTED_SCENARIO_COUNT,
  QA_PILOT_REQUIREMENT_CODES,
  QA_PILOT_SCENARIO_VERSION,
  QaLlmEvidenceMatchOutputSchema,
  type QaEvidenceCandidateResultView,
  type QaEvidenceCandidateView,
  type QaEvaluationEvidenceView,
  type QaEvaluationRunView,
  type QaPilotStatusView,
  type QaQualityExpectationView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { qaService } from "../service.ts";
import { evaluateApplicability } from "../analysis/evidence-semantics.ts";
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

function controlledApplicability(
  expectation: QaQualityExpectationView,
  evidence: QaEvaluationEvidenceView[],
) {
  if (expectation.applicabilityRule.kind === "always") {
    return evaluateApplicability(expectation.applicabilityRule, {
      asOfDate: new Date(0),
      cohortStartDate: null,
    });
  }

  const cohortStartDate = evidence
    .map((item) => parseControlledDate(item.attributes.cohortStartDate))
    .find((value): value is Date => Boolean(value));
  const explicitAsOfDate = evidence
    .map((item) => parseControlledDate(item.attributes.asOfDate))
    .find((value): value is Date => Boolean(value));
  const reportingDates = evidence
    .map((item) => parseControlledDate(item.reportingDate))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime());
  const asOfDate = explicitAsOfDate ?? reportingDates[0] ?? null;

  if (!asOfDate) {
    return {
      state: "uncertain" as const,
      reason: "Controlled scenario has no reproducible as-of/reporting date for cohort applicability.",
    };
  }
  return evaluateApplicability(expectation.applicabilityRule, {
    cohortStartDate: cohortStartDate ?? null,
    asOfDate,
  });
}

function controlledResult(
  scenarioId: string,
  definition: Awaited<ReturnType<typeof qaService.getKnowledge>>["expectations"][number]["expectedEvidence"][number],
  evidence: QaEvaluationEvidenceView[],
): QaEvidenceCandidateResultView {
  return {
    programmeId: `controlled-evaluation:${scenarioId}`,
    expectedEvidenceId: definition.id,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    status: "supported",
    reason: "Controlled scenario evidence container searched for the registered evidence type.",
    candidates: evidence
      .filter((item) => item.evidenceType === definition.evidenceType)
      .map(candidateFromEvidence),
  };
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

  const findings = applyExpectationCrossChecks(
    scenario.requirementCode,
    expectation.expectedEvidence.map((definition) =>
      evaluateExpectedEvidence(
        definition,
        controlledResult(scenario.id, definition, scenario.evidence),
      ),
    ),
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
  candidates: QaEvidenceCandidateView[];
}) {
  return [
    {
      role: "system" as const,
      content:
        "You are an evidence-matching assistant for higher-education quality assurance. Your task is only to determine whether the supplied controlled evidence context supports the stated quality expectation. Do not assign, predict, recommend, or imply any official AUN-QA rating, score, pass/fail, accreditation decision, or institutional quality judgment. A missing evidence record is an evidence gap, not proof of poor quality. Use only candidate keys supplied by the user. If evidence is partial, conflicting, stale, or interpretation depends on academic/QA expertise, use expertReviewRequired. Return JSON only with exactly these fields: state, explanation, confidence, uncertaintyNote, usedCandidateKeys. state must be evidenceIdentified, potentialEvidenceGap, or expertReviewRequired. confidence is 0..1 or null. usedCandidateKeys must be a subset of the supplied candidate keys.",
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          promptVersion: QA_LLM_PROMPT_VERSION,
          requirementCode: options.requirementCode,
          qualityExpectation: options.expectation,
          expectedEvidence: options.expectedEvidence,
          candidates: options.candidates.map((candidate) => ({
            key: candidate.key,
            evidenceType: candidate.evidenceType,
            sourceDomain: candidate.sourceDomain,
            title: candidate.title,
            summary: candidate.summary,
            reportingDate: candidate.reportingDate,
            scope: candidate.scope,
            provenance: candidate.provenance,
            periodKey: candidate.periodKey,
            attributes: candidate.attributes,
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

  const candidates = scenario.evidence.map(candidateFromEvidence);
  if (candidates.length === 0) {
    throw new QaPilotScenarioError(
      "The controlled scenario has no evidence context; use deterministic gap analysis instead of asking an LLM to infer from nothing",
    );
  }
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const evidenceByCandidateKey = new Map(
    scenario.evidence.map((evidence) => [`pilot-evidence:${evidence.id}`, evidence]),
  );

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
          candidateKeys: candidates
            .filter((candidate) => candidate.evidenceType === definition.evidenceType)
            .map((candidate) => candidate.key),
        })),
        candidates,
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
      const evidence = evidenceByCandidateKey.get(key)!;
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
