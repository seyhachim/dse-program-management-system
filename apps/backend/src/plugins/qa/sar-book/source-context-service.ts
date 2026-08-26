import { createHash } from "node:crypto";
import {
  QaSarRequirementSourceContextSchema,
  type QaEvidenceAnalysisState,
  type QaEvidenceCandidateResultView,
  type QaExpectedEvidenceDefinitionView,
  type QaQualityExpectationView,
  type QaSarRequirementSourceContext,
  type QaSarSourceBlock,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { assessCandidates } from "../analysis/deterministic-engine.ts";
import { temporalMatchSupportsEvidence } from "../analysis/evidence-semantics.ts";
import { getQaEvidenceCandidates } from "../evidence/service.ts";
import { qaService } from "../service.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

const dbAnalysisState: Record<string, QaEvidenceAnalysisState> = {
  EvidenceIdentified: "evidenceIdentified",
  PotentialEvidenceGap: "potentialEvidenceGap",
  ExpertReviewRequired: "expertReviewRequired",
};

const analysisSeverity: Record<QaEvidenceAnalysisState, number> = {
  evidenceIdentified: 1,
  potentialEvidenceGap: 2,
  expertReviewRequired: 3,
};

const STUDENT_LEVEL_EVIDENCE_TYPES = new Set([
  "cohort-membership",
  "student-progression-records",
  "completion-records",
  "graduation-outcomes",
]);

type SourceDefinition = Pick<
  QaExpectedEvidenceDefinitionView,
  "id" | "evidenceType" | "description" | "sourceDomain"
>;

type Candidate = QaEvidenceCandidateResultView["candidates"][number];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function candidateFingerprint(candidate: Candidate): string {
  return JSON.stringify(
    canonicalize({
      key: candidate.key,
      title: candidate.title,
      summary: candidate.summary,
      reportingDate: candidate.reportingDate,
      periodKey: candidate.periodKey ?? null,
      provenance: candidate.provenance ?? null,
      attributes: candidate.attributes,
    }),
  );
}

export function qaSarSourceSnapshotKey(
  expectedEvidenceId: string,
  candidateFingerprints: string[],
): string {
  if (candidateFingerprints.length === 0) return `${expectedEvidenceId}:unavailable`;
  const digest = createHash("sha256")
    .update([...candidateFingerprints].sort().join("\n"))
    .digest("hex");
  return `${expectedEvidenceId}:sha256:${digest}`;
}

function sourceSnapshotKey(definition: SourceDefinition, candidates: Candidate[]): string {
  return qaSarSourceSnapshotKey(
    definition.id,
    candidates.map(candidateFingerprint),
  );
}

function provenanceFor(candidate: Candidate) {
  const provenance = candidate.provenance ?? {
    authority: "unknown" as const,
    ownerUnit: null,
    version: null,
    approvalStatus: null,
    sourceUri: candidate.route,
  };
  return {
    sourceDomain: candidate.sourceDomain,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    route: candidate.route,
    authority: provenance.authority,
    ownerUnit: provenance.ownerUnit ?? null,
    version: provenance.version ?? null,
    approvalStatus: provenance.approvalStatus ?? null,
  };
}

function reportingPeriod(reportingStart: Date, reportingEnd: Date) {
  return {
    start: reportingStart.toISOString(),
    end: reportingEnd.toISOString(),
    label: `${reportingStart.getUTCFullYear()}–${reportingEnd.getUTCFullYear()}`,
  };
}

function aggregateStudentRows(candidates: Candidate[]) {
  const counts = new Map<string, { period: string; cohort: string; category: string; count: number }>();
  for (const candidate of candidates) {
    const attributes = candidate.attributes;
    const period =
      candidate.periodKey ??
      (typeof attributes.academicYear === "string" ? attributes.academicYear : null) ??
      (candidate.reportingDate ? String(new Date(candidate.reportingDate).getUTCFullYear()) : "Unspecified");
    const cohort = typeof attributes.cohortCode === "string" && attributes.cohortCode.trim()
      ? attributes.cohortCode.trim()
      : "All cohorts";
    const categoryValue = attributes.status ?? attributes.outcomeType ?? attributes.exitReason;
    const category = typeof categoryValue === "string" && categoryValue.trim()
      ? categoryValue.trim()
      : "Records";
    const key = `${period}\u0000${cohort}\u0000${category}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { period, cohort, category, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) =>
      a.period.localeCompare(b.period, undefined, { numeric: true }) ||
      a.cohort.localeCompare(b.cohort) ||
      a.category.localeCompare(b.category),
  );
}

export function buildQaSarSourceRecordBlock(
  definition: SourceDefinition,
  result: QaEvidenceCandidateResultView,
  reportingStart: Date,
  reportingEnd: Date,
  generatedAt: string,
): QaSarSourceBlock {
  const structured = result.candidates.filter((candidate) => candidate.sourceKind !== "documentChunk");
  const usable = structured.length > 0 ? structured : result.candidates;
  const base = {
    id: `sar-source:${definition.id}`,
    registryKey: `expected-evidence:${definition.id}`,
    title: definition.evidenceType.replace(/-/g, " "),
    description: definition.description,
    availability: usable.length > 0 ? "available" as const : "unavailable" as const,
    reportingPeriod: reportingPeriod(reportingStart, reportingEnd),
    generatedAt,
    snapshotKey: sourceSnapshotKey(definition, usable),
    message:
      usable.length > 0
        ? result.reason ?? null
        : result.reason || "No canonical PMS source is currently available for this expected evidence.",
  };

  if (STUDENT_LEVEL_EVIDENCE_TYPES.has(definition.evidenceType)) {
    return {
      ...base,
      kind: "table",
      provenance: usable.length
        ? [
            {
              sourceDomain: definition.sourceDomain,
              entityType: "ProgrammeAggregate",
              entityId: `aggregate:${definition.id}`,
              route: null,
              authority: "officialInstitutionalRecord",
              ownerUnit: "DSE",
              version: null,
              approvalStatus: null,
            },
          ]
        : [],
      columns: [
        { key: "period", label: "Period" },
        { key: "cohort", label: "Cohort" },
        { key: "category", label: "Category" },
        { key: "count", label: "Count" },
      ],
      rows: aggregateStudentRows(usable),
    };
  }

  return {
    ...base,
    kind: "recordList",
    provenance: usable.map(provenanceFor),
    records: usable.map((candidate) => ({
      key: candidate.key,
      title: candidate.title,
      summary: candidate.summary,
      periodKey: candidate.periodKey ?? null,
    })),
  };
}

function errorSourceBlock(
  definition: SourceDefinition,
  reportingStart: Date,
  reportingEnd: Date,
  generatedAt: string,
  error: unknown,
): QaSarSourceBlock {
  return {
    id: `sar-source:${definition.id}`,
    registryKey: `expected-evidence:${definition.id}`,
    kind: "recordList",
    title: definition.evidenceType.replace(/-/g, " "),
    description: definition.description,
    availability: "error",
    reportingPeriod: reportingPeriod(reportingStart, reportingEnd),
    generatedAt,
    snapshotKey: `${definition.id}:error`,
    provenance: [],
    message: error instanceof Error ? error.message : "Could not resolve this PMS source block.",
    records: [],
  };
}

function filterSupportingCandidates(
  programmeId: string,
  expectation: QaQualityExpectationView,
  definition: QaExpectedEvidenceDefinitionView,
  result: QaEvidenceCandidateResultView,
  cycle: { reportingStart: Date; reportingEnd: Date },
): QaEvidenceCandidateResultView {
  const { assessed } = assessCandidates(programmeId, expectation, definition, result, cycle);
  const acceptedKeys = new Set(
    assessed
      .filter(
        (item) =>
          item.scopeMatch === "exact" &&
          item.authorityMatch === true &&
          temporalMatchSupportsEvidence(item.temporalRule, item.temporalMatch),
      )
      .map((item) => item.candidate.key),
  );
  const candidates = result.candidates.filter((candidate) => acceptedKeys.has(candidate.key));
  if (result.status === "supported" && result.candidates.length > 0 && candidates.length === 0) {
    return {
      ...result,
      status: "unsupported",
      reason:
        "Canonical candidates exist, but none meet the requirement's scope, authority, and reporting-period rules for this assessment cycle.",
      candidates: [],
    };
  }
  return { ...result, candidates };
}

async function sourceBlockFor(
  programmeId: string,
  reportingStart: Date,
  reportingEnd: Date,
  expectation: QaQualityExpectationView,
  definition: QaExpectedEvidenceDefinitionView,
): Promise<QaSarSourceBlock> {
  const generatedAt = new Date().toISOString();
  try {
    const result = await getQaEvidenceCandidates(programmeId, definition.id);
    const filtered = filterSupportingCandidates(
      programmeId,
      expectation,
      definition,
      result,
      { reportingStart, reportingEnd },
    );
    return buildQaSarSourceRecordBlock(
      definition,
      filtered,
      reportingStart,
      reportingEnd,
      generatedAt,
    );
  } catch (error) {
    return errorSourceBlock(definition, reportingStart, reportingEnd, generatedAt, error);
  }
}

function aggregateEvidenceAnalysis(
  rows: Array<{ expectationId: string; state: string | null; explanation: string }>,
  expectationIds: string[],
): { state: QaEvidenceAnalysisState | null; explanation: string | null } {
  const latestByExpectation = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByExpectation.has(row.expectationId)) latestByExpectation.set(row.expectationId, row);
  }
  const latest = expectationIds
    .map((id) => latestByExpectation.get(id))
    .filter((row): row is (typeof rows)[number] => Boolean(row));
  if (latest.length === 0) return { state: null, explanation: null };

  const states = latest
    .map((row) => (row.state ? dbAnalysisState[row.state] ?? null : null))
    .filter((state): state is QaEvidenceAnalysisState => Boolean(state));
  const state = states.sort((a, b) => analysisSeverity[b] - analysisSeverity[a])[0] ?? null;
  const explanation = latest
    .map((row) => row.explanation.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" ");
  return { state, explanation: explanation || null };
}

export async function getQaSarRequirementSourceContext(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<QaSarRequirementSourceContext> {
  const [cycle, knowledge] = await Promise.all([
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: {
        programmeId: true,
        reportingStart: true,
        reportingEnd: true,
        framework: {
          select: {
            criteria: {
              select: {
                requirements: {
                  where: { code: requirementCode },
                  select: { id: true, code: true, title: true },
                },
              },
            },
          },
        },
      },
    }),
    qaService.getKnowledge(),
  ]);
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR source context belongs to a different programme");
  }

  const requirement = cycle.framework.criteria
    .flatMap((criterion) => criterion.requirements)
    .find((item) => item.code === requirementCode);
  if (!requirement) throw new QaSarResourceNotFoundError("AUN-QA requirement not found in this cycle");

  const expectations = knowledge.expectations
    .filter((expectation) => expectation.requirementCode === requirementCode)
    .sort((a, b) => a.order - b.order);

  const sourceBlocks = await Promise.all(
    expectations.flatMap((expectation) =>
      expectation.expectedEvidence.map((definition) =>
        sourceBlockFor(
          programmeId,
          cycle.reportingStart,
          cycle.reportingEnd,
          expectation,
          definition,
        ),
      ),
    ),
  );

  const analysisRows = await prisma.qaEvidenceAnalysis.findMany({
    where: {
      programmeId,
      cycleId,
      requirementId: requirement.id,
      expectationId: { in: expectations.map((expectation) => expectation.id) },
    },
    orderBy: { createdAt: "desc" },
    select: { expectationId: true, state: true, explanation: true },
  });
  const analysis = aggregateEvidenceAnalysis(
    analysisRows.map((row) => ({ ...row, state: row.state ? String(row.state) : null })),
    expectations.map((expectation) => expectation.id),
  );

  return QaSarRequirementSourceContextSchema.parse({
    programmeId,
    cycleId,
    requirementCode,
    requirementTitle: requirement.title,
    requirementText: requirement.title,
    diagnosticPrompts: expectations
      .flatMap((expectation) => [expectation.statement, expectation.purpose])
      .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index),
    evidenceGapState: analysis.state,
    evidenceGapExplanation: analysis.explanation,
    sourceBlocks,
    generatedAt: new Date().toISOString(),
  });
}
