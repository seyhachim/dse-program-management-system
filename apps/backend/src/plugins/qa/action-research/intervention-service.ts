import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  CreateResearchInterventionInput,
  CreateResearchInterventionLogInput,
  ResearchAssignmentRole,
  ResearchCycleStatus,
  ResearchInterventionStatus,
  ResearchInterventionView,
  UpdateResearchInterventionInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  ActionResearchAuthorizationError,
  ActionResearchConflictError,
  ActionResearchNotFoundError,
  assertCycleProgramme,
} from "./service.ts";
import {
  assertCanCompleteIntervention,
  assertCanLogIntervention,
  assertCanPlanIntervention,
  assertInterventionTransition,
  canManageIntervention,
} from "./policy.ts";
import {
  addStoredIntervention,
  cycleStatusForInterventions,
  deriveInterventionFlags,
  parseStoredInterventions,
  replaceStoredIntervention,
  type StoredResearchIntervention,
  type StoredResearchInterventionLog,
} from "./intervention-state.ts";

interface CycleInterventionRow {
  id: string;
  projectId: string;
  status: ResearchCycleStatus;
  interventions: unknown;
}

interface AssignmentRoleRow {
  role: ResearchAssignmentRole;
}

async function cycleInterventionRow(cycleId: string): Promise<CycleInterventionRow> {
  const rows = await prisma.$queryRaw<CycleInterventionRow[]>`
    SELECT "id", "projectId", "status", "interventions"
    FROM "ActionResearchCycle"
    WHERE "id" = ${cycleId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ActionResearchNotFoundError("Action Research cycle not found");
  return row;
}

async function cycleByInterventionId(
  interventionId: string,
  programmeId: string,
): Promise<CycleInterventionRow> {
  const rows = await prisma.$queryRaw<CycleInterventionRow[]>`
    SELECT c."id", c."projectId", c."status", c."interventions"
    FROM "ActionResearchCycle" c
    JOIN "ActionResearchProject" p ON p."id" = c."projectId"
    WHERE p."programmeId" = ${programmeId}
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(c."interventions") item
        WHERE item->>'id' = ${interventionId}
      )
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ActionResearchNotFoundError("Research intervention not found");
  return row;
}

async function assignmentRoles(projectId: string, userId: string): Promise<ResearchAssignmentRole[]> {
  const rows = await prisma.$queryRaw<AssignmentRoleRow[]>`
    SELECT "role"
    FROM "ActionResearchAssignment"
    WHERE "projectId" = ${projectId} AND "assigneeId" = ${userId}
  `;
  return rows.map((row) => row.role);
}

async function assertCanReadCycle(
  cycle: CycleInterventionRow,
  userId: string,
  canManageProject: boolean,
): Promise<void> {
  if (canManageProject) return;
  if ((await assignmentRoles(cycle.projectId, userId)).length === 0) {
    throw new ActionResearchAuthorizationError("You are not assigned to this Action Research project");
  }
}

async function assertResearcher(cycle: CycleInterventionRow, userId: string): Promise<void> {
  const roles = await assignmentRoles(cycle.projectId, userId);
  if (!roles.some((role) => canManageIntervention(role))) {
    throw new ActionResearchAuthorizationError("Only an assigned researcher can manage interventions");
  }
}

async function assertResponsibleResearchers(
  projectId: string,
  responsibleResearcherIds: string[],
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ assigneeId: string }>>`
    SELECT DISTINCT "assigneeId"
    FROM "ActionResearchAssignment"
    WHERE "projectId" = ${projectId}
      AND "role" IN ('LEAD_RESEARCHER', 'CO_RESEARCHER')
  `;
  const eligible = new Set(rows.map((row) => row.assigneeId));
  const invalid = responsibleResearcherIds.filter((id) => !eligible.has(id));
  if (invalid.length > 0) {
    throw new ActionResearchAuthorizationError(
      "Responsible researchers must be assigned to this Action Research project",
    );
  }
}

async function auditTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  cycleId: string,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const id = randomUUID();
  const json = JSON.stringify(payload);
  await tx.$executeRaw`
    INSERT INTO "ActionResearchAuditEvent" ("id", "projectId", "cycleId", "actorId", "eventType", "payload")
    VALUES (${id}, ${projectId}, ${cycleId}, ${actorId}, ${eventType}, ${json}::jsonb)
  `;
}

async function lockedCycle(
  tx: Prisma.TransactionClient,
  cycleId: string,
): Promise<CycleInterventionRow> {
  const rows = await tx.$queryRaw<CycleInterventionRow[]>`
    SELECT "id", "projectId", "status", "interventions"
    FROM "ActionResearchCycle"
    WHERE "id" = ${cycleId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new ActionResearchNotFoundError("Action Research cycle not found");
  return row;
}

async function renderInterventions(
  cycleId: string,
  interventions: StoredResearchIntervention[],
): Promise<ResearchInterventionView[]> {
  const userIds = new Set<string>();
  for (const intervention of interventions) {
    intervention.responsibleResearcherIds.forEach((id) => userIds.add(id));
    intervention.logs.forEach((log) => userIds.add(log.authorId));
  }
  const users = userIds.size > 0
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return [...interventions]
    .sort((left, right) => Date.parse(left.plannedStart) - Date.parse(right.plannedStart))
    .map((intervention) => {
      const flags = deriveInterventionFlags(intervention);
      return {
        id: intervention.id,
        cycleId,
        title: intervention.title,
        description: intervention.description,
        target: intervention.target,
        plannedStart: intervention.plannedStart,
        plannedEnd: intervention.plannedEnd,
        expectedEffect: intervention.expectedEffect,
        expectedDelay: intervention.expectedDelay,
        status: intervention.status,
        version: intervention.version,
        createdById: intervention.createdById,
        responsibleResearchers: intervention.responsibleResearcherIds.map((userId) => ({
          userId,
          name: names.get(userId) ?? "Unknown user",
        })),
        logs: [...intervention.logs]
          .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
          .map((log) => ({
            ...log,
            interventionId: intervention.id,
            authorName: names.get(log.authorId) ?? "Unknown user",
          })),
        ...flags,
        createdAt: intervention.createdAt,
        updatedAt: intervention.updatedAt,
      };
    });
}

export async function listResearchInterventions(
  cycleId: string,
  programmeId: string,
  actorId: string,
  canManageProject: boolean,
): Promise<ResearchInterventionView[]> {
  await assertCycleProgramme(cycleId, programmeId);
  const cycle = await cycleInterventionRow(cycleId);
  await assertCanReadCycle(cycle, actorId, canManageProject);
  return renderInterventions(cycleId, parseStoredInterventions(cycle.interventions));
}

export async function createResearchIntervention(
  cycleId: string,
  input: CreateResearchInterventionInput,
  actorId: string,
): Promise<ResearchInterventionView> {
  await assertCycleProgramme(cycleId, input.programmeId);
  const cycle = await cycleInterventionRow(cycleId);
  await assertResearcher(cycle, actorId);
  assertCanPlanIntervention(cycle.status);
  await assertResponsibleResearchers(cycle.projectId, input.responsibleResearcherIds);

  const now = new Date().toISOString();
  const created: StoredResearchIntervention = {
    id: randomUUID(),
    title: input.title,
    description: input.description,
    target: input.target,
    responsibleResearcherIds: input.responsibleResearcherIds,
    plannedStart: input.plannedStart.toISOString(),
    plannedEnd: input.plannedEnd.toISOString(),
    expectedEffect: input.expectedEffect,
    expectedDelay: input.expectedDelay,
    status: "PLANNED",
    version: 1,
    createdById: actorId,
    logs: [],
    createdAt: now,
    updatedAt: now,
  };

  await prisma.$transaction(async (tx) => {
    const locked = await lockedCycle(tx, cycleId);
    assertCanPlanIntervention(locked.status);
    const next = addStoredIntervention(parseStoredInterventions(locked.interventions), created);
    const json = JSON.stringify(next);
    await tx.$executeRaw`
      UPDATE "ActionResearchCycle"
      SET "interventions" = ${json}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${cycleId}
    `;
    await auditTx(tx, locked.projectId, cycleId, actorId, "INTERVENTION_CREATED", {
      interventionId: created.id,
      version: created.version,
      title: created.title,
      target: created.target,
      responsibleResearcherIds: created.responsibleResearcherIds,
      plannedStart: created.plannedStart,
      plannedEnd: created.plannedEnd,
      expectedEffect: created.expectedEffect,
      expectedDelay: created.expectedDelay,
    });
  });

  return (await renderInterventions(cycleId, [created]))[0]!;
}

export async function updateResearchIntervention(
  interventionId: string,
  input: UpdateResearchInterventionInput,
  actorId: string,
): Promise<ResearchInterventionView> {
  const cycle = await cycleByInterventionId(interventionId, input.programmeId);
  await assertResearcher(cycle, actorId);
  await assertResponsibleResearchers(cycle.projectId, input.responsibleResearcherIds);

  const updated = await prisma.$transaction(async (tx) => {
    const locked = await lockedCycle(tx, cycle.id);
    const current = parseStoredInterventions(locked.interventions);
    const existing = current.find((item) => item.id === interventionId);
    if (!existing) throw new ActionResearchNotFoundError("Research intervention not found");
    if (existing.status !== "PLANNED") {
      throw new ActionResearchConflictError("Only a planned intervention can be edited");
    }
    assertCanPlanIntervention(locked.status);
    const nextIntervention: StoredResearchIntervention = {
      ...existing,
      title: input.title,
      description: input.description,
      target: input.target,
      responsibleResearcherIds: input.responsibleResearcherIds,
      plannedStart: input.plannedStart.toISOString(),
      plannedEnd: input.plannedEnd.toISOString(),
      expectedEffect: input.expectedEffect,
      expectedDelay: input.expectedDelay,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const next = replaceStoredIntervention(current, nextIntervention);
    const json = JSON.stringify(next);
    await tx.$executeRaw`
      UPDATE "ActionResearchCycle"
      SET "interventions" = ${json}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${locked.id}
    `;
    await auditTx(tx, locked.projectId, locked.id, actorId, "INTERVENTION_PLAN_UPDATED", {
      interventionId,
      fromVersion: existing.version,
      toVersion: nextIntervention.version,
      previousPlan: {
        title: existing.title,
        description: existing.description,
        target: existing.target,
        responsibleResearcherIds: existing.responsibleResearcherIds,
        plannedStart: existing.plannedStart,
        plannedEnd: existing.plannedEnd,
        expectedEffect: existing.expectedEffect,
        expectedDelay: existing.expectedDelay,
      },
      nextPlan: {
        title: nextIntervention.title,
        description: nextIntervention.description,
        target: nextIntervention.target,
        responsibleResearcherIds: nextIntervention.responsibleResearcherIds,
        plannedStart: nextIntervention.plannedStart,
        plannedEnd: nextIntervention.plannedEnd,
        expectedEffect: nextIntervention.expectedEffect,
        expectedDelay: nextIntervention.expectedDelay,
      },
    });
    return nextIntervention;
  });

  return (await renderInterventions(cycle.id, [updated]))[0]!;
}

export async function updateResearchInterventionStatus(
  interventionId: string,
  programmeId: string,
  status: ResearchInterventionStatus,
  actorId: string,
): Promise<ResearchInterventionView> {
  const cycle = await cycleByInterventionId(interventionId, programmeId);
  await assertResearcher(cycle, actorId);

  const updated = await prisma.$transaction(async (tx) => {
    const locked = await lockedCycle(tx, cycle.id);
    const current = parseStoredInterventions(locked.interventions);
    const existing = current.find((item) => item.id === interventionId);
    if (!existing) throw new ActionResearchNotFoundError("Research intervention not found");
    assertInterventionTransition(existing.status, status);
    if (status === "ACTIVE") assertCanPlanIntervention(locked.status);
    if (status === "COMPLETED") assertCanCompleteIntervention(existing.logs.length);

    const nextIntervention: StoredResearchIntervention = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    const next = replaceStoredIntervention(current, nextIntervention);
    const nextCycleStatus = cycleStatusForInterventions(locked.status, next);
    const json = JSON.stringify(next);
    await tx.$executeRaw`
      UPDATE "ActionResearchCycle"
      SET "interventions" = ${json}::jsonb,
          "status" = ${nextCycleStatus},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${locked.id}
    `;
    await auditTx(tx, locked.projectId, locked.id, actorId, "INTERVENTION_STATUS_CHANGED", {
      interventionId,
      from: existing.status,
      to: status,
      planVersion: existing.version,
      cycleStatus: nextCycleStatus,
    });
    return nextIntervention;
  });

  return (await renderInterventions(cycle.id, [updated]))[0]!;
}

export async function createResearchInterventionLog(
  interventionId: string,
  input: CreateResearchInterventionLogInput,
  actorId: string,
): Promise<ResearchInterventionView> {
  const cycle = await cycleByInterventionId(interventionId, input.programmeId);
  await assertResearcher(cycle, actorId);

  const updated = await prisma.$transaction(async (tx) => {
    const locked = await lockedCycle(tx, cycle.id);
    const current = parseStoredInterventions(locked.interventions);
    const existing = current.find((item) => item.id === interventionId);
    if (!existing) throw new ActionResearchNotFoundError("Research intervention not found");
    assertCanLogIntervention(locked.status, existing.status);

    const log: StoredResearchInterventionLog = {
      id: randomUUID(),
      planVersion: existing.version,
      occurredAt: input.occurredAt.toISOString(),
      plannedDosage: input.plannedDosage,
      deliveredDosage: input.deliveredDosage,
      reachCount: input.reachCount ?? null,
      reachDenominator: input.reachDenominator ?? null,
      reachNote: input.reachNote,
      deviation: input.deviation,
      deviationReason: input.deviationReason,
      contextualEvents: input.contextualEvents,
      lecturerObservation: input.lecturerObservation,
      evidenceRefs: input.evidenceRefs,
      authorId: actorId,
      createdAt: new Date().toISOString(),
    };
    const nextIntervention: StoredResearchIntervention = {
      ...existing,
      logs: [...existing.logs, log],
      updatedAt: log.createdAt,
    };
    const next = replaceStoredIntervention(current, nextIntervention);
    const json = JSON.stringify(next);
    await tx.$executeRaw`
      UPDATE "ActionResearchCycle"
      SET "interventions" = ${json}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${locked.id}
    `;
    await auditTx(tx, locked.projectId, locked.id, actorId, "INTERVENTION_FIDELITY_LOGGED", {
      interventionId,
      logId: log.id,
      planVersion: log.planVersion,
      occurredAt: log.occurredAt,
      plannedDosage: log.plannedDosage,
      deliveredDosage: log.deliveredDosage,
      reachCount: log.reachCount,
      reachDenominator: log.reachDenominator,
      deviation: log.deviation,
      deviationReason: log.deviationReason,
      contextualEvents: log.contextualEvents,
      lecturerObservation: log.lecturerObservation,
      evidenceRefs: log.evidenceRefs,
    });
    return nextIntervention;
  });

  return (await renderInterventions(cycle.id, [updated]))[0]!;
}
