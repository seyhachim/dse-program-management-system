import {
  AUN_QA_V4_ID,
  QA_LLM_PROMPT_VERSION,
  QaLlmEvidenceMatchOutputSchema,
  type QaEvidenceCandidateView,
  type QaEvidenceSourceDomain,
  type QaEvidenceAnalysisView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { getQaEvidenceCandidates } from "../evidence/service.ts";
import { qaService } from "../service.ts";
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
  const candidatePayload = options.candidates.map(({ candidate }) => ({
    key: candidate.key,
    evidenceType: candidate.evidenceType,
    sourceDomain: candidate.sourceDomain,
    title: candidate.title,
    summary: candidate.summary,
    reportingDate: candidate.reportingDate,
    attributes: candidate.attributes,
  }));

  return [
    {
      role: "system" as const,
      content:
        "You are an evidence-matching assistant for higher-education quality assurance. Your task is only to determine whether the supplied evidence context supports the stated quality expectation. Do not assign, predict, recommend, or imply any official AUN-QA rating, score, pass/fail, accreditation decision, or institutional quality judgment. A missing evidence record is an evidence gap, not proof of poor quality. Use only candidate keys supplied by the user. If evidence is partial, conflicting, stale, or interpretation depends on academic/QA expertise, use expertReviewRequired. Return JSON only with exactly these fields: state, explanation, confidence, uncertaintyNote, usedCandidateKeys. state must be evidenceIdentified, potentialEvidenceGap, or expertReviewRequired. confidence is 0..1 or null. usedCandidateKeys must be a subset of the supplied candidate keys.",
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

export async function runLlmAssistedQaAnalysis(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
  provider: QaLlmProvider | null = configuredQaLlmProvider(),
): Promise<QaEvidenceAnalysisView[]> {
  if (!provider) {
    throw new QaLlmUnavailableError(
      "QA LLM provider is not configured. Set QA_LLM_API_URL and QA_LLM_MODEL.",
    );
  }

  const knowledge = await qaService.getKnowledge();
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
    const retrieval = await Promise.all(
      expectation.expectedEvidence.map(async (definition) => ({
        definition,
        result: await getQaEvidenceCandidates(programmeId, definition.id, { topK: 8 }),
      })),
    );

    const retrievedCandidates: CandidateWithKind[] = retrieval.flatMap(({ result }) =>
      result.candidates.map((candidate) => ({
        candidate,
        sourceKind:
          candidate.entityType === "QaDocumentChunk"
            ? ("documentChunk" as const)
            : ("structuredCandidate" as const),
        qaEvidenceId: null,
      })),
    );
    const allByKey = new Map<string, CandidateWithKind>();
    for (const item of [...retrievedCandidates, ...manual]) allByKey.set(item.candidate.key, item);
    const candidates = [...allByKey.values()];

    if (candidates.length === 0) {
      throw new QaLlmEvidenceContextUnavailableError(
        `No retrievable evidence context is available for requirement ${requirementCode}; add evidence or configure the required retrieval source before LLM analysis.`,
      );
    }

    const expectedEvidence = retrieval.map(({ definition, result }) => ({
      evidenceType: definition.evidenceType,
      description: definition.description,
      role: definition.role,
      retrievalStatus: result.status,
      retrievalReason: result.reason,
      candidateKeys: result.candidates.map((candidate) => candidate.key),
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

    const used = parsed.data.usedCandidateKeys.map((key) => allByKey.get(key)!);
    saved.push(
      await createQaEvidenceAnalysis({
        programmeId,
        cycleId,
        requirementCode,
        expectationId: expectation.id,
        state: parsed.data.state,
        explanation: parsed.data.explanation,
        confidence: parsed.data.confidence,
        uncertaintyNote: parsed.data.uncertaintyNote,
        engine: "llm-assisted",
        engineVersion: provider.model,
        promptVersion: QA_LLM_PROMPT_VERSION,
        sources: used.map(snapshotFor),
      }),
    );
  }

  return saved;
}
