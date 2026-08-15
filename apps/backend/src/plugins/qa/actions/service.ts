import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  CarryForwardQaImprovementActionInput,
  CreateQaImprovementActionInput,
  QaImprovementActionStatus,
  QaImprovementActionView,
  UpdateQaImprovementActionInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

const toDbStatus = {
  open: "Open",
  inProgress: "InProgress",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

const fromDbStatus = {
  Open: "open",
  InProgress: "inProgress",
  Completed: "completed",
  Cancelled: "cancelled",
} as const;

type DbStatus = keyof typeof fromDbStatus;

type DbActionRow = {
  id: string;
  programmeId: string;
  cycleId: string;
  requirementId: string;
  requirementCode: string;
  analysisId: string;
  reviewId: string;
  ownerId: string | null;
  ownerName: string | null;
  plannedAction: string;
  indicator: string;
  dueDate: Date | null;
  status: DbStatus;
  result: string;
  effectivenessReview: string;
  completedAt: Date | null;
  carriedFromActionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class QaImprovementActionResourceNotFoundError extends Error {}
export class QaImprovementActionScopeMismatchError extends Error {}
export class QaImprovementActionEligibilityError extends Error {}
export class QaImprovementActionLifecycleError extends Error {}

function toView(action: DbActionRow): QaImprovementActionView {
  const status = fromDbStatus[action.status] as QaImprovementActionStatus;
  const overdue =
    action.dueDate !== null &&
    action.dueDate.getTime() < Date.now() &&
    (status === "open" || status === "inProgress");
  return {
    id: action.id,
    programmeId: action.programmeId,
    cycleId: action.cycleId,
    requirementCode: action.requirementCode,
    analysisId: action.analysisId,
    reviewId: action.reviewId,
    ownerId: action.ownerId,
    ownerName: action.ownerName,
    plannedAction: action.plannedAction,
    indicator: action.indicator,
    dueDate: action.dueDate?.toISOString() ?? null,
    status,
    result: action.result,
    effectivenessReview: action.effectivenessReview,
    completedAt: action.completedAt?.toISOString() ?? null,
    carriedFromActionId: action.carriedFromActionId,
    overdue,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}

const actionSelect = Prisma.sql`
  SELECT a."id", a."programmeId", a."cycleId", a."requirementId",
         r."code" AS "requirementCode", a."analysisId", a."reviewId",
         a."ownerId", u."name" AS "ownerName", a."plannedAction",
         a."indicator", a."dueDate", a."status", a."result",
         a."effectivenessReview", a."completedAt", a."carriedFromActionId",
         a."createdAt", a."updatedAt"
  FROM "QaImprovementAction" a
  JOIN "QaRequirement" r ON r."id" = a."requirementId"
  LEFT JOIN "User" u ON u."id" = a."ownerId"
`;

async function getAction(actionId: string): Promise<DbActionRow | null> {
  const rows = await prisma.$queryRaw<DbActionRow[]>(Prisma.sql`
    ${actionSelect}
    WHERE a."id" = ${actionId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function ensureOwner(ownerId: string | null | undefined): Promise<void> {
  if (!ownerId) return;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) throw new QaImprovementActionResourceNotFoundError("Improvement action owner not found");
}

export async function createQaImprovementAction(
  input: CreateQaImprovementActionInput,
): Promise<QaImprovementActionView> {
  const [cycle, analysis, review] = await Promise.all([
    prisma.qaAssessmentCycle.findUnique({
      where: { id: input.cycleId },
      select: { id: true, programmeId: true },
    }),
    prisma.qaEvidenceAnalysis.findUnique({
      where: { id: input.analysisId },
      select: { id: true, programmeId: true, cycleId: true, requirementId: true, state: true },
    }),
    prisma.qaEvidenceAnalysisReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true, programmeId: true, analysisId: true, decision: true },
    }),
  ]);
  if (!cycle || !analysis || !review) {
    throw new QaImprovementActionResourceNotFoundError(
      "Assessment cycle, evidence analysis, or human review not found",
    );
  }
  if (
    cycle.programmeId !== input.programmeId ||
    analysis.programmeId !== input.programmeId ||
    analysis.cycleId !== input.cycleId ||
    review.programmeId !== input.programmeId ||
    review.analysisId !== input.analysisId
  ) {
    throw new QaImprovementActionScopeMismatchError(
      "Improvement action provenance does not belong to the same programme, cycle, and analysis",
    );
  }
  if (analysis.state === "EvidenceIdentified") {
    throw new QaImprovementActionEligibilityError(
      "An evidence-identified finding cannot automatically become a CQI action; create actions only from validated gap/uncertainty findings",
    );
  }
  if (review.decision === "Rejected") {
    throw new QaImprovementActionEligibilityError(
      "A rejected evidence finding cannot create a CQI action",
    );
  }
  await ensureOwner(input.ownerId);

  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaImprovementAction" (
      "id", "programmeId", "cycleId", "requirementId", "analysisId", "reviewId",
      "ownerId", "plannedAction", "indicator", "dueDate", "status", "updatedAt"
    ) VALUES (
      ${id}, ${input.programmeId}, ${input.cycleId}, ${analysis.requirementId},
      ${input.analysisId}, ${input.reviewId}, ${input.ownerId}, ${input.plannedAction},
      ${input.indicator}, ${input.dueDate}, 'Open'::"QaImprovementActionStatus", CURRENT_TIMESTAMP
    )
  `);
  const created = await getAction(id);
  if (!created) throw new QaImprovementActionResourceNotFoundError("Created improvement action not found");
  return toView(created);
}

export async function updateQaImprovementAction(
  actionId: string,
  input: UpdateQaImprovementActionInput,
): Promise<QaImprovementActionView> {
  const existing = await getAction(actionId);
  if (!existing) throw new QaImprovementActionResourceNotFoundError("Improvement action not found");
  if (existing.programmeId !== input.programmeId) {
    throw new QaImprovementActionScopeMismatchError("Improvement action does not belong to this programme");
  }
  if (existing.status === "Completed" || existing.status === "Cancelled") {
    throw new QaImprovementActionLifecycleError(
      "Closed improvement actions are immutable; carry forward or create a new action instead",
    );
  }
  await ensureOwner(input.ownerId);

  const nextOwnerId = input.ownerId !== undefined ? input.ownerId : existing.ownerId;
  const nextPlannedAction = input.plannedAction ?? existing.plannedAction;
  const nextIndicator = input.indicator ?? existing.indicator;
  const nextDueDate = input.dueDate !== undefined ? input.dueDate : existing.dueDate;
  const nextStatus = input.status ? toDbStatus[input.status] : existing.status;
  const nextResult = input.result ?? existing.result;
  const nextEffectivenessReview = input.effectivenessReview ?? existing.effectivenessReview;
  const closing = input.status === "completed" || input.status === "cancelled";
  const completedAt = closing ? new Date() : existing.completedAt;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "QaImprovementAction"
    SET "ownerId" = ${nextOwnerId},
        "plannedAction" = ${nextPlannedAction},
        "indicator" = ${nextIndicator},
        "dueDate" = ${nextDueDate},
        "status" = ${nextStatus}::"QaImprovementActionStatus",
        "result" = ${nextResult},
        "effectivenessReview" = ${nextEffectivenessReview},
        "completedAt" = ${completedAt},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${actionId}
  `);
  const updated = await getAction(actionId);
  if (!updated) throw new QaImprovementActionResourceNotFoundError("Updated improvement action not found");
  return toView(updated);
}

export async function carryForwardQaImprovementAction(
  actionId: string,
  input: CarryForwardQaImprovementActionInput,
): Promise<QaImprovementActionView> {
  const [source, targetCycle] = await Promise.all([
    getAction(actionId),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: input.targetCycleId },
      select: { id: true, programmeId: true },
    }),
  ]);
  if (!source || !targetCycle) {
    throw new QaImprovementActionResourceNotFoundError(
      "Improvement action or target assessment cycle not found",
    );
  }
  if (
    source.programmeId !== input.programmeId ||
    targetCycle.programmeId !== input.programmeId
  ) {
    throw new QaImprovementActionScopeMismatchError(
      "Carry-forward action and target cycle must belong to the same programme",
    );
  }
  if (source.cycleId === input.targetCycleId) {
    throw new QaImprovementActionLifecycleError(
      "Carry forward requires a different assessment cycle",
    );
  }
  if (source.status === "Completed" || source.status === "Cancelled") {
    throw new QaImprovementActionLifecycleError(
      "Only unresolved improvement actions can be carried forward",
    );
  }
  await ensureOwner(input.ownerId);

  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaImprovementAction" (
      "id", "programmeId", "cycleId", "requirementId", "analysisId", "reviewId",
      "ownerId", "plannedAction", "indicator", "dueDate", "status",
      "carriedFromActionId", "updatedAt"
    ) VALUES (
      ${id}, ${source.programmeId}, ${input.targetCycleId}, ${source.requirementId},
      ${source.analysisId}, ${source.reviewId}, ${input.ownerId ?? source.ownerId},
      ${source.plannedAction}, ${source.indicator}, ${input.dueDate},
      'Open'::"QaImprovementActionStatus", ${source.id}, CURRENT_TIMESTAMP
    )
  `);
  const created = await getAction(id);
  if (!created) throw new QaImprovementActionResourceNotFoundError("Carried improvement action not found");
  return toView(created);
}

export async function listQaImprovementActions(
  programmeId: string,
  options: { cycleId?: string; status?: QaImprovementActionStatus } = {},
): Promise<QaImprovementActionView[]> {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true },
  });
  if (!programme) throw new QaImprovementActionResourceNotFoundError("Programme not found");

  const cycleId = options.cycleId ?? null;
  const status = options.status ? toDbStatus[options.status] : null;
  const rows = await prisma.$queryRaw<DbActionRow[]>(Prisma.sql`
    ${actionSelect}
    WHERE a."programmeId" = ${programmeId}
      AND (${cycleId}::text IS NULL OR a."cycleId" = ${cycleId})
      AND (${status}::text IS NULL OR a."status"::text = ${status})
    ORDER BY a."dueDate" ASC NULLS LAST, a."createdAt" DESC
  `);
  return rows.map(toView);
}
