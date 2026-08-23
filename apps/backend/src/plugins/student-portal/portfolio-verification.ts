import { createHash, randomUUID } from "node:crypto";
import type {
  StudentPortfolioVerificationDecisionInput,
  StudentPortfolioVerificationEvent,
  StudentPortfolioVerificationState,
  StudentPortfolioVerificationSummary,
  StudentPortfolioSupervisorRelationshipInput,
} from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";

const STATE_TO_DB: Record<StudentPortfolioVerificationState, string> = {
  unverified: "Unverified",
  verified: "Verified",
  needs_changes: "NeedsChanges",
  revoked: "Revoked",
};
const STATE_FROM_DB: Record<string, StudentPortfolioVerificationState> = {
  Unverified: "unverified",
  Verified: "verified",
  NeedsChanges: "needs_changes",
  Revoked: "revoked",
};
const CONTEXT_FROM_DB = { Lecturer: "lecturer", Supervisor: "supervisor", System: "system" } as const;

type EventRow = {
  id: string;
  previousState: string;
  newState: string;
  actorContext: "Lecturer" | "Supervisor" | "System";
  actorName: string | null;
  reason: string;
  createdAt: Date;
};

type Snapshot = {
  evidenceId: string;
  title: string;
  summary: string;
  role: string;
  contribution: string;
  skills: string[];
  links: Array<{ kind: string; label: string; url: string }>;
  softSkillCodes: string[];
  source: { offeringId: string | null; courseSpecId: string | null; assessmentItemId: string | null };
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashSnapshot(snapshot: Snapshot): string {
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

async function evidenceSnapshot(evidenceId: string): Promise<{ studentId: string; snapshot: Snapshot; lecturerIds: string[] }> {
  const row = await prisma.studentPortfolioEvidence.findUnique({
    where: { id: evidenceId },
    include: {
      links: { orderBy: { createdAt: "asc" } },
      sourceOffering: {
        select: {
          lecturerId: true,
          coLecturers: { select: { lecturerId: true } },
        },
      },
    },
  });
  if (!row) throw new PortalNotFoundError("Portfolio evidence was not found");
  const softSkills = await prisma.$queryRaw<Array<{ skillCode: string }>>`
    SELECT "skillCode" FROM "StudentPortfolioEvidenceSoftSkill"
    WHERE "evidenceId" = ${evidenceId} ORDER BY "skillCode" ASC
  `;
  return {
    studentId: row.studentId,
    lecturerIds: [row.sourceOffering?.lecturerId, ...(row.sourceOffering?.coLecturers.map((item) => item.lecturerId) ?? [])]
      .filter((value): value is string => Boolean(value)),
    snapshot: {
      evidenceId: row.id,
      title: row.title,
      summary: row.summary,
      role: row.role,
      contribution: row.contribution,
      skills: [...row.skills].sort(),
      links: row.links.map((link) => ({ kind: link.kind, label: link.label, url: link.url })),
      softSkillCodes: softSkills.map((item) => item.skillCode),
      source: {
        offeringId: row.sourceOfferingId,
        courseSpecId: row.sourceCourseSpecId,
        assessmentItemId: row.sourceAssessmentItemId,
      },
    },
  };
}

async function currentState(evidenceId: string): Promise<StudentPortfolioVerificationState> {
  const rows = await prisma.$queryRaw<Array<{ newState: string }>>`
    SELECT "newState"::text AS "newState"
    FROM "StudentPortfolioVerificationEvent"
    WHERE "evidenceId" = ${evidenceId}
    ORDER BY "createdAt" DESC, "id" DESC LIMIT 1
  `;
  return rows[0] ? STATE_FROM_DB[rows[0].newState] : "unverified";
}

async function appendEvent(input: {
  evidenceId: string;
  actorId: string | null;
  actorContext: "Lecturer" | "Supervisor" | "System";
  previousState: StudentPortfolioVerificationState;
  newState: StudentPortfolioVerificationState;
  reason: string;
  snapshot: Snapshot;
}) {
  const id = randomUUID();
  const previous = STATE_TO_DB[input.previousState];
  const next = STATE_TO_DB[input.newState];
  await prisma.$executeRaw`
    INSERT INTO "StudentPortfolioVerificationEvent" (
      "id", "evidenceId", "actorId", "actorContext", "previousState", "newState",
      "reason", "snapshot", "snapshotHash", "createdAt"
    ) VALUES (
      ${id}, ${input.evidenceId}, ${input.actorId}, ${input.actorContext}::"StudentPortfolioVerificationContext",
      ${previous}::"StudentPortfolioVerificationState", ${next}::"StudentPortfolioVerificationState",
      ${input.reason}, ${JSON.stringify(input.snapshot)}::jsonb, ${hashSnapshot(input.snapshot)}, CURRENT_TIMESTAMP
    )
  `;
}

async function actorContext(actor: AuthUser, studentId: string, lecturerIds: string[]): Promise<"Lecturer" | "Supervisor"> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } });
  if (student?.userId === actor.id) throw new PortalAccessError("Students cannot verify their own portfolio evidence");

  if (actor.roles.includes("lecturer") && lecturerIds.includes(actor.id)) return "Lecturer";

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StudentPortfolioSupervisorRelationship"
    WHERE "studentId" = ${studentId} AND "supervisorUserId" = ${actor.id} AND "status" = 'Approved'
    LIMIT 1
  `;
  if (rows[0]) return "Supervisor";
  throw new PortalAccessError("You do not have verification authority for this evidence");
}

export async function invalidateVerifiedEvidenceAfterMaterialEdit(evidenceId: string, beforeHash: string): Promise<void> {
  const state = await currentState(evidenceId);
  if (state !== "verified") return;
  const { snapshot } = await evidenceSnapshot(evidenceId);
  if (hashSnapshot(snapshot) === beforeHash) return;
  await appendEvent({
    evidenceId,
    actorId: null,
    actorContext: "System",
    previousState: "verified",
    newState: "unverified",
    reason: "Verification invalidated because student-visible evidence content changed after verification.",
    snapshot,
  });
}

export async function portfolioEvidenceSnapshotHash(evidenceId: string): Promise<string> {
  return hashSnapshot((await evidenceSnapshot(evidenceId)).snapshot);
}

export const studentPortfolioVerificationService = {
  async summary(evidenceId: string): Promise<StudentPortfolioVerificationSummary> {
    const rows = await prisma.$queryRaw<EventRow[]>`
      SELECT e."id", e."previousState"::text AS "previousState", e."newState"::text AS "newState",
             e."actorContext"::text AS "actorContext", u."name" AS "actorName", e."reason", e."createdAt"
      FROM "StudentPortfolioVerificationEvent" e
      LEFT JOIN "User" u ON u."id" = e."actorId"
      WHERE e."evidenceId" = ${evidenceId}
      ORDER BY e."createdAt" DESC, e."id" DESC LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { state: "unverified", context: null, verifiedAt: null, actorName: null };
    return {
      state: STATE_FROM_DB[row.newState],
      context: CONTEXT_FROM_DB[row.actorContext],
      verifiedAt: row.newState === "Verified" ? row.createdAt.toISOString() : null,
      actorName: row.actorName,
    };
  },

  async history(userId: string, evidenceId: string): Promise<StudentPortfolioVerificationEvent[]> {
    const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
    const evidence = await prisma.studentPortfolioEvidence.findFirst({ where: { id: evidenceId, studentId: student?.id ?? "" }, select: { id: true } });
    if (!evidence) throw new PortalNotFoundError("Portfolio evidence was not found");
    const rows = await prisma.$queryRaw<EventRow[]>`
      SELECT e."id", e."previousState"::text AS "previousState", e."newState"::text AS "newState",
             e."actorContext"::text AS "actorContext", u."name" AS "actorName", e."reason", e."createdAt"
      FROM "StudentPortfolioVerificationEvent" e
      LEFT JOIN "User" u ON u."id" = e."actorId"
      WHERE e."evidenceId" = ${evidenceId}
      ORDER BY e."createdAt" ASC, e."id" ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      previousState: STATE_FROM_DB[row.previousState],
      newState: STATE_FROM_DB[row.newState],
      actorContext: CONTEXT_FROM_DB[row.actorContext],
      actorName: row.actorName,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  async decide(actor: AuthUser, evidenceId: string, decision: StudentPortfolioVerificationDecisionInput): Promise<StudentPortfolioVerificationSummary> {
    const { studentId, snapshot, lecturerIds } = await evidenceSnapshot(evidenceId);
    const context = await actorContext(actor, studentId, lecturerIds);
    const previousState = await currentState(evidenceId);
    await appendEvent({
      evidenceId,
      actorId: actor.id,
      actorContext: context,
      previousState,
      newState: decision.state,
      reason: decision.reason,
      snapshot,
    });
    return this.summary(evidenceId);
  },

  async approveSupervisor(actor: AuthUser, input: StudentPortfolioSupervisorRelationshipInput) {
    if (!actor.roles.some((role) => role === "admin" || role === "program_coordinator")) {
      throw new PortalAccessError("Only Admin or Programme Coordinator can approve portfolio supervisors");
    }
    const student = await prisma.student.findUnique({ where: { id: input.studentRecordId }, select: { id: true } });
    const supervisor = await prisma.user.findUnique({ where: { id: input.supervisorUserId }, select: { id: true } });
    if (!student || !supervisor) throw new PortalNotFoundError("Student or supervisor account was not found");
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "StudentPortfolioSupervisorRelationship" (
        "id", "studentId", "supervisorUserId", "status", "approvedById", "approvedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${student.id}, ${supervisor.id}, 'Approved', ${actor.id}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("studentId", "supervisorUserId") DO UPDATE SET
        "status" = 'Approved', "approvedById" = EXCLUDED."approvedById", "approvedAt" = CURRENT_TIMESTAMP,
        "revokedById" = NULL, "revokedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    `;
    return { ok: true };
  },
};
