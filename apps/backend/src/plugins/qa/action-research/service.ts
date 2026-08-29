import { randomUUID } from "node:crypto";
import type {
  CreateResearchAssignmentInput,
  CreateResearchProjectInput,
  LockResearchBaselineInput,
  MyActionResearchView,
  ResearchAssignmentStatus,
  ResearchAssignmentView,
  ResearchBaselineLockView,
  ResearchCycleStatus,
  ResearchCycleView,
  ResearchProjectView,
  ResearchProtocolStatus,
  ResearchProtocolView,
  ReviewResearchProtocolInput,
  SaveResearchProtocolInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { assertAssignmentTransition, nextActionForCycleStatus } from "./policy.ts";

export class ActionResearchNotFoundError extends Error {}
export class ActionResearchScopeMismatchError extends Error {}
export class ActionResearchConflictError extends Error {}
export class ActionResearchAuthorizationError extends Error {}

interface ProjectRow {
  id: string;
  programmeId: string;
  title: string;
  problemStatement: string;
  researchQuestion: string;
  courseId: string | null;
  offeringId: string | null;
  cohortId: string | null;
  academicYear: string;
  semester: string;
  cloId: string | null;
  ploId: string | null;
  status: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CycleRow {
  id: string;
  projectId: string;
  cycleNumber: number;
  status: ResearchCycleStatus;
  systemBoundary: string;
  dynamicHypothesis: string;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AssignmentRow {
  id: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  assignedById: string;
  role: ResearchAssignmentView["role"];
  instructions: string;
  dueDate: Date | null;
  acceptedAt: Date | null;
  status: ResearchAssignmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface ProtocolRow {
  id: string;
  cycleId: string;
  version: number;
  status: ResearchProtocolStatus;
  practicalProblem: string;
  researchQuestion: string;
  systemBoundary: string;
  baselinePattern: string;
  dynamicHypothesis: string;
  interventionPlan: string;
  expectedDelay: string;
  primaryIndicators: unknown;
  secondaryIndicators: unknown;
  successCriteria: string;
  comparisonDesign: string;
  dataSources: unknown;
  analysisPlan: string;
  fidelityPlan: string;
  ethicsPrivacyStatus: string;
  validityRisks: string;
  plannedReflectionDate: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdById: string;
  reviewedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface BaselineRow {
  id: string;
  cycleId: string;
  protocolId: string;
  baselineStart: Date;
  baselineEnd: Date;
  snapshot: unknown;
  lockedById: string;
  lockedAt: Date;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assignmentView(row: AssignmentRow): ResearchAssignmentView {
  return {
    id: row.id,
    projectId: row.projectId,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    assignedById: row.assignedById,
    role: row.role,
    instructions: row.instructions,
    dueDate: row.dueDate?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function protocolView(row: ProtocolRow): ResearchProtocolView {
  return {
    id: row.id,
    cycleId: row.cycleId,
    version: row.version,
    status: row.status,
    practicalProblem: row.practicalProblem,
    researchQuestion: row.researchQuestion,
    systemBoundary: row.systemBoundary,
    baselinePattern: row.baselinePattern,
    dynamicHypothesis: row.dynamicHypothesis,
    interventionPlan: row.interventionPlan,
    expectedDelay: row.expectedDelay,
    primaryIndicators: stringArray(row.primaryIndicators),
    secondaryIndicators: stringArray(row.secondaryIndicators),
    successCriteria: row.successCriteria,
    comparisonDesign: row.comparisonDesign,
    dataSources: stringArray(row.dataSources),
    analysisPlan: row.analysisPlan,
    fidelityPlan: row.fidelityPlan,
    ethicsPrivacyStatus: row.ethicsPrivacyStatus,
    validityRisks: row.validityRisks,
    plannedReflectionDate: row.plannedReflectionDate?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdById: row.createdById,
    reviewedById: row.reviewedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function baselineView(row: BaselineRow): ResearchBaselineLockView {
  return {
    id: row.id,
    cycleId: row.cycleId,
    protocolId: row.protocolId,
    baselineStart: row.baselineStart.toISOString(),
    baselineEnd: row.baselineEnd.toISOString(),
    snapshot: Array.isArray(row.snapshot) ? (row.snapshot as ResearchBaselineLockView["snapshot"]) : [],
    lockedById: row.lockedById,
    lockedAt: row.lockedAt.toISOString(),
  };
}

async function programmeExists(programmeId: string): Promise<boolean> {
  return (await prisma.programme.count({ where: { id: programmeId } })) > 0;
}

async function projectRow(projectId: string): Promise<ProjectRow> {
  const rows = await prisma.$queryRaw<ProjectRow[]>`
    SELECT * FROM "ActionResearchProject" WHERE "id" = ${projectId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ActionResearchNotFoundError("Action Research project not found");
  return row;
}

async function cycleRow(cycleId: string): Promise<CycleRow> {
  const rows = await prisma.$queryRaw<CycleRow[]>`
    SELECT * FROM "ActionResearchCycle" WHERE "id" = ${cycleId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ActionResearchNotFoundError("Action Research cycle not found");
  return row;
}

async function protocolRow(protocolId: string): Promise<ProtocolRow> {
  const rows = await prisma.$queryRaw<ProtocolRow[]>`
    SELECT * FROM "ActionResearchProtocol" WHERE "id" = ${protocolId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ActionResearchNotFoundError("Research protocol not found");
  return row;
}

async function latestProtocolRow(cycleId: string): Promise<ProtocolRow | null> {
  const rows = await prisma.$queryRaw<ProtocolRow[]>`
    SELECT * FROM "ActionResearchProtocol"
    WHERE "cycleId" = ${cycleId}
    ORDER BY "version" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function currentCycleRow(projectId: string): Promise<CycleRow | null> {
  const rows = await prisma.$queryRaw<CycleRow[]>`
    SELECT * FROM "ActionResearchCycle"
    WHERE "projectId" = ${projectId}
    ORDER BY "cycleNumber" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function baselineRow(cycleId: string): Promise<BaselineRow | null> {
  const rows = await prisma.$queryRaw<BaselineRow[]>`
    SELECT * FROM "ActionResearchBaselineLock" WHERE "cycleId" = ${cycleId} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function assignmentRows(projectId: string): Promise<AssignmentRow[]> {
  return prisma.$queryRaw<AssignmentRow[]>`
    SELECT a.*, u."name" AS "assigneeName"
    FROM "ActionResearchAssignment" a
    JOIN "User" u ON u."id" = a."assigneeId"
    WHERE a."projectId" = ${projectId}
    ORDER BY a."createdAt" ASC
  `;
}

async function audit(
  projectId: string,
  cycleId: string | null,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const id = randomUUID();
  const json = JSON.stringify(payload);
  await prisma.$executeRaw`
    INSERT INTO "ActionResearchAuditEvent" ("id", "projectId", "cycleId", "actorId", "eventType", "payload")
    VALUES (${id}, ${projectId}, ${cycleId}, ${actorId}, ${eventType}, ${json}::jsonb)
  `;
}

export async function assertProjectProgramme(projectId: string, programmeId: string): Promise<void> {
  const row = await projectRow(projectId);
  if (row.programmeId !== programmeId) {
    throw new ActionResearchScopeMismatchError("Action Research project does not belong to this programme");
  }
}

export async function assertCycleProgramme(cycleId: string, programmeId: string): Promise<void> {
  const cycle = await cycleRow(cycleId);
  const project = await projectRow(cycle.projectId);
  if (project.programmeId !== programmeId) {
    throw new ActionResearchScopeMismatchError("Action Research cycle does not belong to this programme");
  }
}

export async function assertProtocolProgramme(protocolId: string, programmeId: string): Promise<void> {
  const protocol = await protocolRow(protocolId);
  await assertCycleProgramme(protocol.cycleId, programmeId);
}

export async function createResearchProject(
  input: CreateResearchProjectInput,
  actorId: string,
): Promise<ResearchProjectView> {
  if (!(await programmeExists(input.programmeId))) {
    throw new ActionResearchNotFoundError("Programme not found");
  }
  const projectId = randomUUID();
  const cycleId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "ActionResearchProject" (
        "id", "programmeId", "title", "problemStatement", "researchQuestion",
        "courseId", "offeringId", "cohortId", "academicYear", "semester", "cloId", "ploId", "createdById"
      ) VALUES (
        ${projectId}, ${input.programmeId}, ${input.title}, ${input.problemStatement}, ${input.researchQuestion},
        ${input.courseId ?? null}, ${input.offeringId ?? null}, ${input.cohortId ?? null},
        ${input.academicYear}, ${input.semester}, ${input.cloId ?? null}, ${input.ploId ?? null}, ${actorId}
      )
    `;
    await tx.$executeRaw`
      INSERT INTO "ActionResearchCycle" ("id", "projectId", "cycleNumber", "status")
      VALUES (${cycleId}, ${projectId}, 1, 'DRAFT')
    `;
  });
  await audit(projectId, cycleId, actorId, "PROJECT_CREATED", { title: input.title });
  return getResearchProject(projectId);
}

export async function listResearchProjects(programmeId: string): Promise<ResearchProjectView[]> {
  const rows = await prisma.$queryRaw<ProjectRow[]>`
    SELECT * FROM "ActionResearchProject"
    WHERE "programmeId" = ${programmeId}
    ORDER BY "updatedAt" DESC
  `;
  return Promise.all(rows.map((row) => getResearchProject(row.id)));
}

export async function getResearchProject(projectId: string): Promise<ResearchProjectView> {
  const project = await projectRow(projectId);
  const [cycle, assignments] = await Promise.all([currentCycleRow(projectId), assignmentRows(projectId)]);
  let currentCycle: ResearchCycleView | null = null;
  if (cycle) {
    const [protocol, baseline] = await Promise.all([
      latestProtocolRow(cycle.id),
      baselineRow(cycle.id),
    ]);
    currentCycle = {
      id: cycle.id,
      projectId: cycle.projectId,
      cycleNumber: cycle.cycleNumber,
      status: cycle.status,
      systemBoundary: cycle.systemBoundary,
      dynamicHypothesis: cycle.dynamicHypothesis,
      baselineStart: cycle.baselineStart?.toISOString() ?? null,
      baselineEnd: cycle.baselineEnd?.toISOString() ?? null,
      currentProtocol: protocol ? protocolView(protocol) : null,
      baselineLock: baseline ? baselineView(baseline) : null,
      createdAt: cycle.createdAt.toISOString(),
      updatedAt: cycle.updatedAt.toISOString(),
    };
  }
  return {
    id: project.id,
    programmeId: project.programmeId,
    title: project.title,
    problemStatement: project.problemStatement,
    researchQuestion: project.researchQuestion,
    courseId: project.courseId,
    offeringId: project.offeringId,
    cohortId: project.cohortId,
    academicYear: project.academicYear,
    semester: project.semester,
    cloId: project.cloId,
    ploId: project.ploId,
    status: project.status,
    createdById: project.createdById,
    currentCycle,
    assignments: assignments.map(assignmentView),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

async function assigneeProgrammeRoles(userId: string, programmeId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ slug: string }>>`
    SELECT r."slug"
    FROM "UserRoleAssignment" ura
    JOIN "Role" r ON r."id" = ura."roleId"
    WHERE ura."userId" = ${userId}
      AND (ura."programmeId" = ${programmeId} OR ura."programmeId" IS NULL)
      AND r."active" = true
  `;
  return rows.map((row) => row.slug);
}

export async function createResearchAssignment(
  projectId: string,
  input: CreateResearchAssignmentInput,
  actorId: string,
): Promise<ResearchAssignmentView> {
  await assertProjectProgramme(projectId, input.programmeId);
  const user = await prisma.user.findUnique({ where: { id: input.assigneeId }, select: { id: true, name: true } });
  if (!user) throw new ActionResearchNotFoundError("Research assignee not found");
  const roles = await assigneeProgrammeRoles(input.assigneeId, input.programmeId);
  const allowed = input.role === "REVIEWER"
    ? roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role))
    : roles.some((role) => ["admin", "program_coordinator", "lecturer"].includes(role));
  if (!allowed) {
    throw new ActionResearchAuthorizationError("Assignee does not hold an eligible programme role");
  }
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "ActionResearchAssignment" (
      "id", "projectId", "assigneeId", "assignedById", "role", "instructions", "dueDate", "status"
    ) VALUES (
      ${id}, ${projectId}, ${input.assigneeId}, ${actorId}, ${input.role}, ${input.instructions},
      ${input.dueDate ?? null}, 'ASSIGNED'
    )
    ON CONFLICT ("projectId", "assigneeId", "role") DO UPDATE SET
      "assignedById" = EXCLUDED."assignedById",
      "instructions" = EXCLUDED."instructions",
      "dueDate" = EXCLUDED."dueDate",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
  await audit(projectId, null, actorId, "ASSIGNMENT_SAVED", {
    assigneeId: input.assigneeId,
    role: input.role,
    dueDate: input.dueDate?.toISOString() ?? null,
  });
  const rows = await assignmentRows(projectId);
  const row = rows.find((item) => item.assigneeId === input.assigneeId && item.role === input.role);
  if (!row) throw new ActionResearchNotFoundError("Saved research assignment could not be loaded");
  return assignmentView(row);
}

export async function listResearchAssignments(projectId: string): Promise<ResearchAssignmentView[]> {
  return (await assignmentRows(projectId)).map(assignmentView);
}

export async function updateResearchAssignmentStatus(
  assignmentId: string,
  userId: string,
  next: ResearchAssignmentStatus,
): Promise<ResearchAssignmentView> {
  const rows = await prisma.$queryRaw<AssignmentRow[]>`
    SELECT a.*, u."name" AS "assigneeName"
    FROM "ActionResearchAssignment" a
    JOIN "User" u ON u."id" = a."assigneeId"
    WHERE a."id" = ${assignmentId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ActionResearchNotFoundError("Research assignment not found");
  if (row.assigneeId !== userId) throw new ActionResearchAuthorizationError("Only the assignee can update this status");
  assertAssignmentTransition(row.status, next);
  const acceptedAt = next === "ACCEPTED" ? new Date() : row.acceptedAt;
  await prisma.$executeRaw`
    UPDATE "ActionResearchAssignment"
    SET "status" = ${next}, "acceptedAt" = ${acceptedAt}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${assignmentId}
  `;
  if (next === "IN_PROGRESS") {
    await prisma.$executeRaw`
      UPDATE "ActionResearchProject" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${row.projectId}
    `;
  }
  await audit(row.projectId, null, userId, "ASSIGNMENT_STATUS_CHANGED", { from: row.status, to: next });
  const refreshed = await prisma.$queryRaw<AssignmentRow[]>`
    SELECT a.*, u."name" AS "assigneeName"
    FROM "ActionResearchAssignment" a
    JOIN "User" u ON u."id" = a."assigneeId"
    WHERE a."id" = ${assignmentId} LIMIT 1
  `;
  return assignmentView(refreshed[0]!);
}

export async function listMyActionResearch(
  programmeId: string,
  userId: string,
): Promise<MyActionResearchView> {
  const rows = await prisma.$queryRaw<Array<AssignmentRow & ProjectRow & { assignmentId: string; assignmentStatus: ResearchAssignmentStatus }>>`
    SELECT
      a."id" AS "assignmentId", a."projectId", a."assigneeId", u."name" AS "assigneeName",
      a."assignedById", a."role", a."instructions", a."dueDate", a."acceptedAt",
      a."status" AS "assignmentStatus", a."createdAt", a."updatedAt",
      p."programmeId", p."title", p."problemStatement", p."researchQuestion", p."courseId",
      p."offeringId", p."cohortId", p."academicYear", p."semester", p."cloId", p."ploId",
      p."status", p."createdById"
    FROM "ActionResearchAssignment" a
    JOIN "ActionResearchProject" p ON p."id" = a."projectId"
    JOIN "User" u ON u."id" = a."assigneeId"
    WHERE a."assigneeId" = ${userId} AND p."programmeId" = ${programmeId}
    ORDER BY a."updatedAt" DESC
  `;
  const assignments = await Promise.all(rows.map(async (row) => {
    const cycle = await currentCycleRow(row.projectId);
    const stage = cycle?.status ?? "DRAFT";
    return {
      id: row.assignmentId,
      projectId: row.projectId,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      assignedById: row.assignedById,
      role: row.role,
      instructions: row.instructions,
      dueDate: row.dueDate?.toISOString() ?? null,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      status: row.assignmentStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      project: {
        id: row.projectId,
        programmeId: row.programmeId,
        title: row.title,
        problemStatement: row.problemStatement,
        academicYear: row.academicYear,
        semester: row.semester,
      },
      currentStage: stage,
      nextAction: nextActionForCycleStatus(stage),
      overdue: Boolean(row.dueDate && row.dueDate.getTime() < Date.now() && row.assignmentStatus !== "COMPLETED"),
    };
  }));
  return {
    assignments,
    counts: {
      assigned: assignments.filter((item) => item.status === "ASSIGNED").length,
      inProgress: assignments.filter((item) => ["ACCEPTED", "IN_PROGRESS"].includes(item.status)).length,
      needsRevision: assignments.filter((item) => item.status === "REVISION_REQUIRED").length,
      awaitingReview: assignments.filter((item) => item.status === "SUBMITTED").length,
      completed: assignments.filter((item) => item.status === "COMPLETED").length,
    },
  };
}

async function assertResearcherForCycle(cycleId: string, userId: string): Promise<CycleRow> {
  const cycle = await cycleRow(cycleId);
  const rows = await prisma.$queryRaw<Array<{ role: string }>>`
    SELECT "role" FROM "ActionResearchAssignment"
    WHERE "projectId" = ${cycle.projectId} AND "assigneeId" = ${userId}
      AND "role" IN ('LEAD_RESEARCHER','CO_RESEARCHER')
    LIMIT 1
  `;
  if (!rows[0]) throw new ActionResearchAuthorizationError("Only an assigned researcher can edit this protocol");
  return cycle;
}

export async function saveResearchProtocol(
  cycleId: string,
  input: SaveResearchProtocolInput,
  actorId: string,
): Promise<ResearchProtocolView> {
  await assertCycleProgramme(cycleId, input.programmeId);
  const cycle = await assertResearcherForCycle(cycleId, actorId);
  const latest = await latestProtocolRow(cycleId);
  if (latest?.status === "SUBMITTED") {
    throw new ActionResearchConflictError("Submitted protocol is awaiting review and cannot be edited");
  }
  const makeNewVersion = !latest || latest.status === "APPROVED" || latest.status === "REVISION_REQUIRED";
  const protocolId = makeNewVersion ? randomUUID() : latest.id;
  const version = makeNewVersion ? (latest?.version ?? 0) + 1 : latest.version;
  const primaryIndicators = JSON.stringify(input.primaryIndicators);
  const secondaryIndicators = JSON.stringify(input.secondaryIndicators);
  const dataSources = JSON.stringify(input.dataSources);
  if (makeNewVersion) {
    await prisma.$executeRaw`
      INSERT INTO "ActionResearchProtocol" (
        "id", "cycleId", "version", "status", "practicalProblem", "researchQuestion", "systemBoundary",
        "baselinePattern", "dynamicHypothesis", "interventionPlan", "expectedDelay", "primaryIndicators",
        "secondaryIndicators", "successCriteria", "comparisonDesign", "dataSources", "analysisPlan",
        "fidelityPlan", "ethicsPrivacyStatus", "validityRisks", "plannedReflectionDate", "createdById"
      ) VALUES (
        ${protocolId}, ${cycleId}, ${version}, 'DRAFT', ${input.practicalProblem}, ${input.researchQuestion}, ${input.systemBoundary},
        ${input.baselinePattern}, ${input.dynamicHypothesis}, ${input.interventionPlan}, ${input.expectedDelay}, ${primaryIndicators}::jsonb,
        ${secondaryIndicators}::jsonb, ${input.successCriteria}, ${input.comparisonDesign}, ${dataSources}::jsonb,
        ${input.analysisPlan}, ${input.fidelityPlan}, ${input.ethicsPrivacyStatus}, ${input.validityRisks},
        ${input.plannedReflectionDate ?? null}, ${actorId}
      )
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "ActionResearchProtocol" SET
        "practicalProblem" = ${input.practicalProblem}, "researchQuestion" = ${input.researchQuestion},
        "systemBoundary" = ${input.systemBoundary}, "baselinePattern" = ${input.baselinePattern},
        "dynamicHypothesis" = ${input.dynamicHypothesis}, "interventionPlan" = ${input.interventionPlan},
        "expectedDelay" = ${input.expectedDelay}, "primaryIndicators" = ${primaryIndicators}::jsonb,
        "secondaryIndicators" = ${secondaryIndicators}::jsonb, "successCriteria" = ${input.successCriteria},
        "comparisonDesign" = ${input.comparisonDesign}, "dataSources" = ${dataSources}::jsonb,
        "analysisPlan" = ${input.analysisPlan}, "fidelityPlan" = ${input.fidelityPlan},
        "ethicsPrivacyStatus" = ${input.ethicsPrivacyStatus}, "validityRisks" = ${input.validityRisks},
        "plannedReflectionDate" = ${input.plannedReflectionDate ?? null}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${protocolId}
    `;
  }
  await prisma.$executeRaw`
    UPDATE "ActionResearchCycle"
    SET "systemBoundary" = ${input.systemBoundary}, "dynamicHypothesis" = ${input.dynamicHypothesis},
        "status" = 'DRAFT', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${cycleId}
  `;
  await audit(cycle.projectId, cycleId, actorId, "PROTOCOL_SAVED", { protocolId, version });
  return protocolView(await protocolRow(protocolId));
}

export async function submitResearchProtocol(
  cycleId: string,
  programmeId: string,
  actorId: string,
): Promise<ResearchProtocolView> {
  await assertCycleProgramme(cycleId, programmeId);
  const cycle = await assertResearcherForCycle(cycleId, actorId);
  const protocol = await latestProtocolRow(cycleId);
  if (!protocol) throw new ActionResearchConflictError("Create the research protocol before submitting it");
  if (protocol.status !== "DRAFT") throw new ActionResearchConflictError("Only a draft protocol can be submitted");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "ActionResearchProtocol"
      SET "status" = 'SUBMITTED', "submittedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${protocol.id}
    `;
    await tx.$executeRaw`
      UPDATE "ActionResearchCycle" SET "status" = 'PROTOCOL_REVIEW', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${cycleId}
    `;
  });
  await audit(cycle.projectId, cycleId, actorId, "PROTOCOL_SUBMITTED", { protocolId: protocol.id, version: protocol.version });
  return protocolView(await protocolRow(protocol.id));
}

export async function reviewResearchProtocol(
  protocolId: string,
  input: ReviewResearchProtocolInput,
  reviewerId: string,
): Promise<ResearchProtocolView> {
  await assertProtocolProgramme(protocolId, input.programmeId);
  const protocol = await protocolRow(protocolId);
  if (protocol.status !== "SUBMITTED") throw new ActionResearchConflictError("Only a submitted protocol can be reviewed");
  const cycle = await cycleRow(protocol.cycleId);
  const researcher = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ActionResearchAssignment"
    WHERE "projectId" = ${cycle.projectId} AND "assigneeId" = ${reviewerId}
      AND "role" IN ('LEAD_RESEARCHER','CO_RESEARCHER')
    LIMIT 1
  `;
  if (researcher[0]) throw new ActionResearchAuthorizationError("Researchers cannot approve their own protocol");
  const reviewId = randomUUID();
  const nextProtocolStatus = input.action === "APPROVE" ? "APPROVED" : "REVISION_REQUIRED";
  const nextCycleStatus = input.action === "APPROVE" ? "PROTOCOL_APPROVED" : "REVISION_REQUIRED";
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "ActionResearchProtocolReview" ("id", "protocolId", "reviewerId", "action", "comment")
      VALUES (${reviewId}, ${protocolId}, ${reviewerId}, ${input.action}, ${input.comment})
    `;
    await tx.$executeRaw`
      UPDATE "ActionResearchProtocol" SET
        "status" = ${nextProtocolStatus}, "reviewedById" = ${reviewerId},
        "approvedAt" = ${input.action === "APPROVE" ? new Date() : null}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${protocolId}
    `;
    await tx.$executeRaw`
      UPDATE "ActionResearchCycle" SET "status" = ${nextCycleStatus}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${protocol.cycleId}
    `;
  });
  await audit(cycle.projectId, protocol.cycleId, reviewerId, `PROTOCOL_${input.action}`, {
    protocolId,
    comment: input.comment,
  });
  return protocolView(await protocolRow(protocolId));
}

export async function lockResearchBaseline(
  cycleId: string,
  input: LockResearchBaselineInput,
  actorId: string,
): Promise<ResearchBaselineLockView> {
  await assertCycleProgramme(cycleId, input.programmeId);
  const cycle = await cycleRow(cycleId);
  const protocol = await latestProtocolRow(cycleId);
  if (!protocol || protocol.status !== "APPROVED") {
    throw new ActionResearchConflictError("Protocol approval is required before locking the baseline");
  }
  if (await baselineRow(cycleId)) throw new ActionResearchConflictError("Baseline is already locked for this cycle");
  const id = randomUUID();
  const snapshot = JSON.stringify(input.indicatorDefinitions);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "ActionResearchBaselineLock" (
        "id", "cycleId", "protocolId", "baselineStart", "baselineEnd", "snapshot", "lockedById"
      ) VALUES (
        ${id}, ${cycleId}, ${protocol.id}, ${input.baselineStart}, ${input.baselineEnd}, ${snapshot}::jsonb, ${actorId}
      )
    `;
    await tx.$executeRaw`
      UPDATE "ActionResearchCycle" SET
        "baselineStart" = ${input.baselineStart}, "baselineEnd" = ${input.baselineEnd},
        "status" = 'BASELINE_LOCKED', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${cycleId}
    `;
  });
  await audit(cycle.projectId, cycleId, actorId, "BASELINE_LOCKED", {
    protocolId: protocol.id,
    baselineStart: input.baselineStart.toISOString(),
    baselineEnd: input.baselineEnd.toISOString(),
    indicators: input.indicatorDefinitions.map((item) => item.key),
  });
  return baselineView((await baselineRow(cycleId))!);
}
