import type {
  ClassResponsibilityAuditEvent,
  ClassResponsibilityRole,
  ClassResponsibilityView,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class ClassResponsibilityNotFoundError extends Error {}
export class ClassResponsibilityConflictError extends Error {}
export class ClassResponsibilityEligibilityError extends Error {}

interface AssignmentRow {
  id: string;
  offeringId: string;
  studentId: string;
  role: ClassResponsibilityRole;
  assignedAt: Date;
  assignedById: string;
  assignedByName: string;
  studentUserId: string | null;
  studentNumber: string;
  studentName: string;
  revokedAt: Date | null;
  revokedById: string | null;
  revokedByName: string | null;
  revokeReason: string;
}

interface AuditRow {
  id: string;
  assignmentId: string | null;
  offeringId: string;
  studentId: string;
  actorId: string;
  actorName: string;
  action: "Assigned" | "Revoked" | "Reassigned";
  previousRole: ClassResponsibilityRole | null;
  newRole: ClassResponsibilityRole | null;
  reason: string;
  details: unknown | null;
  createdAt: Date;
}

function assignmentView(row: AssignmentRow): ClassResponsibilityView {
  return {
    id: row.id,
    offeringId: row.offeringId,
    role: row.role,
    student: {
      id: row.studentId,
      userId: row.studentUserId,
      studentId: row.studentNumber,
      name: row.studentName,
    },
    assignedAt: row.assignedAt.toISOString(),
    assignedBy: { id: row.assignedById, name: row.assignedByName },
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedBy:
      row.revokedById && row.revokedByName
        ? { id: row.revokedById, name: row.revokedByName }
        : null,
    revokeReason: row.revokeReason,
  };
}

async function assignmentRows(offeringId: string, activeOnly: boolean): Promise<AssignmentRow[]> {
  const activeClause = activeOnly ? `AND a."revokedAt" IS NULL` : "";
  return prisma.$queryRawUnsafe<AssignmentRow[]>(
    `
      SELECT
        a."id", a."offeringId", a."studentId", a."role",
        a."assignedAt", a."assignedById", assigner."name" AS "assignedByName",
        s."userId" AS "studentUserId", s."studentId" AS "studentNumber", s."name" AS "studentName",
        a."revokedAt", a."revokedById", revoker."name" AS "revokedByName", a."revokeReason"
      FROM "ClassResponsibilityAssignment" a
      JOIN "Student" s ON s."id" = a."studentId"
      JOIN "User" assigner ON assigner."id" = a."assignedById"
      LEFT JOIN "User" revoker ON revoker."id" = a."revokedById"
      WHERE a."offeringId" = $1
      ${activeClause}
      ORDER BY a."assignedAt" ASC
    `,
    offeringId,
  );
}

async function validateEligibleStudent(offeringId: string, studentId: string) {
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    include: { course: { select: { programmeId: true } } },
  });
  if (!offering) throw new ClassResponsibilityNotFoundError("Offering not found");

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, status: true, userId: true, studentId: true, name: true },
  });
  if (!student) throw new ClassResponsibilityNotFoundError("Student not found");
  if (student.status !== "Active") {
    throw new ClassResponsibilityEligibilityError("Only active students can hold class responsibilities");
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { offeringId_studentId: { offeringId, studentId } },
    select: { id: true },
  });
  if (!enrollment) {
    throw new ClassResponsibilityEligibilityError(
      "Class responsibilities can only be assigned to students enrolled in this offering",
    );
  }

  return { offering, student };
}

export const classResponsibilityService = {
  async programmeIdForOffering(offeringId: string): Promise<string> {
    const offering = await prisma.offering.findUnique({
      where: { id: offeringId },
      select: { course: { select: { programmeId: true } } },
    });
    if (!offering) throw new ClassResponsibilityNotFoundError("Offering not found");
    return offering.course.programmeId;
  },

  async list(offeringId: string): Promise<ClassResponsibilityView[]> {
    await this.programmeIdForOffering(offeringId);
    return (await assignmentRows(offeringId, true)).map(assignmentView);
  },

  async history(offeringId: string): Promise<ClassResponsibilityAuditEvent[]> {
    await this.programmeIdForOffering(offeringId);
    const rows = await prisma.$queryRaw<AuditRow[]>`
      SELECT
        e."id", e."assignmentId", e."offeringId", e."studentId", e."actorId",
        u."name" AS "actorName", e."action", e."previousRole", e."newRole",
        e."reason", e."details", e."createdAt"
      FROM "ClassResponsibilityAuditEvent" e
      JOIN "User" u ON u."id" = e."actorId"
      WHERE e."offeringId" = ${offeringId}
      ORDER BY e."createdAt" ASC, e."id" ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      assignmentId: row.assignmentId,
      offeringId: row.offeringId,
      studentId: row.studentId,
      actor: { id: row.actorId, name: row.actorName },
      action: row.action,
      previousRole: row.previousRole,
      newRole: row.newRole,
      reason: row.reason,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  async assign(
    offeringId: string,
    studentId: string,
    role: ClassResponsibilityRole,
    actorId: string,
  ): Promise<ClassResponsibilityView> {
    await validateEligibleStudent(offeringId, studentId);

    const assignmentId = crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
      const sameStudent = await tx.$queryRaw<Array<{ id: string; role: ClassResponsibilityRole }>>`
        SELECT "id", "role"
        FROM "ClassResponsibilityAssignment"
        WHERE "offeringId" = ${offeringId}
          AND "studentId" = ${studentId}
          AND "revokedAt" IS NULL
        FOR UPDATE
      `;
      if (sameStudent.length > 0) {
        throw new ClassResponsibilityConflictError(
          "A student cannot hold both active class responsibilities for the same offering",
        );
      }

      const current = await tx.$queryRaw<Array<{ id: string; studentId: string; role: ClassResponsibilityRole }>>`
        SELECT "id", "studentId", "role"
        FROM "ClassResponsibilityAssignment"
        WHERE "offeringId" = ${offeringId}
          AND "role" = ${role}::"ClassResponsibilityRole"
          AND "revokedAt" IS NULL
        FOR UPDATE
      `;

      if (current[0]) {
        await tx.$executeRaw`
          UPDATE "ClassResponsibilityAssignment"
          SET "revokedAt" = CURRENT_TIMESTAMP,
              "revokedById" = ${actorId},
              "revokeReason" = 'Replaced by a new assignment',
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${current[0].id}
        `;
        await tx.$executeRaw`
          INSERT INTO "ClassResponsibilityAuditEvent"
            ("id", "assignmentId", "offeringId", "studentId", "actorId", "action", "previousRole", "newRole", "reason")
          VALUES
            (${crypto.randomUUID()}, ${current[0].id}, ${offeringId}, ${current[0].studentId}, ${actorId},
             'Reassigned'::"ClassResponsibilityAuditAction", ${role}::"ClassResponsibilityRole", ${role}::"ClassResponsibilityRole",
             'Replaced by a new assignment')
        `;
      }

      await tx.$executeRaw`
        INSERT INTO "ClassResponsibilityAssignment"
          ("id", "offeringId", "studentId", "role", "assignedById")
        VALUES
          (${assignmentId}, ${offeringId}, ${studentId}, ${role}::"ClassResponsibilityRole", ${actorId})
      `;
      await tx.$executeRaw`
        INSERT INTO "ClassResponsibilityAuditEvent"
          ("id", "assignmentId", "offeringId", "studentId", "actorId", "action", "newRole")
        VALUES
          (${crypto.randomUUID()}, ${assignmentId}, ${offeringId}, ${studentId}, ${actorId},
           'Assigned'::"ClassResponsibilityAuditAction", ${role}::"ClassResponsibilityRole")
      `;
    });

    const rows = await assignmentRows(offeringId, true);
    const created = rows.find((row) => row.id === assignmentId);
    if (!created) throw new Error("Class responsibility assignment was not persisted");
    return assignmentView(created);
  },

  async revoke(offeringId: string, assignmentId: string, actorId: string, reason: string): Promise<boolean> {
    await this.programmeIdForOffering(offeringId);
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; studentId: string; role: ClassResponsibilityRole; revokedAt: Date | null }>>`
        SELECT "id", "studentId", "role", "revokedAt"
        FROM "ClassResponsibilityAssignment"
        WHERE "id" = ${assignmentId} AND "offeringId" = ${offeringId}
        FOR UPDATE
      `;
      const assignment = rows[0];
      if (!assignment) throw new ClassResponsibilityNotFoundError("Class responsibility assignment not found");
      if (assignment.revokedAt) return false;

      await tx.$executeRaw`
        UPDATE "ClassResponsibilityAssignment"
        SET "revokedAt" = CURRENT_TIMESTAMP,
            "revokedById" = ${actorId},
            "revokeReason" = ${reason},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${assignmentId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ClassResponsibilityAuditEvent"
          ("id", "assignmentId", "offeringId", "studentId", "actorId", "action", "previousRole", "reason")
        VALUES
          (${crypto.randomUUID()}, ${assignmentId}, ${offeringId}, ${assignment.studentId}, ${actorId},
           'Revoked'::"ClassResponsibilityAuditAction", ${assignment.role}::"ClassResponsibilityRole", ${reason})
      `;
      return true;
    });
  },

  async getActiveForUser(userId: string, offeringId: string): Promise<ClassResponsibilityView | null> {
    const rows = await prisma.$queryRaw<AssignmentRow[]>`
      SELECT
        a."id", a."offeringId", a."studentId", a."role",
        a."assignedAt", a."assignedById", assigner."name" AS "assignedByName",
        s."userId" AS "studentUserId", s."studentId" AS "studentNumber", s."name" AS "studentName",
        a."revokedAt", a."revokedById", revoker."name" AS "revokedByName", a."revokeReason"
      FROM "ClassResponsibilityAssignment" a
      JOIN "Student" s ON s."id" = a."studentId"
      JOIN "Enrollment" en ON en."studentId" = s."id" AND en."offeringId" = a."offeringId"
      JOIN "User" assigner ON assigner."id" = a."assignedById"
      LEFT JOIN "User" revoker ON revoker."id" = a."revokedById"
      WHERE s."userId" = ${userId}
        AND s."status" = 'Active'::"StudentStatus"
        AND a."offeringId" = ${offeringId}
        AND a."revokedAt" IS NULL
      LIMIT 1
    `;
    return rows[0] ? assignmentView(rows[0]) : null;
  },

  async assertActiveForUser(
    userId: string,
    offeringId: string,
    allowedRoles: readonly ClassResponsibilityRole[] = ["ClassMonitor", "SubClassMonitor"],
  ): Promise<ClassResponsibilityView> {
    const assignment = await this.getActiveForUser(userId, offeringId);
    if (!assignment || !allowedRoles.includes(assignment.role)) {
      throw new ClassResponsibilityEligibilityError("You are not an active class monitor for this offering");
    }
    return assignment;
  },
};
