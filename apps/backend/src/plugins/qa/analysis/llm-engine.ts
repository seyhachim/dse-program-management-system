import {
  AUN_QA_V4_ID,
  QA_LLM_PROMPT_VERSION,
  QaLlmEvidenceMatchOutputSchema,
  type QaEvidenceCandidateView,
  type QaEvidenceScopeRequirement,
  type QaEvidenceSourceDomain,
  type QaEvidenceAnalysisView,
  type QaExpectedEvidenceDefinitionView,
  type QaQualityExpectationView,
  type QaTemporalRule,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { getQaEvidenceCandidates } from "../evidence/service.ts";
import { qaService } from "../service.ts";
import {
  evaluateApplicability,
  matchEvidenceScope,
  matchEvidenceTime,
  meetsSourceAuthority,
} from "./evidence-semantics.ts";
import { createQaEvidenceAnalysis, QaAnalysisResourceNotFoundError } from "./service.ts";
import {
  QaLlmProviderError,
  configuredQaLlmProvider,
  type QaLlmProvider,
} from "./llm-provider.ts";

export class QaLlmUnavailableError extends Error {}
export class QaLlmEvidenceContextUnavailableError extends Error {}
export class QaLlmOutputValidationError extends Error {}

interface CandidateWithKind {
  candidate: QaEvidenceCandidateView;
  sourceKind: "structuredCandidate" | "qaEvidence" | "documentChunk";
  qaEvidenceId: string | null;
  definition?: QaExpectedEvidenceDefinitionView;
  scopeMatch?: "exact" | "partial" | "mismatch" | "unknown";
  temporalMatch?: "current" | "historicalRelevant" | "stale" | "future" | "insufficientHistory" | "unknown";
  authorityMatch?: boolean | null;
}

function manualEvidenceDomain(kind: string): QaEvidenceSourceDomain {
  if (kind === "Document" || kind === "ExternalLink") return "document";
  return "programme";
}

function scoringGuard(text: string): void {
  if (/\b(?:rating|score)\s*(?:is|=|:)?\s*[1-7](?:\s*\/\s*7)?\b/i.test(text)) {
    throw new QaLlmOutputValidationError(
      "LLM output attempted to assign an AUN-QA-style numeric rating or score",
    );
  }
}

function promptMessages(options: {
  requirementCode: string;
  expectation: { statement: string; purpose: string };
  expectedEvidence: Array<{
    evidenceType: string;
    description: string;
    role: string;
    retrievalStatus: string;
    retrievalReason: string;
    candidateKeys: string[];
  }>;
  candidates: CandidateWithKind[];
}) {
  const candidatePayload = options.candidates.map(({ candidate, scopeMatch, temporalMatch, authorityMatch }) => ({
    key: candidate.key,
    evidenceType: candidate.evidenceType,
    sourceDomain: candidate.sourceDomain,
    title: candidate.title,
    summary: candidate.summary,
    reportingDate: candidate.reportingDate,
    scope: candidate.scope,
    scopeMatch: scopeMatch ?? "unknown",
    temporalMatch: temporalMatch ?? "unknown",
    provenance: candidate.provenance,
    authorityMatch: authorityMatch ?? null,
    periodKey: candidate.periodKey,
    attributes: candidate.attributes,
  }));

  return [
    {
      role: "system" as const,
      content:
        "You are an evidence-matching assistant for higher-education quality assurance. Your task is only to determine whether the supplied evidence context supports the stated quality expectation. Do not assign, predict, recommend, or imply any official AUN-QA rating, score, pass/fail, accreditation decision, or institutional quality judgment. A missing evidence record is an evidence gap, not proof of poor quality. Use only candidate keys supplied by the user. Treat scope mismatch, stale/future evidence, insufficient history, and insufficient source authority as non-supporting. If scope, time, provenance, or academic meaning is uncertain, use expertReviewRequired. Return JSON only with exactly these fields: state, explanation, confidence, uncertaintyNote, usedCandidateKeys. state must be evidenceIdentified, potentialEvidenceGap, or expertReviewRequired. confidence is 0..1 or null. usedCandidateKeys must be a subset of the supplied candidate keys.",
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          promptVersion: QA_LLM_PROMPT_VERSION,
          requirementCode: options.requirementCode,
          qualityExpectation: options.expectation,
          expectedEvidence: options.expectedEvidence,
          candidates: candidatePayload,
        },
        null,
        2,
      ),
    },
  ];
}

function snapshotFor(item: CandidateWithKind) {
  const similarity = item.candidate.attributes.similarity;
  const relevance = typeof similarity === "number" ? Math.max(0, Math.min(1, similarity)) : null;
  return {
    sourceKind: item.sourceKind,
    candidateKey: item.candidate.key,
    sourceDomain: item.candidate.sourceDomain,
    entityType: item.candidate.entityType,
    entityId: item.candidate.entityId,
    qaEvidenceId: item.qaEvidenceId,
    title: item.candidate.title,
    summary: item.candidate.summary,
    excerpt: item.candidate.summary,
    route: item.candidate.route,
    reportingDate: item.candidate.reportingDate ? new Date(item.candidate.reportingDate) : null,
    relevance,
    scope: item.candidate.scope ?? {},
    scopeMatch: item.scopeMatch ?? "unknown",
    temporalMatch: item.temporalMatch ?? "unknown",
    provenance: item.candidate.provenance ?? {
      authority: "unknown" as const,
      ownerUnit: null,
      version: null,
      approvalStatus: null,
      sourceUri: item.candidate.route,
    },
    authorityMatch: item.authorityMatch ?? null,
    periodKey: item.candidate.periodKey ?? null,
  } as const;
}

async function manualEvidenceCandidates(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<CandidateWithKind[]> {
  const rows = await prisma.qaEvidenceMapping.findMany({
    where: {
      programmeId,
      cycleId,
      requirement: {
        code: requirementCode,
        criterion: { frameworkId: AUN_QA_V4_ID },
      },
    },
    include: {
      requirement: { select: { code: true } },
      evidence: true,
    },
    orderBy: { evidence: { createdAt: "desc" } },
  });

  return rows.map((row) => {
    const evidence = row.evidence;
    return {
      sourceKind: "qaEvidence" as const,
      qaEvidenceId: evidence.id,
      candidate: {
        key: `qa-evidence:${evidence.id}`,
        evidenceType: "manual-qa-evidence",
        sourceDomain: manualEvidenceDomain(evidence.kind),
        title: evidence.title,
        summary:
          evidence.description ||
          `Mapped QA evidence for requirement ${row.requirement.code}.`,
        entityType: "QaEvidence",
        entityId: evidence.id,
        route: null,
        reportingDate: evidence.updatedAt.toISOString(),
        scope: { programmeId },
        provenance: {
          authority: evidence.status === "Reviewed" ? "controlledInternalRecord" : "contributorRecord",
          ownerUnit: "DSE",
          version: null,
          approvalStatus: evidence.status,
          sourceUri: evidence.sourceUrl,
        },
        periodKey: evidence.reportingPeriod || String(evidence.updatedAt.getUTCFullYear()),
        attributes: {
          kind: evidence.kind,
          status: evidence.status,
          sourceUrl: evidence.sourceUrl,
          sourceRef: evidence.sourceRef,
          reportingPeriod: evidence.reportingPeriod,
          evidenceMappingId: row.id,
        },
      },
    };
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
  return definition.temporalRule.kind === "withinCycle"
    ? expectation.temporalRule
    : definition.temporalRule;
}

function assessCandidate(options: {
  programmeId: string;
  expectation: QaQualityExpectationView;
  definition: QaExpectedEvidenceDefinitionView;
  item: CandidateWithKind;
  cycle: { reportingStart: Date; reportingEnd: Date };
  comparablePeriods: number;
}): CandidateWithKind {
  const { programmeId, expectation, definition, item, cycle, comparablePeriods } = options;
  const provenance = item.candidate.provenance ?? {
    authority: "unknown" as const,
    ownerUnit: null,
    version: null,
    approvalStatus: null,
    sourceUri: item.candidate.route,
  };
  return {
    ...item,
    definition,
    scopeMatch: matchEvidenceScope(
      effectiveScopeRequirement(expectation, definition),
      { programmeId },
      item.candidate.scope ?? { programmeId },
    ),
    temporalMatch: matchEvidenceTime(effectiveTemporalRule(expectation, definition), {
      cycleStart: cycle.reportingStart,
      cycleEnd: cycle.reportingEnd,
      candidateDate: item.candidate.reportingDate ? new Date(item.candidate.reportingDate) : null,
      comparablePeriods,
    }),
    authorityMatch: meetsSourceAuthority(definition.authorityRequirement, provenance),
  };
}

function usableForLlm(item: CandidateWithKind): boolean {
  return (
    item.scopeMatch === "exact" &&
    item.temporalMatch === "current" &&
    item.authorityMatch === true
  );
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

export async function runLlmAssistedQaAnalysis(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
  provider: QaLlmProvider | null = configuredQaLlmProvider(),
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

  const manual = await manualEvidenceCandidates(programmeId, cycleId, requirementCode);
  const saved: QaEvidenceAnalysisView[] = [];

  for (const expectation of expectations) {
    const applicability = evaluateApplicability(expectation.applicabilityRule, {
      cohortStartDate,
      asOfDate: cycle.reportingEnd,
    });
    if (applicability.state !== "applicable") {
      saved.push(
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
              ? "Applicability requires human QA review before LLM evidence classification."
              : "LLM evidence classification was intentionally bypassed because the expectation is not applicable.",
          engine: "llm-assisted",
          engineVersion: provider?.model ?? "not-invoked",
          promptVersion: QA_LLM_PROMPT_VERSION,
          sources: [],
        }),
      );
      continue;
    }

    if (!provider) {
      throw new QaLlmUnavailableError(
        "QA LLM provider is not configured. Set QA_LLM_API_URL and QA_LLM_MODEL.",
      );
    }

    const retrieval = await Promise.all(
      expectation.expectedEvidence.map(async (definition) => ({
        definition,
        result: await getQaEvidenceCandidates(programmeId, definition.id, { topK: 8 }),
      })),
    );

    const assessedRetrieved: CandidateWithKind[] = retrieval.flatMap(({ definition, result }) => {
      const periodCount = new Set(
        result.candidates
          .map((candidate) => candidate.periodKey)
          .filter((value): value is string => Boolean(value)),
      ).size;
      return result.candidates.map((candidate) =>
        assessCandidate({
          programmeId,
          expectation,
          definition,
          item: {
            candidate,
            sourceKind:
              candidate.entityType === "QaDocumentChunk"
                ? ("documentChunk" as const)
                : ("structuredCandidate" as const),
            qaEvidenceId: null,
          },
          cycle,
          comparablePeriods: periodCount,
        }),
      );
    });

    const allByKey = new Map<string, CandidateWithKind>();
    for (const item of assessedRetrieved) allByKey.set(item.candidate.key, item);
    for (const item of manual) {
      // Manually mapped QA evidence is valid contextual input but has no specific
      // expected-evidence definition, so retain explicit unknown match factors.
      allByKey.set(item.candidate.key, {
        ...item,
        scopeMatch: "exact",
        temporalMatch: "current",
        authorityMatch: true,
      });
    }
    const allCandidates = [...allByKey.values()];
    const candidates = allCandidates.filter(usableForLlm);

    if (candidates.length === 0) {
      const ambiguous = allCandidates.some(
        (item) =>
          item.scopeMatch === "unknown" ||
          item.scopeMatch === "partial" ||
          item.temporalMatch === "unknown" ||
          item.authorityMatch === null,
      );
      saved.push(
        await createQaEvidenceAnalysis({
          programmeId,
          cycleId,
          requirementCode,
          expectationId: expectation.id,
          applicability: "applicable",
          applicabilityReason: applicability.reason,
          state: ambiguous ? "expertReviewRequired" : "potentialEvidenceGap",
          explanation: ambiguous
            ? `Evidence candidates for ${requirementCode} have uncertain scope, time, or authority and were not sent to the LLM.`
            : `No evidence candidate for ${requirementCode} satisfied the registered scope, temporal, and authority requirements.`,
          confidence: null,
          uncertaintyNote: ambiguous
            ? "Human review is required to resolve evidence semantics before content classification."
            : "This is an evidence-gap signal, not a quality judgment.",
          engine: "llm-assisted",
          engineVersion: provider.model,
          promptVersion: QA_LLM_PROMPT_VERSION,
          sources: allCandidates.map(snapshotFor),
        }),
      );
      continue;
    }

    const expectedEvidence = retrieval.map(({ definition, result }) => ({
      evidenceType: definition.evidenceType,
      description: definition.description,
      role: definition.role,
      retrievalStatus: result.status,
      retrievalReason: result.reason,
      candidateKeys: assessedRetrieved
        .filter((item) => item.definition?.id === definition.id && usableForLlm(item))
        .map((item) => item.candidate.key),
    }));

    let raw: unknown;
    try {
      raw = await provider.completeJson(
        promptMessages({
          requirementCode,
          expectation: { statement: expectation.statement, purpose: expectation.purpose },
          expectedEvidence,
          candidates,
        }),
      );
    } catch (error) {
      if (error instanceof QaLlmProviderError) throw error;
      throw new QaLlmProviderError("QA LLM provider call failed");
    }

    const parsed = QaLlmEvidenceMatchOutputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new QaLlmOutputValidationError(
        `QA LLM output failed schema validation: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    scoringGuard(`${parsed.data.explanation}\n${parsed.data.uncertaintyNote}`);

    const allowedKeys = new Set(candidates.map((item) => item.candidate.key));
    const invented = parsed.data.usedCandidateKeys.find((key) => !allowedKeys.has(key));
    if (invented) {
      throw new QaLlmOutputValidationError(
        `QA LLM referenced an evidence candidate that was not supplied: ${invented}`,
      );
    }

    const usedKeys = new Set(parsed.data.usedCandidateKeys);
    const snapshotted = allCandidates.filter(
      (item) => usedKeys.has(item.candidate.key) || !usableForLlm(item),
    );
    saved.push(
      await createQaEvidenceAnalysis({
        programmeId,
        cycleId,
        requirementCode,
        expectationId: expectation.id,
        applicability: "applicable",
        applicabilityReason: applicability.reason,
        state: parsed.data.state,
        explanation: parsed.data.explanation,
        confidence: parsed.data.confidence,
        uncertaintyNote: parsed.data.uncertaintyNote,
        engine: "llm-assisted",
        engineVersion: provider.model,
        promptVersion: QA_LLM_PROMPT_VERSION,
        sources: snapshotted.map(snapshotFor),
      }),
    );
  }

  return saved;
}
