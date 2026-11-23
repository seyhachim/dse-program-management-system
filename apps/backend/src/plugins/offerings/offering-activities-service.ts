import { Prisma, type OfferingActivity } from "@prisma/client";
import {
  OfferingActivityEvidenceLinkSchema,
  type CreateOfferingActivityInput,
  type OfferingActivityAuditView,
  type OfferingActivityStatus,
  type OfferingActivityType,
  type OfferingActivityView,
  type UpdateOfferingActivityInput,
  validActivityTimeRange,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class OfferingActivityNotFoundError extends Error {}
export class OfferingActivityConflictError extends Error {}

function snapshot(row: OfferingActivity): Prisma.InputJsonValue {
  return {
    id: row.id, offeringId: row.offeringId, title: row.title, type: row.type,
    date: row.date.toISOString().slice(0, 10), startTime: row.startTime, endTime: row.endTime,
    host: row.host, location: row.location, description: row.description,
    objectives: row.objectives, reflectionPrompt: row.reflectionPrompt,
    evidenceLinks: row.evidenceLinks, status: row.status, version: row.version,
  } as Prisma.InputJsonValue;
}

function toView(row: OfferingActivity): OfferingActivityView {
  return {
    id: row.id,
    offeringId: row.offeringId,
    type: row.type as OfferingActivityType,
    title: row.title,
    date: row.date.toISOString().slice(0, 10),
    startTime: row.startTime,
    endTime: row.endTime,
    host: row.host,
    location: row.location,
    description: row.description,
    objectives: row.objectives,
    reflectionPrompt: row.reflectionPrompt,
    evidenceLinks: OfferingActivityEvidenceLinkSchema.array().parse(row.evidenceLinks),
    status: row.status as OfferingActivityStatus,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const offeringActivitiesService = {
  async list(offeringId: string): Promise<OfferingActivityView[]> {
    const rows = await prisma.offeringActivity.findMany({
      where: { offeringId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toView);
  },

  async get(offeringId: string, id: string): Promise<OfferingActivityView> {
    const row = await prisma.offeringActivity.findFirst({ where: { id, offeringId } });
    if (!row) throw new OfferingActivityNotFoundError("Course activity not found");
    return toView(row);
  },

  async create(offeringId: string, actorId: string, input: CreateOfferingActivityInput): Promise<OfferingActivityView> {
    const row = await prisma.$transaction(async (tx) => {
      const activity = await tx.offeringActivity.create({
        data: {
          offeringId,
          type: input.type,
          title: input.title,
          date: new Date(input.date + "T00:00:00.000Z"),
          startTime: input.startTime,
          endTime: input.endTime,
          host: input.host,
          location: input.location,
          description: input.description,
          objectives: input.objectives,
          reflectionPrompt: input.reflectionPrompt,
          evidenceLinks: input.evidenceLinks as Prisma.InputJsonValue,
          status: input.status,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await tx.offeringActivityAuditEvent.create({
        data: { activityId: activity.id, actorId, action: "created", after: snapshot(activity) },
      });
      return activity;
    });
    return toView(row);
  },

  async update(offeringId: string, id: string, actorId: string, input: UpdateOfferingActivityInput): Promise<OfferingActivityView> {
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.offeringActivity.findFirst({ where: { id, offeringId } });
      if (!before) throw new OfferingActivityNotFoundError("Course activity not found");
      if (before.status === "Archived") throw new OfferingActivityConflictError("Archived activities are read-only");
      if (before.version !== input.expectedVersion) {
        throw new OfferingActivityConflictError("Activity changed in another session. Reload before editing");
      }
      const { expectedVersion, ...changes } = input;
      const startTime = changes.startTime === undefined ? before.startTime : changes.startTime;
      const endTime = changes.endTime === undefined ? before.endTime : changes.endTime;
      if (!validActivityTimeRange(startTime, endTime)) {
        throw new OfferingActivityConflictError("End time must be after start time");
      }
      const data: Prisma.OfferingActivityUpdateManyMutationInput = {
        ...(changes.type !== undefined ? { type: changes.type } : {}),
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(changes.date !== undefined ? { date: new Date(changes.date + "T00:00:00.000Z") } : {}),
        ...(changes.startTime !== undefined ? { startTime: changes.startTime } : {}),
        ...(changes.endTime !== undefined ? { endTime: changes.endTime } : {}),
        ...(changes.host !== undefined ? { host: changes.host } : {}),
        ...(changes.location !== undefined ? { location: changes.location } : {}),
        ...(changes.description !== undefined ? { description: changes.description } : {}),
        ...(changes.objectives !== undefined ? { objectives: changes.objectives } : {}),
        ...(changes.reflectionPrompt !== undefined ? { reflectionPrompt: changes.reflectionPrompt } : {}),
        ...(changes.evidenceLinks !== undefined ? { evidenceLinks: changes.evidenceLinks as Prisma.InputJsonValue } : {}),
        ...(changes.status !== undefined ? { status: changes.status } : {}),
        updatedById: actorId,
        version: { increment: 1 },
      };
      const result = await tx.offeringActivity.updateMany({
        where: { id, offeringId, version: expectedVersion }, data,
      });
      if (result.count !== 1) {
        throw new OfferingActivityConflictError("Activity changed in another session. Reload before editing");
      }
      const after = await tx.offeringActivity.findUniqueOrThrow({ where: { id } });
      await tx.offeringActivityAuditEvent.create({
        data: {
          activityId: id, actorId,
          action: changes.status === "Archived" ? "archived" : "updated",
          before: snapshot(before), after: snapshot(after),
        },
      });
      return after;
    });
    return toView(row);
  },

  async history(offeringId: string, id: string): Promise<OfferingActivityAuditView[]> {
    const exists = await prisma.offeringActivity.findFirst({
      where: { id, offeringId }, select: { id: true },
    });
    if (!exists) throw new OfferingActivityNotFoundError("Course activity not found");
    const events = await prisma.offeringActivityAuditEvent.findMany({
      where: { activityId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return events.map((event) => ({
      id: event.id,
      action: event.action as OfferingActivityAuditView["action"],
      actorId: event.actorId,
      before: event.before,
      after: event.after,
      createdAt: event.createdAt.toISOString(),
    }));
  },
};
