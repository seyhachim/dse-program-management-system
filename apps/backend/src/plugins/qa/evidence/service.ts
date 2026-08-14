import {
  AUN_QA_V4_ID,
  QaEvidenceSourceDomainSchema,
  type QaEvidenceCandidateResultView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  retrieveEvidenceCandidates,
  type ExpectedEvidenceDefinition,
} from "./registry.ts";

type DefinitionRow = {
  id: string;
  evidenceType: string;
  sourceDomain: string;
};

export class QaEvidenceCandidateResourceNotFoundError extends Error {}

export async function getQaEvidenceCandidates(
  programmeId: string,
  expectedEvidenceId: string,
): Promise<QaEvidenceCandidateResultView> {
  const [programme, definitions] = await Promise.all([
    prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true } }),
    prisma.$queryRaw<DefinitionRow[]>`
      SELECT x.id, x."evidenceType", x."sourceDomain"
      FROM "QaExpectedEvidence" x
      JOIN "QaQualityExpectation" e ON e.id = x."expectationId"
      JOIN "QaRequirement" r ON r.id = e."requirementId"
      JOIN "QaCriterion" c ON c.id = r."criterionId"
      WHERE x.id = ${expectedEvidenceId}
        AND c."frameworkId" = ${AUN_QA_V4_ID}
        AND e.active = true
      LIMIT 1
    `,
  ]);

  const row = definitions[0];
  if (!programme) {
    throw new QaEvidenceCandidateResourceNotFoundError("Programme not found");
  }
  if (!row) {
    throw new QaEvidenceCandidateResourceNotFoundError("Expected evidence definition not found");
  }

  const sourceDomain = QaEvidenceSourceDomainSchema.safeParse(row.sourceDomain);
  if (!sourceDomain.success) {
    throw new Error(`Unsupported QA evidence source domain: ${row.sourceDomain}`);
  }

  const definition: ExpectedEvidenceDefinition = {
    id: row.id,
    evidenceType: row.evidenceType,
    sourceDomain: sourceDomain.data,
  };
  return retrieveEvidenceCandidates(programmeId, definition);
}
