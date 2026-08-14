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

export class QaImprovementActionResourceNotFoundError extends Error {}
export class QaImprovementActionScopeMismatchError extends Error {}
export class QaImprovementActionEligibilityError extends Error {}
export class QaImprovementActionLifecycleError extends Error {}

function toView(action: {
  id: string;
  programmeId: string;
  cycleId: string;
  analysisId: string;
  reviewId: string;
  ownerId: string | null;
  plannedAction: string;
  indicator: string;
  dueDate: Date | null;
  status: keyof typeof fromDbStatus;
  result: string;
  effectivenessReview: string;
  completedAt: Date | null;
  carriedFromActionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  requirement: { code: string };
  owner: { name: string } | null;
}): QaImprovementActionView {
  const status = fromDbStatus[action.status] as QaImprovementActionStatus;
  const overdue =
    action.dueDate !== null &&
    action.dueDate.getTime() < Date.now() &&
    (status === "open" || status === "inProgress");
  return {
    id: action.id,
    programmeId: action.programmeId,
    cycleId: action.cycleId,
    requirementCode: action.requirement.code,
    analysisId: action.analysisId,
    reviewId: action.reviewId,
    ownerId: action.ownerId,
    ownerName: action.owner?.name ?? null,
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

const includeView = {
  requirement: { select: { code: true } },
  owner: { select: { name: true } },
} as const;

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

  const created = await prisma.qaImprovementAction.create({
    data: {
      programmeId: input.programmeId,
      cycleId: input.cycleId,
      requirementId: analysis.requirementId,
      analysisId: input.analysisId,
      reviewId: input.reviewId,
      ownerId: input.ownerId,
      plannedAction: input.plannedAction,
      indicator: input.indicator,
      dueDate: input.dueDate,
      status: "Open",
    },
    include: includeView,
  });
  return toView(created);
}

export async function updateQaImprovementAction(
  actionId: string,
  input: UpdateQaImprovementActionInput,
): Promise<QaImprovementActionView> {
  const existing = await prisma.qaImprovementAction.findUnique({
    where: { id: actionId },
    select: { id: true, programmeId: true, status: true },
  });
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

  const closing = input.status === "completed" || input.status === "cancelled";
  const updated = await prisma.qaImprovementAction.update({
    where: { id: actionId },
    data: {
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.plannedAction !== undefined ? { plannedAction: input.plannedAction } : {}),
      ...(input.indicator !== undefined ? { indicator: input.indicator } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.status !== undefined ? { status: toDbStatus[input.status] } : {}),
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.effectivenessReview !== undefined
        ? { effectivenessReview: input.effectivenessReview }
        : {}),
      ...(closing ? { completedAt: new Date() } : {}),
    },
    include: includeView,
  });
  return toView(updated);
}

export async function carryForwardQaImprovementAction(
  actionId: string,
  input: CarryForwardQaImprovementActionInput,
): Promise<QaImprovementActionView> {
  const [source, targetCycle] = await Promise.all([
    prisma.qaImprovementAction.findUnique({
      where: { id: actionId },
      include: includeView,
    }),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: input.targetCycleId },
      select: { id: true, programmeId: true, frameworkId: true },
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

  const created = await prisma.qaImprovementAction.create({
    data: {
      programmeId: source.programmeId,
      cycleId: input.targetCycleId,
      requirementId: source.requirementId,
      analysisId: source.analysisId,
      reviewId: source.reviewId,
      ownerId: input.ownerId ?? source.ownerId,
      plannedAction: source.plannedAction,
      indicator: source.indicator,
      dueDate: input.dueDate,
      status: "Open",
      carriedFromActionId: source.id,
    },
    include: includeView,
  });
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

  const rows = await prisma.qaImprovementAction.findMany({
    where: {
      programmeId,
      ...(options.cycleId ? { cycleId: options.cycleId } : {}),
      ...(options.status ? { status: toDbStatus[options.status] } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: includeView,
  });
  return rows.map(toView);
}
