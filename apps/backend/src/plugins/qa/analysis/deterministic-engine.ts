import type {
  QaEvidenceAnalysisSourceView,
  QaEvidenceAnalysisView,
  QaExpectedEvidenceDefinitionView,
} from "@dse-pms/shared-types";
import { getQaEvidenceCandidates } from "../evidence/service.ts";
import { qaService } from "../service.ts";
import {
  QaAnalysisResourceNotFoundError,
  createQaEvidenceAnalysis,
} from "./service.ts";
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

function sourceSnapshots(
  findings: QaEvidenceRuleFinding[],
): Array<{
  sourceKind: "structuredCandidate";
  candidateKey: string;
  sourceDomain: QaEvidenceAnalysisSourceView["sourceDomain"];
  entityType: string;
  entityId: string;
  qaEvidenceId: null;
  title: string;
  summary: string;
  excerpt: string;
  route: string | null;
  reportingDate: Date | null;
  relevance: number;
}> {
  const snapshots = findings.flatMap((finding) =>
    finding.result.candidates.map((candidate) => ({
      sourceKind: "structuredCandidate" as const,
      candidateKey: candidate.key,
      sourceDomain: candidate.sourceDomain,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      qaEvidenceId: null,
      title: candidate.title,
      summary: candidate.summary,
      excerpt: candidate.summary,
      route: candidate.route,
      reportingDate: candidate.reportingDate ? new Date(candidate.reportingDate) : null,
      relevance: relevanceFor(finding.definition),
    })),
  );

  const byKey = new Map(snapshots.map((snapshot) => [snapshot.candidateKey, snapshot]));
  return [...byKey.values()];
}

export async function runDeterministicQaAnalysis(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<QaEvidenceAnalysisView[]> {
  const knowledge = await qaService.getKnowledge();
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
    const rawFindings = await Promise.all(
      expectation.expectedEvidence.map(async (definition) => {
        const result = await getQaEvidenceCandidates(programmeId, definition.id);
        return evaluateExpectedEvidence(definition, result);
      }),
    );
    const findings = applyExpectationCrossChecks(requirementCode, rawFindings);
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
        state,
        explanation: buildDeterministicExplanation(requirementCode, findings, state),
        confidence: null,
        uncertaintyNote,
        engine: "deterministic-rules",
        engineVersion: QA_DETERMINISTIC_RULE_VERSION,
        promptVersion: "",
        sources: sourceSnapshots(findings),
      }),
    );
  }

  return analyses;
}
