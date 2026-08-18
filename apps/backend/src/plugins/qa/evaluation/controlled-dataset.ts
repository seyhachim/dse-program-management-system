import {
  AUN_QA_V4_ID,
  QA_CRITERIA_1_4_8_DATASET_VERSION,
  QaEvaluationDifficultySchema,
  QaEvaluationScenarioTypeSchema,
  type QaEvaluationScenarioEvidenceInputSchema,
  type QaEvaluationScenarioType,
  type QaQualityExpectationView,
} from "@dse-pms/shared-types";
import type { z } from "zod";
import { prisma } from "../../../core/db/prisma.ts";
import { qaService } from "../service.ts";
import { createQaEvaluationScenario, listQaEvaluationScenarios } from "./service.ts";

type EvidenceInput = z.infer<typeof QaEvaluationScenarioEvidenceInputSchema>;
type EvidenceDefinition = QaQualityExpectationView["expectedEvidence"][number];

export const QA_CRITERIA_1_4_8_REQUIREMENTS = ["1.2", "4.1", "8.5"] as const;
export const QA_CONTROLLED_SCENARIO_TYPES = QaEvaluationScenarioTypeSchema.options;
export const QA_CONTROLLED_DATASET_EXPECTED_SCENARIOS =
  QA_CRITERIA_1_4_8_REQUIREMENTS.length * QA_CONTROLLED_SCENARIO_TYPES.length;

const difficultyByType: Record<
  QaEvaluationScenarioType,
  z.infer<typeof QaEvaluationDifficultySchema>
> = {
  positiveEvidence: "easy",
  missingEvidence: "easy",
  partialEvidence: "medium",
  ambiguousRelationship: "hard",
  wrongScope: "medium",
  staleEvidence: "medium",
  conflictingEvidence: "hard",
  notApplicable: "easy",
};

function requiredScope(definition: EvidenceDefinition): EvidenceInput["scope"] {
  const scope: EvidenceInput["scope"] = { programmeId: "controlled-evaluation" };
  for (const dimension of definition.scopeRequirement.requiredDimensions) {
    switch (dimension) {
      case "programme": scope.programmeId = "controlled-evaluation"; break;
      case "academicYear": scope.academicYear = "2025-2026"; break;
      case "term": scope.term = "2026-S1"; break;
      case "course": scope.courseId = "controlled-course-1"; break;
      case "courseSpecVersion": scope.courseSpecVersionId = "controlled-spec-v2"; break;
      case "offering": scope.offeringId = "controlled-offering-1"; break;
      case "cohort": scope.cohortId = "controlled-cohort-2024"; break;
      case "assessment": scope.assessmentId = "controlled-assessment-1"; break;
      case "population": scope.population = "enrolled-students"; break;
    }
  }
  return scope;
}

function authority(definition: EvidenceDefinition) {
  const acceptable = definition.authorityRequirement.acceptableAuthorities?.[0];
  if (acceptable) return acceptable;
  const minimum = definition.authorityRequirement.minimumAuthority;
  return minimum === "unknown" ? "controlledInternalRecord" as const : minimum;
}

function evidenceRecord(
  requirementCode: string,
  definition: EvidenceDefinition,
  scenarioType: QaEvaluationScenarioType,
  index: number,
  options: { conflicting?: boolean } = {},
): EvidenceInput {
  const exactScope = requiredScope(definition);
  const scope = scenarioType === "wrongScope"
    ? { ...exactScope, courseId: "controlled-wrong-course" }
    : exactScope;
  const reportingDate = scenarioType === "staleEvidence"
    ? new Date("2018-06-30T00:00:00.000Z")
    : new Date("2026-06-30T00:00:00.000Z");
  const referenceKey = [
    QA_CRITERIA_1_4_8_DATASET_VERSION,
    requirementCode,
    scenarioType,
    definition.evidenceType,
    index + 1,
  ].join(":");

  let text = `Controlled ${definition.description} evidence for AUN-QA ${requirementCode}.`;
  const attributes: Record<string, string | number | boolean | null> = {
    controlled: true,
    complete: true,
    datasetVersion: QA_CRITERIA_1_4_8_DATASET_VERSION,
  };

  if (scenarioType === "partialEvidence") {
    text = `Controlled partial ${definition.description} evidence with one required element intentionally incomplete.`;
    attributes.complete = false;
    attributes.coverage = 0.5;
  }
  if (scenarioType === "ambiguousRelationship") {
    text = `Controlled ${definition.description} evidence that is individually plausible but intentionally omits explicit relationship identity needed to prove the required link.`;
    attributes.relationshipIdentity = "omitted";
  }
  if (scenarioType === "wrongScope") {
    text = `Controlled ${definition.description} evidence from a different academic scope.`;
  }
  if (scenarioType === "staleEvidence") {
    text = `Controlled ${definition.description} evidence from an intentionally stale reporting period.`;
  }
  if (scenarioType === "conflictingEvidence") {
    text = options.conflicting
      ? `Controlled ${definition.description} evidence containing a conflicting version or interpretation.`
      : `Controlled ${definition.description} evidence containing the primary version for comparison with a conflicting record.`;
    attributes.controlledVersion = options.conflicting ? "B" : "A";
    attributes.conflictGroup = `${requirementCode}:${definition.evidenceType}`;
  }

  return {
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    entityType: "ControlledEvaluationEvidence",
    label: `${scenarioType} ${definition.evidenceType} ${index + 1}`,
    text,
    referenceKey,
    reportingDate,
    scope,
    provenance: {
      authority: authority(definition),
      ownerUnit: "Controlled research dataset",
      version: "1",
      approvalStatus: "controlled",
      sourceUri: null,
    },
    periodKey: String(reportingDate.getUTCFullYear()),
    attributes,
  };
}

export function buildControlledScenarioInput(
  expectation: QaQualityExpectationView,
  scenarioType: QaEvaluationScenarioType,
) {
  const definitions = expectation.expectedEvidence;
  let evidence: EvidenceInput[] = [];

  if (!["missingEvidence", "notApplicable"].includes(scenarioType)) {
    evidence = definitions.flatMap((definition, index) => {
      if (scenarioType === "partialEvidence" && index > 0) return [];
      const base = evidenceRecord(expectation.requirementCode, definition, scenarioType, index);
      if (scenarioType !== "conflictingEvidence" || index > 0) return [base];
      return [
        base,
        evidenceRecord(expectation.requirementCode, definition, scenarioType, index + 100, {
          conflicting: true,
        }),
      ];
    });
  }

  return {
    requirementCode: expectation.requirementCode,
    expectationId: expectation.id,
    name: `${QA_CRITERIA_1_4_8_DATASET_VERSION}:${expectation.requirementCode}:${scenarioType}`,
    description:
      `Controlled ${scenarioType} scenario for AUN-QA requirement ${expectation.requirementCode}. ` +
      (scenarioType === "notApplicable"
        ? "The controlled context intentionally makes the expectation not applicable; no coverage state should be inferred until an expert supplies the gold label."
        : "Use only the supplied controlled records; expert gold labels are intentionally not generated by the system under evaluation."),
    evidence,
  };
}

type DatasetMetadataRow = {
  id: string;
  scenarioType: string;
  difficulty: string;
  datasetVersion: string;
  scenarioVersion: number;
};

async function metadataMap(datasetVersion: string) {
  const rows = await prisma.$queryRaw<DatasetMetadataRow[]>`
    SELECT id, "scenarioType", difficulty, "datasetVersion", "scenarioVersion"
    FROM "QaEvaluationScenario"
    WHERE "datasetVersion" = ${datasetVersion}
  `;
  return new Map(rows.map((row) => [row.id, row]));
}

export async function initializeQaCriteria148Dataset() {
  const knowledge = await qaService.getKnowledge();
  const selected = QA_CRITERIA_1_4_8_REQUIREMENTS.map((requirementCode) => {
    const expectation = knowledge.expectations.find(
      (item) => item.requirementCode === requirementCode,
    );
    if (!expectation) {
      throw new Error(`Controlled dataset expectation ${requirementCode} is not available`);
    }
    return expectation;
  });

  const existingRows = await prisma.$queryRaw<Array<{
    requirementCode: string;
    expectationId: string;
    scenarioType: string;
  }>>`
    SELECT r.code AS "requirementCode", s."expectationId", s."scenarioType"
    FROM "QaEvaluationScenario" s
    JOIN "QaRequirement" r ON r.id = s."requirementId"
    WHERE s."datasetVersion" = ${QA_CRITERIA_1_4_8_DATASET_VERSION}
      AND s."scenarioVersion" = 1
  `;
  const existingKeys = new Set(
    existingRows.map((row) => `${row.requirementCode}:${row.expectationId}:${row.scenarioType}`),
  );

  let created = 0;
  for (const expectation of selected) {
    for (const scenarioType of QA_CONTROLLED_SCENARIO_TYPES) {
      const key = `${expectation.requirementCode}:${expectation.id}:${scenarioType}`;
      if (existingKeys.has(key)) continue;
      const scenario = await createQaEvaluationScenario(
        buildControlledScenarioInput(expectation, scenarioType),
      );
      await prisma.$executeRaw`
        UPDATE "QaEvaluationScenario"
        SET "scenarioType" = ${scenarioType},
            difficulty = ${difficultyByType[scenarioType]},
            "datasetVersion" = ${QA_CRITERIA_1_4_8_DATASET_VERSION},
            "scenarioVersion" = 1
        WHERE id = ${scenario.id}
      `;
      created += 1;
    }
  }

  const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "QaEvaluationScenario"
    WHERE "datasetVersion" = ${QA_CRITERIA_1_4_8_DATASET_VERSION}
  `;
  const total = Number(totalRows[0]?.count ?? 0);
  return {
    datasetVersion: QA_CRITERIA_1_4_8_DATASET_VERSION,
    expected: QA_CONTROLLED_DATASET_EXPECTED_SCENARIOS,
    created,
    existing: total - created,
    total,
  };
}

export async function exportQaCriteria148Dataset() {
  const scenarios = await listQaEvaluationScenarios();
  const metadata = await metadataMap(QA_CRITERIA_1_4_8_DATASET_VERSION);
  const selected = scenarios
    .filter((scenario) => metadata.has(scenario.id))
    .map((scenario) => {
      const meta = metadata.get(scenario.id)!;
      return {
        id: scenario.id,
        requirementCode: scenario.requirementCode,
        expectationId: scenario.expectationId,
        name: scenario.name,
        description: scenario.description,
        scenarioType: QaEvaluationScenarioTypeSchema.parse(meta.scenarioType),
        difficulty: QaEvaluationDifficultySchema.parse(meta.difficulty),
        datasetVersion: meta.datasetVersion,
        scenarioVersion: meta.scenarioVersion,
        goldApplicability: scenario.goldApplicability,
        goldState: scenario.goldState,
        goldReviewerId: scenario.goldReviewerId,
        goldReviewerName: scenario.goldReviewerName,
        goldNote: scenario.goldNote,
        evidence: scenario.evidence.map((item) => ({
          id: item.id,
          order: item.order,
          evidenceType: item.evidenceType,
          sourceDomain: item.sourceDomain,
          entityType: item.entityType,
          label: item.label,
          text: item.text,
          referenceKey: item.referenceKey,
          reportingDate: item.reportingDate,
          scope: item.scope,
          provenance: item.provenance,
          periodKey: item.periodKey,
          attributes: item.attributes,
          goldRelevant: item.goldRelevant,
        })),
      };
    })
    .sort((a, b) =>
      a.requirementCode.localeCompare(b.requirementCode) ||
      a.expectationId.localeCompare(b.expectationId) ||
      a.scenarioType.localeCompare(b.scenarioType) ||
      a.scenarioVersion - b.scenarioVersion,
    );

  return {
    schemaVersion: "qa-controlled-dataset-v1" as const,
    frameworkId: AUN_QA_V4_ID,
    datasetVersion: QA_CRITERIA_1_4_8_DATASET_VERSION,
    scenarioCount: selected.length,
    scenarios: selected,
  };
}
