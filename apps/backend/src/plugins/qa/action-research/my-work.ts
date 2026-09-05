import type {
  MyActionResearchView,
  ResearchAssignmentRole,
  ResearchAssignmentStatus,
  ResearchCycleStatus,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { nextActionForCycleStatus } from "./policy.ts";

interface MyActionResearchRow {
  assignmentId: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  assignedById: string;
  role: ResearchAssignmentRole;
  instructions: string;
  dueDate: Date | null;
  acceptedAt: Date | null;
  assignmentStatus: ResearchAssignmentStatus;
  createdAt: Date;
  updatedAt: Date;
  programmeId: string;
  title: string;
  problemStatement: string;
  academicYear: string;
  semester: string;
  currentStage: ResearchCycleStatus | null;
}

/**
 * Loads the participant workspace in one bounded-shape query. The previous
 * implementation fetched the assignment/project rows first and then issued a
 * current-cycle lookup for every assignment. Current stage is now projected in
 * the same SQL statement, eliminating that 1+N read pattern without changing
 * the participant response contract or authorization boundary.
 */
export async function listMyActionResearchOptimized(
  programmeId: string,
  userId: string,
): Promise<MyActionResearchView> {
  const rows = await prisma.$queryRaw<MyActionResearchRow[]>`
    SELECT
      a."id" AS "assignmentId",
      a."projectId",
      a."assigneeId",
      u."name" AS "assigneeName",
      a."assignedById",
      a."role",
      a."instructions",
      a."dueDate",
      a."acceptedAt",
      a."status" AS "assignmentStatus",
      a."createdAt",
      a."updatedAt",
      p."programmeId",
      p."title",
      p."problemStatement",
      p."academicYear",
      p."semester",
      (
        SELECT c."status"
        FROM "ActionResearchCycle" c
        WHERE c."projectId" = p."id"
        ORDER BY c."cycleNumber" DESC
        LIMIT 1
      ) AS "currentStage"
    FROM "ActionResearchAssignment" a
    JOIN "ActionResearchProject" p ON p."id" = a."projectId"
    JOIN "User" u ON u."id" = a."assigneeId"
    WHERE a."assigneeId" = ${userId}
      AND p."programmeId" = ${programmeId}
    ORDER BY a."updatedAt" DESC, a."id" DESC
  `;

  const assignments = rows.map((row) => {
    const stage = row.currentStage ?? "DRAFT";
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
      overdue: Boolean(
        row.dueDate &&
          row.dueDate.getTime() < Date.now() &&
          row.assignmentStatus !== "COMPLETED"
      ),
    };
  });

  return {
    assignments,
    counts: {
      assigned: assignments.filter((item) => item.status === "ASSIGNED").length,
      inProgress: assignments.filter((item) =>
        ["ACCEPTED", "IN_PROGRESS"].includes(item.status),
      ).length,
      needsRevision: assignments.filter((item) => item.status === "REVISION_REQUIRED").length,
      awaitingReview: assignments.filter((item) => item.status === "SUBMITTED").length,
      completed: assignments.filter((item) => item.status === "COMPLETED").length,
    },
  };
}
