import { Prisma, type OfferingActivityParticipant } from "@prisma/client";
import type {
  CreateVisitParticipantInput,
  UpdateVisitParticipantInput,
  VisitParticipantView,
  VisitParticipantsWorkspace,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class VisitParticipantNotFoundError extends Error {}
export class VisitParticipantConflictError extends Error {}

async function ensureActivity(offeringId: string, activityId: string) {
  const activity = await prisma.offeringActivity.findFirst({
    where: { id: activityId, offeringId }, select: { id: true, status: true },
  });
  if (!activity) throw new VisitParticipantNotFoundError("Course activity not found");
  return activity;
}
function afterSnapshot(row: OfferingActivityParticipant): Prisma.InputJsonValue {
  return {
    id: row.id, activityId: row.activityId, studentId: row.studentId,
    externalName: row.externalName, externalRole: row.externalRole,
    goStatus: row.goStatus, returnStatus: row.returnStatus,
    farmStatus: row.farmStatus, source: row.source,
    note: row.note, version: row.version,
  } as Prisma.InputJsonValue;
}
function toView(row: OfferingActivityParticipant & { student?: { name: string } | null }): VisitParticipantView {
  return {
    id: row.id, activityId: row.activityId, studentId: row.studentId,
    studentName: row.student?.name ?? null,
    externalName: row.externalName, externalRole: row.externalRole,
    goStatus: row.goStatus as VisitParticipantView["goStatus"],
    returnStatus: row.returnStatus as VisitParticipantView["returnStatus"],
    farmStatus: row.farmStatus as VisitParticipantView["farmStatus"],
    source: row.source as VisitParticipantView["source"],
    note: row.note, version: row.version,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
export const visitParticipantsService = {
  async list(offeringId: string, activityId: string): Promise<VisitParticipantsWorkspace> {
    await ensureActivity(offeringId, activityId);
    const [enrollments, rows] = await Promise.all([
      prisma.enrollment.findMany({
        where: { offeringId },
        select: { student: { select: { id: true, name: true, studentId: true } } },
      }),
      prisma.offeringActivityParticipant.findMany({
        where: { activityId }, include: { student: { select: { name: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      roster: enrollments.map((e) => ({
        id: e.student.id, name: e.student.name, studentNumber: e.student.studentId,
      })).sort((a,b) => a.name.localeCompare(b.name)),
      participants: rows.map(toView),
    };
  },

  async create(offeringId: string, activityId: string, actorId: string, input: CreateVisitParticipantInput): Promise<VisitParticipantView> {
    const activity = await ensureActivity(offeringId, activityId);
    if (activity.status === "Archived") throw new VisitParticipantConflictError("Archived activities are read-only");
    if (input.studentId) {
      const enrollment = await prisma.enrollment.findFirst({
        where: { offeringId, studentId: input.studentId }, select: { id: true },
      });
      if (!enrollment) throw new VisitParticipantConflictError("Student is not enrolled in this course offering");
    }
    const row = await prisma.$transaction(async (tx) => {
      const participant = await tx.offeringActivityParticipant.create({
        data: {
          activityId, studentId: input.studentId ?? null,
          externalName: input.externalName ?? null,
          externalRole: input.externalName ? (input.externalRole ?? "Other") : null,
          goStatus: input.goStatus, returnStatus: input.returnStatus,
          farmStatus: input.farmStatus, source: input.source, note: input.note,
          createdById: actorId, updatedById: actorId,
        },
      });
      await tx.offeringActivityParticipantAudit.create({
        data: { participantId: participant.id, actorId, action: "created", after: afterSnapshot(participant) },
      });
      return participant;
    });
    return toView(row);
  },

  async update(offeringId: string, activityId: string, id: string, actorId: string, input: UpdateVisitParticipantInput): Promise<VisitParticipantView> {
    const activity = await ensureActivity(offeringId, activityId);
    if (activity.status === "Archived") throw new VisitParticipantConflictError("Archived activities are read-only");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.offeringActivityParticipant.findFirst({ where: { id, activityId } });
      if (!before) throw new VisitParticipantNotFoundError("Participant not found in this activity");
      if (before.version !== input.expectedVersion) throw new VisitParticipantConflictError("Participant record changed; reload first");
      const nextSource = input.source ?? before.source;
      const nextFarmStatus = input.farmStatus ?? before.farmStatus;
      if (nextFarmStatus === "Confirmed" && nextSource !== "HostVerified") {
        throw new VisitParticipantConflictError("Trip check-in does not establish Sindora on-site attendance");
      }
      const data: Prisma.OfferingActivityParticipantUncheckedUpdateManyInput = {
        ...(input.goStatus !== undefined ? { goStatus: input.goStatus } : {}),
        ...(input.returnStatus !== undefined ? { returnStatus: input.returnStatus } : {}),
        ...(input.farmStatus !== undefined ? { farmStatus: input.farmStatus } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.externalRole !== undefined && !before.studentId ? { externalRole: input.externalRole } : {}),
        updatedById: actorId, version: { increment: 1 },
      };
      const applied = await tx.offeringActivityParticipant.updateMany({
        where: { id, activityId, version: input.expectedVersion }, data,
      });
      if (!applied.count) throw new VisitParticipantConflictError("Participant record changed; reload first");
      const after = await tx.offeringActivityParticipant.findUniqueOrThrow({ where: { id } });
      await tx.offeringActivityParticipantAudit.create({
        data: { participantId: id, actorId, action: "updated", before: afterSnapshot(before), after: afterSnapshot(after) },
      });
      return after;
    });
    return toView(row);
  },
};
