import { randomUUID } from "node:crypto";
import type {
  QaRequirementAssignmentView,
  UpsertQaRequirementAssignmentInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

export class QaAssignmentResourceNotFoundError extends Error {}
export class QaAssignmentScopeMismatchError extends Error {}
export class QaAssignmentAssigneeError extends Error {}

type AssignmentRow = {
  id: string;
  programmeId: string;
  cycleId: string;
  criterionCode: string;
  criterionTitle: string;
  requirementCode: string;
  requirementTitle: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  assignedById: string;
  assignedByName: string;
  createdAt: Date;
  updatedAt: Date;
};

function toView(row: AssignmentRow): QaRequirementAssignmentView {
  return {
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    criterionCode: row.criterionCode,
    criterionTitle: row.criterionTitle,
    requirementCode: row.requirementCode,
    requirementTitle: row.requirementTitle,
    assignee: {
      id: row.assigneeId,
      name: row.assigneeName,
      email: row.assigneeEmail,
    },
    assignedBy: {
      id: row.assignedById,
      name: row.assignedByName,
    },
    assignedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveCycle(programmeId: string, cycleId: string) {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, programmeId: true, frameworkId: true },
  });
  if (!cycle) throw new QaAssignmentResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaAssignmentScopeMismatchError(
      "QA assignment does not belong to this programme cycle",
    );
  }
  return cycle;
}

async function resolveRequirement(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
) {
  const cycle = await resolveCycle(programmeId, cycleId);
  const requirement = await prisma.qaRequirement.findFirst({
    where: {
      code: requirementCode,
      criterion: { frameworkId: cycle.frameworkId },
    },
    select: { id: true, code: true },
  });
  if (!requirement) {
    throw new QaAssignmentResourceNotFoundError("AUN-QA requirement not found for this cycle");
  }
  return requirement;
}

async function ensureQaContributor(userId: string, programmeId: string): Promise<void> {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      programmeId,
      role: { slug: "qa_contributor" },
    },
    select: { userId: true },
  });
  if (!assignment) {
    throw new QaAssignmentAssigneeError(
      "The selected user must hold the QA Contributor role in this programme",
    );
  }
}

async function listRows(
  programmeId: string,
  cycleId: string,
  assigneeId?: string,
): Promise<AssignmentRow[]> {
  if (assigneeId) {
    return prisma.$queryRaw<AssignmentRow[]>`
      SELECT
        a.id,
        a."programmeId",
        a."cycleId",
        c.code AS "criterionCode",
        c.title AS "criterionTitle",
        r.code AS "requirementCode",
        r.title AS "requirementTitle",
        assignee.id AS "assigneeId",
        assignee.name AS "assigneeName",
        assignee.email AS "assigneeEmail",
        assigner.id AS "assignedById",
        assigner.name AS "assignedByName",
        a."createdAt",
        a."updatedAt"
      FROM "QaRequirementAssignment" a
      JOIN "QaRequirement" r ON r.id = a."requirementId"
      JOIN "QaCriterion" c ON c.id = r."criterionId"
      JOIN "User" assignee ON assignee.id = a."assigneeId"
      JOIN "User" assigner ON assigner.id = a."assignedById"
      WHERE a."programmeId" = ${programmeId}
        AND a."cycleId" = ${cycleId}
        AND a."assigneeId" = ${assigneeId}
      ORDER BY c."order", r."order"
    `;
  }

  return prisma.$queryRaw<AssignmentRow[]>`
    SELECT
      a.id,
      a."programmeId",
      a."cycleId",
      c.code AS "criterionCode",
      c.title AS "criterionTitle",
      r.code AS "requirementCode",
      r.title AS "requirementTitle",
      assignee.id AS "assigneeId",
      assignee.name AS "assigneeName",
      assignee.email AS "assigneeEmail",
      assigner.id AS "assignedById",
      assigner.name AS "assignedByName",
      a."createdAt",
      a."updatedAt"
    FROM "QaRequirementAssignment" a
    JOIN "QaRequirement" r ON r.id = a."requirementId"
    JOIN "QaCriterion" c ON c.id = r."criterionId"
    JOIN "User" assignee ON assignee.id = a."assigneeId"
    JOIN "User" assigner ON assigner.id = a."assignedById"
    WHERE a."programmeId" = ${programmeId}
      AND a."cycleId" = ${cycleId}
    ORDER BY c."order", r."order"
  `;
}

export async function listQaRequirementAssignments(
  programmeId: string,
  cycleId: string,
): Promise<QaRequirementAssignmentView[]> {
  await resolveCycle(programmeId, cycleId);
  return (await listRows(programmeId, cycleId)).map(toView);
}

export async function listMyQaRequirementAssignments(
  programmeId: string,
  cycleId: string,
  userId: string,
): Promise<QaRequirementAssignmentView[]> {
  await resolveCycle(programmeId, cycleId);
  return (await listRows(programmeId, cycleId, userId)).map(toView);
}

export async function upsertQaRequirementAssignment(
  cycleId: string,
  requirementCode: string,
  input: UpsertQaRequirementAssignmentInput,
  assignedById: string,
): Promise<QaRequirementAssignmentView> {
  const requirement = await resolveRequirement(
    input.programmeId,
    cycleId,
    requirementCode,
  );
  await ensureQaContributor(input.assigneeId, input.programmeId);

  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "QaRequirementAssignment" (
      id,
      "programmeId",
      "cycleId",
      "requirementId",
      "assigneeId",
      "assignedById",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.programmeId},
      ${cycleId},
      ${requirement.id},
      ${input.assigneeId},
      ${assignedById},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("cycleId", "requirementId") DO UPDATE SET
      "programmeId" = EXCLUDED."programmeId",
      "assigneeId" = EXCLUDED."assigneeId",
      "assignedById" = EXCLUDED."assignedById",
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  const rows = await prisma.$queryRaw<AssignmentRow[]>`
    SELECT
      a.id,
      a."programmeId",
      a."cycleId",
      c.code AS "criterionCode",
      c.title AS "criterionTitle",
      r.code AS "requirementCode",
      r.title AS "requirementTitle",
      assignee.id AS "assigneeId",
      assignee.name AS "assigneeName",
      assignee.email AS "assigneeEmail",
      assigner.id AS "assignedById",
      assigner.name AS "assignedByName",
      a."createdAt",
      a."updatedAt"
    FROM "QaRequirementAssignment" a
    JOIN "QaRequirement" r ON r.id = a."requirementId"
    JOIN "QaCriterion" c ON c.id = r."criterionId"
    JOIN "User" assignee ON assignee.id = a."assigneeId"
    JOIN "User" assigner ON assigner.id = a."assignedById"
    WHERE a."cycleId" = ${cycleId}
      AND a."requirementId" = ${requirement.id}
    LIMIT 1
  `;

  const saved = rows[0];
  if (!saved) {
    throw new QaAssignmentResourceNotFoundError("QA requirement assignment was not saved");
  }
  return toView(saved);
}

export async function deleteQaRequirementAssignment(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<void> {
  const requirement = await resolveRequirement(programmeId, cycleId, requirementCode);
  await prisma.$executeRaw`
    DELETE FROM "QaRequirementAssignment"
    WHERE "programmeId" = ${programmeId}
      AND "cycleId" = ${cycleId}
      AND "requirementId" = ${requirement.id}
  `;
}
