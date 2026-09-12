import type {
  AssignResourceResponsibilityInput,
  CreateResourceLocationInput,
  CreateResourceTypeInput,
  EndResourceResponsibilityInput,
  HandoverResourceResponsibilityInput,
  RenewResourceResponsibilityInput,
  ResourceLocationView,
  ResourceResponsibilityAuditEventView,
  ResourceResponsibilityType,
  ResourceResponsibilityView,
  ResourceTypeView,
  UpdateResourceLocationInput,
  UpdateResourceTypeInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class ResourceNotFoundError extends Error {}
export class ResourceConflictError extends Error {}
export class ResourceEligibilityError extends Error {}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isActiveOn(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  on: Date = todayUtc(),
): boolean {
  return effectiveFrom <= on && (effectiveTo == null || effectiveTo >= on);
}

function previousDate(value: Date): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

async function assertProgramme(programmeId: string) {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true },
  });
  if (!programme) throw new ResourceNotFoundError("Programme not found");
}

async function assertEligibleStaffUser(programmeId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roleAssignments: { include: { role: true } } },
  });
  if (!user) throw new ResourceNotFoundError("User not found");

  const scopedRoles = user.roleAssignments.filter(
    (assignment) =>
      assignment.programmeId == null || assignment.programmeId === programmeId,
  );
  if (
    scopedRoles.length === 0 ||
    scopedRoles.every((assignment) => assignment.role.slug === "student")
  ) {
    throw new ResourceEligibilityError(
      "Resource responsibilities can only be assigned to staff with access to this programme",
    );
  }
  return user;
}

function resourceTypeView(row: {
  id: string;
  programmeId: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  trackingMode: "QUANTITY" | "SERIALIZED";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ResourceTypeView {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resourceLocationView(row: {
  id: string;
  programmeId: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ResourceLocationView {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ResponsibilityRow = Awaited<
  ReturnType<typeof prisma.resourceResponsibilityAssignment.findFirstOrThrow>
> & {
  user: { id: string; name: string; email: string };
  assignedBy: { id: string; name: string };
  location: { id: string; code: string; name: string } | null;
};

function responsibilityView(row: ResponsibilityRow): ResourceResponsibilityView {
  return {
    id: row.id,
    programmeId: row.programmeId,
    responsibility: row.responsibility,
    user: row.user,
    location: row.location,
    effectiveFrom: dateOnlyString(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? dateOnlyString(row.effectiveTo) : null,
    assignedBy: row.assignedBy,
    reason: row.reason,
    activeNow: isActiveOn(row.effectiveFrom, row.effectiveTo),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const responsibilityInclude = {
  user: { select: { id: true, name: true, email: true } },
  assignedBy: { select: { id: true, name: true } },
  location: { select: { id: true, code: true, name: true } },
} as const;

function lockKey(
  programmeId: string,
  responsibility: ResourceResponsibilityType,
  locationId: string | null,
): string {
  return `resource-responsibility:${programmeId}:${responsibility}:${locationId ?? "programme"}`;
}

async function lockResponsibilityScope(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  programmeId: string,
  responsibility: ResourceResponsibilityType,
  locationId: string | null,
) {
  const key = lockKey(programmeId, responsibility, locationId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

function overlapWhere(
  effectiveFrom: Date,
  effectiveTo: Date | null,
): {
  effectiveFrom: { lte: Date };
  OR: Array<{ effectiveTo: null } | { effectiveTo: { gte: Date } }>;
} {
  const farFuture = new Date("9999-12-31T00:00:00.000Z");
  return {
    effectiveFrom: { lte: effectiveTo ?? farFuture },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
  };
}

async function assertLocation(
  programmeId: string,
  locationId: string | null | undefined,
) {
  if (!locationId) return null;
  const location = await prisma.resourceLocation.findFirst({
    where: { id: locationId, programmeId },
    select: { id: true, active: true },
  });
  if (!location) throw new ResourceNotFoundError("Resource location not found");
  if (!location.active) {
    throw new ResourceConflictError("Inactive resource locations cannot receive new responsibilities");
  }
  return location;
}

export const resourceService = {
  async listTypes(programmeId: string): Promise<ResourceTypeView[]> {
    await assertProgramme(programmeId);
    const rows = await prisma.resourceType.findMany({
      where: { programmeId },
      orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
    });
    return rows.map(resourceTypeView);
  },

  async createType(
    programmeId: string,
    input: CreateResourceTypeInput,
  ): Promise<ResourceTypeView> {
    await assertProgramme(programmeId);
    const duplicate = await prisma.resourceType.findFirst({
      where: {
        programmeId,
        name: { equals: input.name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) throw new ResourceConflictError("Resource type name already exists");
    const row = await prisma.resourceType.create({ data: { programmeId, ...input } });
    return resourceTypeView(row);
  },

  async updateType(
    programmeId: string,
    id: string,
    input: UpdateResourceTypeInput,
  ): Promise<ResourceTypeView> {
    const current = await prisma.resourceType.findFirst({ where: { id, programmeId } });
    if (!current) throw new ResourceNotFoundError("Resource type not found");
    if (input.name && input.name.toLocaleLowerCase() !== current.name.toLocaleLowerCase()) {
      const duplicate = await prisma.resourceType.findFirst({
        where: {
          programmeId,
          id: { not: id },
          name: { equals: input.name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) throw new ResourceConflictError("Resource type name already exists");
    }
    const row = await prisma.resourceType.update({ where: { id }, data: input });
    return resourceTypeView(row);
  },

  async listLocations(programmeId: string): Promise<ResourceLocationView[]> {
    await assertProgramme(programmeId);
    const rows = await prisma.resourceLocation.findMany({
      where: { programmeId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    return rows.map(resourceLocationView);
  },

  async createLocation(
    programmeId: string,
    input: CreateResourceLocationInput,
  ): Promise<ResourceLocationView> {
    await assertProgramme(programmeId);
    const duplicate = await prisma.resourceLocation.findFirst({
      where: {
        programmeId,
        OR: [
          { code: { equals: input.code, mode: "insensitive" } },
          { name: { equals: input.name, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ResourceConflictError("Resource location code or name already exists");
    }
    const row = await prisma.resourceLocation.create({ data: { programmeId, ...input } });
    return resourceLocationView(row);
  },

  async updateLocation(
    programmeId: string,
    id: string,
    input: UpdateResourceLocationInput,
  ): Promise<ResourceLocationView> {
    const current = await prisma.resourceLocation.findFirst({ where: { id, programmeId } });
    if (!current) throw new ResourceNotFoundError("Resource location not found");

    if (input.code || input.name) {
      const duplicate = await prisma.resourceLocation.findFirst({
        where: {
          programmeId,
          id: { not: id },
          OR: [
            ...(input.code
              ? [{ code: { equals: input.code, mode: "insensitive" as const } }]
              : []),
            ...(input.name
              ? [{ name: { equals: input.name, mode: "insensitive" as const } }]
              : []),
          ],
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ResourceConflictError("Resource location code or name already exists");
      }
    }

    if (input.active === false && current.active) {
      const now = todayUtc();
      const activeResponsibility = await prisma.resourceResponsibilityAssignment.findFirst({
        where: {
          programmeId,
          locationId: id,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        select: { id: true },
      });
      if (activeResponsibility) {
        throw new ResourceConflictError(
          "End or hand over active location responsibilities before archiving this location",
        );
      }
    }

    const row = await prisma.resourceLocation.update({ where: { id }, data: input });
    return resourceLocationView(row);
  },

  async listResponsibilities(
    programmeId: string,
  ): Promise<ResourceResponsibilityView[]> {
    await assertProgramme(programmeId);
    const rows = await prisma.resourceResponsibilityAssignment.findMany({
      where: { programmeId },
      include: responsibilityInclude,
      orderBy: [{ responsibility: "asc" }, { effectiveFrom: "desc" }],
    });
    return rows.map((row) => responsibilityView(row as ResponsibilityRow));
  },

  async assignResponsibility(
    programmeId: string,
    input: AssignResourceResponsibilityInput,
    actorId: string,
  ): Promise<ResourceResponsibilityView> {
    await assertProgramme(programmeId);
    await assertEligibleStaffUser(programmeId, input.userId);
    await assertLocation(programmeId, input.locationId);

    const effectiveFrom = dateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
    const locationId = input.locationId ?? null;

    const created = await prisma.$transaction(async (tx) => {
      await lockResponsibilityScope(tx, programmeId, input.responsibility, locationId);

      const overlap = await tx.resourceResponsibilityAssignment.findFirst({
        where: {
          programmeId,
          responsibility: input.responsibility,
          ...(input.responsibility === "RESOURCE_COORDINATOR"
            ? {}
            : { userId: input.userId, locationId }),
          ...overlapWhere(effectiveFrom, effectiveTo),
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ResourceConflictError(
          input.responsibility === "RESOURCE_COORDINATOR"
            ? "A Resource Coordinator assignment already overlaps this period; use handover for a change of coordinator"
            : "This Lab Custodian assignment overlaps an existing assignment for the same user and location",
        );
      }

      const assignment = await tx.resourceResponsibilityAssignment.create({
        data: {
          programmeId,
          userId: input.userId,
          responsibility: input.responsibility,
          locationId,
          effectiveFrom,
          effectiveTo,
          assignedById: actorId,
          reason: input.reason,
        },
        include: responsibilityInclude,
      });
      await tx.resourceResponsibilityAuditEvent.create({
        data: {
          assignmentId: assignment.id,
          programmeId,
          actorId,
          action: "Assigned",
          reason: input.reason,
          details: {
            userId: input.userId,
            responsibility: input.responsibility,
            locationId,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
          },
        },
      });
      return assignment;
    });

    return responsibilityView(created as ResponsibilityRow);
  },

  async endResponsibility(
    programmeId: string,
    assignmentId: string,
    input: EndResourceResponsibilityInput,
    actorId: string,
  ): Promise<ResourceResponsibilityView> {
    const effectiveTo = dateOnly(input.effectiveTo);
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.resourceResponsibilityAssignment.findFirst({
        where: { id: assignmentId, programmeId },
        include: responsibilityInclude,
      });
      if (!current) throw new ResourceNotFoundError("Resource responsibility not found");
      if (effectiveTo < current.effectiveFrom) {
        throw new ResourceConflictError("End date cannot be before the assignment start date");
      }
      if (current.effectiveTo && effectiveTo.getTime() === current.effectiveTo.getTime()) {
        return current;
      }
      if (current.effectiveTo) {
        throw new ResourceConflictError(
          "This assignment already has an end date; use renewal to change the recorded period",
        );
      }

      await lockResponsibilityScope(
        tx,
        programmeId,
        current.responsibility,
        current.locationId,
      );
      const row = await tx.resourceResponsibilityAssignment.update({
        where: { id: assignmentId },
        data: { effectiveTo },
        include: responsibilityInclude,
      });
      await tx.resourceResponsibilityAuditEvent.create({
        data: {
          assignmentId,
          programmeId,
          actorId,
          action: "Ended",
          reason: input.reason,
          details: {
            previousEffectiveTo: null,
            effectiveTo: input.effectiveTo,
          },
        },
      });
      return row;
    });
    return responsibilityView(updated as ResponsibilityRow);
  },

  async renewResponsibility(
    programmeId: string,
    assignmentId: string,
    input: RenewResourceResponsibilityInput,
    actorId: string,
  ): Promise<ResourceResponsibilityView> {
    const newEnd = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.resourceResponsibilityAssignment.findFirst({
        where: { id: assignmentId, programmeId },
        include: responsibilityInclude,
      });
      if (!current) throw new ResourceNotFoundError("Resource responsibility not found");
      if (newEnd && newEnd < current.effectiveFrom) {
        throw new ResourceConflictError("Renewed end date cannot be before the start date");
      }

      await lockResponsibilityScope(
        tx,
        programmeId,
        current.responsibility,
        current.locationId,
      );

      const overlap = await tx.resourceResponsibilityAssignment.findFirst({
        where: {
          id: { not: assignmentId },
          programmeId,
          responsibility: current.responsibility,
          ...(current.responsibility === "RESOURCE_COORDINATOR"
            ? {}
            : { userId: current.userId, locationId: current.locationId }),
          ...overlapWhere(current.effectiveFrom, newEnd),
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ResourceConflictError(
          "Renewing this assignment would overlap another recorded responsibility period",
        );
      }

      const row = await tx.resourceResponsibilityAssignment.update({
        where: { id: assignmentId },
        data: { effectiveTo: newEnd },
        include: responsibilityInclude,
      });
      await tx.resourceResponsibilityAuditEvent.create({
        data: {
          assignmentId,
          programmeId,
          actorId,
          action: "Renewed",
          reason: input.reason,
          details: {
            previousEffectiveTo: current.effectiveTo
              ? dateOnlyString(current.effectiveTo)
              : null,
            effectiveTo: input.effectiveTo,
          },
        },
      });
      return row;
    });
    return responsibilityView(updated as ResponsibilityRow);
  },

  async handoverResponsibility(
    programmeId: string,
    assignmentId: string,
    input: HandoverResourceResponsibilityInput,
    actorId: string,
  ): Promise<{ outgoing: ResourceResponsibilityView; incoming: ResourceResponsibilityView }> {
    await assertEligibleStaffUser(programmeId, input.incomingUserId);
    const effectiveDate = dateOnly(input.effectiveDate);
    const outgoingEnd = previousDate(effectiveDate);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.resourceResponsibilityAssignment.findFirst({
        where: { id: assignmentId, programmeId },
        include: responsibilityInclude,
      });
      if (!current) throw new ResourceNotFoundError("Resource responsibility not found");
      if (current.userId === input.incomingUserId) {
        throw new ResourceConflictError("Handover requires a different incoming staff member");
      }
      if (effectiveDate <= current.effectiveFrom) {
        throw new ResourceConflictError("Handover date must be after the outgoing assignment start date");
      }
      if (current.effectiveTo && effectiveDate > current.effectiveTo) {
        throw new ResourceConflictError(
          "Handover date cannot be after the outgoing assignment has already ended",
        );
      }

      await lockResponsibilityScope(
        tx,
        programmeId,
        current.responsibility,
        current.locationId,
      );

      const overlap = await tx.resourceResponsibilityAssignment.findFirst({
        where: {
          id: { not: assignmentId },
          programmeId,
          responsibility: current.responsibility,
          ...(current.responsibility === "RESOURCE_COORDINATOR"
            ? {}
            : { userId: input.incomingUserId, locationId: current.locationId }),
          ...overlapWhere(effectiveDate, null),
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ResourceConflictError(
          "Incoming responsibility would overlap another recorded assignment",
        );
      }

      const outgoing = await tx.resourceResponsibilityAssignment.update({
        where: { id: assignmentId },
        data: { effectiveTo: outgoingEnd },
        include: responsibilityInclude,
      });
      const incoming = await tx.resourceResponsibilityAssignment.create({
        data: {
          programmeId,
          userId: input.incomingUserId,
          responsibility: current.responsibility,
          locationId: current.locationId,
          effectiveFrom: effectiveDate,
          assignedById: actorId,
          reason: input.reason,
        },
        include: responsibilityInclude,
      });

      const details = {
        outgoingAssignmentId: current.id,
        outgoingUserId: current.userId,
        incomingAssignmentId: incoming.id,
        incomingUserId: input.incomingUserId,
        responsibility: current.responsibility,
        locationId: current.locationId,
        effectiveDate: input.effectiveDate,
      };
      await tx.resourceResponsibilityAuditEvent.createMany({
        data: [
          {
            assignmentId: current.id,
            programmeId,
            actorId,
            action: "HandoverOut",
            reason: input.reason,
            details,
          },
          {
            assignmentId: incoming.id,
            programmeId,
            actorId,
            action: "HandoverIn",
            reason: input.reason,
            details,
          },
        ],
      });
      return { outgoing, incoming };
    });

    return {
      outgoing: responsibilityView(result.outgoing as ResponsibilityRow),
      incoming: responsibilityView(result.incoming as ResponsibilityRow),
    };
  },

  async responsibilityAudit(
    programmeId: string,
  ): Promise<ResourceResponsibilityAuditEventView[]> {
    await assertProgramme(programmeId);
    const rows = await prisma.resourceResponsibilityAuditEvent.findMany({
      where: { programmeId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      assignmentId: row.assignmentId,
      programmeId: row.programmeId,
      actor: row.actor,
      action: row.action,
      reason: row.reason,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  },
};

export type ResourceService = typeof resourceService;
